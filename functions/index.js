/* Sends a phone notification when a job is booked for someone.
 *
 * Runs on Firebase. Deploy with:
 *   firebase deploy --only functions --project ebm-crew-calendar
 *
 * Phones register themselves in config/tokens as { tokens: { <token>: <personId> } }.
 * That collection is used because the Firestore rules already allow config/*,
 * so no rule change is needed to turn notifications on.
 */
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");

initializeApp();

// Same region as the Firestore database, so a trigger is not a round trip
// across the continent before the phone hears anything.

const HOURS = (h) => {
  const ap = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:00 ${ap}`;
};

/** Everyone registered in config/tokens, split into crew and office. */
async function audience(db) {
  const [tokensSnap, crewSnap] = await Promise.all([
    db.doc("config/tokens").get(),
    db.doc("config/crew").get(),
  ]);
  const map = (tokensSnap.exists && tokensSnap.data().tokens) || {};
  const people = (crewSnap.exists && crewSnap.data().people) || [];
  const officeIds = new Set(["office"]);
  people.forEach((p) => { if (p.trade === "admin") officeIds.add(p.id); });
  return {
    map,
    people,
    forPerson: (id) => Object.keys(map).filter((t) => map[t] === id),
    forOffice: () => Object.keys(map).filter((t) => officeIds.has(map[t])),
  };
}

/** Sends, then forgets tokens the device has thrown away. */
async function push(db, map, tokens, title, body, tag) {
  if (!tokens.length) return 0;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: {title, body},
    webpush: {
      notification: {
        icon: "/ebm-employee-celander/icons/icon-192.png",
        // Android throws the badge's colours away and keeps the alpha, so a
        // full-colour square arrives as a solid white block. This one is the
        // EBM mark cut out of nothing.
        badge: "/ebm-employee-celander/icons/badge-96.png",
        tag,
      },
      fcmOptions: {link: "https://shlomestern.github.io/ebm-employee-celander/"},
    },
  });
  const dead = new Set();
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token") dead.add(tokens[i]);
  });
  if (dead.size) {
    const kept = {};
    Object.keys(map).forEach((t) => { if (!dead.has(t)) kept[t] = map[t]; });
    await db.doc("config/tokens").set({tokens: kept});
  }
  return res.successCount;
}

/** The next job that day for the same person, so a hold-up can name what it
 *  is about to delay. Two equality filters need no composite index; the sort
 *  is done here rather than asking Firestore for one. */
async function nextJobAfter(db, job) {
  const snap = await db.collection("bookings")
    .where("crewId", "==", job.crewId)
    .where("date", "==", job.date)
    .get();
  return snap.docs
    .map((d) => d.data())
    .filter((j) => j.v === 2 && j.id !== job.id && j.from >= job.to)
    .sort((a, b) => a.from - b.from)[0] || null;
}

/** The office hears when a crew member starts, stops, or finishes. */
exports.notifyOfficeOnClock = onDocumentUpdated(
  {document: "bookings/{jobId}", region: "northamerica-northeast1"},
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (after.v !== 2) return;

    const startedNow = !before.clockIn && !!after.clockIn;
    const endedNow = !before.clockOut && !!after.clockOut;
    const lateBefore = (before.late && before.late.at) || "";
    const lateNow = !!after.late && after.late.at !== lateBefore;
    if (!startedNow && !endedNow && !lateNow) return;

    const db = getFirestore();
    const aud = await audience(db);
    const person = aud.people.find((p) => p.id === after.crewId);
    const who = person ? person.name : after.crewId;
    const where = after.buildingName + (after.unit ? ` · Unit ${after.unit}` : "");

    // A hold-up is not general news: it goes to whoever booked the job he is
    // standing on and whoever booked the one he is about to be late for,
    // because between them they are the ones who can move something. The
    // office hears it too, since it owns the day.
    if (lateNow) {
      const next = await nextJobAfter(db, after);
      const ids = new Set(aud.forOffice().map((t) => aud.map[t]));
      ids.add("office");
      if (after.createdById) ids.add(after.createdById);
      if (next && next.createdById) ids.add(next.createdById);
      const tokens = Object.keys(aud.map).filter((t) => ids.has(aud.map[t]));

      const nextWhere = next
        ? next.buildingName + (next.unit ? ` · Unit ${next.unit}` : "")
        : "";
      const body = `${where} · needs until ${HOURS(after.late.until)}` +
        (next ? ` · next: ${nextWhere} at ${HOURS(next.from)}` : " · nothing after it");

      const sent = await push(db, aud.map, tokens, `${who} running late`, body,
        `${event.params.jobId}-late`);
      logger.info(`${who} running late until ${after.late.until} — ` +
        `notified ${sent} phone(s)${next ? ", next job affected" : ", nothing after it"}`);
      return;
    }

    const used = (after.used || [])
      .map((u) => (u.qty ? `${u.qty} × ${u.item}` : u.item))
      .join(", ");
    const title = endedNow ? `${who} finished` : `${who} clocked in`;
    const body = endedNow
      ? `${where} · ${used ? `used ${used}` : "nothing used"}`
      : `${where} · started ${HOURS(after.from)}`;

    const sent = await push(db, aud.map, aud.forOffice(), title, body,
      `${event.params.jobId}-${endedNow ? "out" : "in"}`);
    logger.info(`${title} — notified ${sent} office phone(s)`);
  }
);

/** A message reaches the other side of its thread.
 *
 *  Threads live in one document keyed by crew member, with the whole office
 *  on the other side, so the direction is decided by who sent it: the crew
 *  member's own messages go to the office, anybody else's go to him.
 */
exports.notifyOnMessage = onDocumentUpdated(
  {document: "config/chats", region: "northamerica-northeast1"},
  async (event) => {
    const before = (event.data.before.data() || {}).threads || {};
    const after = (event.data.after.data() || {}).threads || {};

    const db = getFirestore();
    const aud = await audience(db);
    const officeTokens = new Set(aud.forOffice());

    for (const crewId of Object.keys(after)) {
      const now = Array.isArray(after[crewId]) ? after[crewId] : [];
      const was = Array.isArray(before[crewId]) ? before[crewId] : [];
      // arrayUnion appends, so anything past the old length is new.
      const fresh = now.slice(was.length);
      if (!fresh.length) continue;

      const last = fresh[fresh.length - 1];
      const person = aud.people.find((p) => p.id === crewId);
      const crewName = person ? person.name : crewId;

      const fromCrew = last.by === crewId;
      const tokens = fromCrew
        ? aud.forOffice()
        : aud.forPerson(crewId).filter((t) => !officeTokens.has(t));

      const title = fromCrew ? `${crewName}: message` : `${last.name || "Office"}: message`;
      const body = fresh.length > 1
        ? `${last.text} (+${fresh.length - 1} more)`
        : last.text;

      const sent = await push(db, aud.map, tokens, title, body, `chat-${crewId}`);
      logger.info(`message in ${crewId} thread from ${last.by} — notified ${sent} phone(s)`);
    }
  }
);

exports.notifyCrewOnNewJob = onDocumentCreated(
  {document: "bookings/{jobId}", region: "northamerica-northeast1"},
  async (event) => {
    const job = event.data && event.data.data();
    if (!job || job.v !== 2 || !job.crewId) return;

    const db = getFirestore();
    const aud = await audience(db);
    const tokens = aud.forPerson(job.crewId);
    if (!tokens.length) {
      logger.info(`no registered phone for ${job.crewId}`);
      return;
    }

    const when = job.allDay ? "All day" : `${HOURS(job.from)} – ${HOURS(job.to)}`;
    const where = job.buildingName + (job.unit ? ` · Unit ${job.unit}` : "");
    const sent = await push(db, aud.map, tokens,
      `New job — ${job.date}`, `${when} · ${where}`, event.params.jobId);

    const person = aud.people.find((p) => p.id === job.crewId);
    logger.info(`told ${person ? person.name : job.crewId}: ${sent} delivered`);
  }
);
