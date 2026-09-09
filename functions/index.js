/* Sends a phone notification when a job is booked for someone.
 *
 * Runs on Firebase. Deploy with:
 *   firebase deploy --only functions --project ebm-crew-calendar
 *
 * Phones register themselves in config/tokens as { tokens: { <token>: <personId> } }.
 * That collection is used because the Firestore rules already allow config/*,
 * so no rule change is needed to turn notifications on.
 */
const {onDocumentCreated, onDocumentUpdated, onDocumentWritten} =
  require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
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

/* Montreal. The date on a booking is the local one the office saw when it
 * was made, so "today" has to be worked out in the same place. */
const ZONE = "America/Toronto";
const DATE_IN_ZONE = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const TIME_IN_ZONE = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
});
/** Minutes since midnight, where the crew are. */
function minutesNow() {
  const [h, m] = TIME_IN_ZONE.format(new Date()).split(":").map(Number);
  return (h * 60) + m;
}

/** Twenty minutes of grace for traffic and parking. Past three hours a job
 *  is history rather than something the office can still rescue, and
 *  chasing it would only mean a pile of stale alerts. */
const GRACE_MINUTES = 20;
const STALE_MINUTES = 180;

/** Nobody has clocked in and the job was due: the office and whoever booked
 *  it hear about it once, while a phone call still helps.
 */
exports.chaseLateStarts = onSchedule(
  {schedule: "*/15 8-17 * * *", timeZone: ZONE, region: "northamerica-northeast1"},
  async () => {
    const db = getFirestore();
    const date = DATE_IN_ZONE.format(new Date());
    const now = minutesNow();

    const snap = await db.collection("bookings").where("date", "==", date).get();
    const overdue = snap.docs.filter((d) => {
      const j = d.data();
      if (j.v !== 2 || j.clockIn || j.clockOut || j.lateAlert) return false;
      const behind = now - (j.from * 60);
      return behind >= GRACE_MINUTES && behind <= STALE_MINUTES;
    });
    if (!overdue.length) return;

    const aud = await audience(db);
    for (const doc of overdue) {
      const j = doc.data();
      const person = aud.people.find((p) => p.id === j.crewId);
      const who = person ? person.name : j.crewId;
      const where = j.buildingName + (j.unit ? ` · Unit ${j.unit}` : "");
      const behind = now - (j.from * 60);

      // The office and whoever booked it — not every admin on the roster.
      const ids = new Set(["office"]);
      if (j.createdById) ids.add(j.createdById);
      const tokens = Object.keys(aud.map).filter((t) => ids.has(aud.map[t]));

      const sent = await push(db, aud.map, tokens, `${who} has not started`,
        `${where} · due ${HOURS(j.from)} · ${behind} min late`,
        `latestart-${doc.id}`);
      // Marked either way, so a job with nobody to tell is not chased forever.
      await doc.ref.update({lateAlert: new Date().toISOString()});
      logger.info(`${who} ${behind} min late at ${where} — notified ${sent} phone(s)`);
    }
  }
);

/** The morning list as it reads on a lock screen: a few lines and a count,
 *  not a report. Pure, so it can be checked without a database.
 */
function morningText(list, nameOf) {
  const sorted = list.slice().sort((a, b) => a.from - b.from);
  const lines = sorted.slice(0, 4).map((j) => {
    const when = j.allDay ? "All day" : `${HOURS(j.from)}–${HOURS(j.to)}`;
    const where = j.buildingName + (j.unit ? ` · Unit ${j.unit}` : "");
    return `${nameOf(j.crewId)} · ${when} · ${where}`;
  });
  if (sorted.length > lines.length) {
    lines.push(`+${sorted.length - lines.length} more`);
  }
  return {
    title: sorted.length === 1
      ? "Today: 1 job you booked"
      : `Today: ${sorted.length} jobs you booked`,
    body: lines.join("\n"),
  };
}

/** Seven in the morning: whoever booked somebody today hears about it while
 *  there is still time to move things. One message each, not one per job.
 */
exports.morningReminder = onSchedule(
  {schedule: "0 7 * * *", timeZone: ZONE, region: "northamerica-northeast1"},
  async () => {
    const db = getFirestore();
    const date = DATE_IN_ZONE.format(new Date());

    const snap = await db.collection("bookings").where("date", "==", date).get();
    const jobs = snap.docs.map((d) => d.data()).filter((j) => j.v === 2);
    if (!jobs.length) {
      logger.info(`nothing booked for ${date}`);
      return;
    }

    const aud = await audience(db);
    const name = (id) => {
      const p = aud.people.find((x) => x.id === id);
      return p ? p.name : id;
    };

    // Grouped by whoever booked it. Bookings from before authors were
    // recorded fall to the office, which is where they came from.
    const byBooker = new Map();
    for (const j of jobs) {
      const who = j.createdById || "office";
      if (!byBooker.has(who)) byBooker.set(who, []);
      byBooker.get(who).push(j);
    }

    for (const [booker, list] of byBooker) {
      const tokens = aud.forPerson(booker);
      if (!tokens.length) {
        logger.info(`${booker} booked ${list.length} today — no registered phone`);
        continue;
      }
      const {title, body} = morningText(list, name);
      const sent = await push(db, aud.map, tokens, title, body, `morning-${date}`);
      logger.info(`morning list to ${booker}: ${list.length} job(s), ${sent} phone(s)`);
    }
  }
);

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

/** A message reaches the one person it was written to.
 *
 *  Each conversation is its own document, named chat-<a>__<b> after the two
 *  people in it, so who to tell is simply the other half of that name. The
 *  trigger covers all of config because the document appears the first time
 *  somebody writes; anything that is not a conversation is dropped at once.
 */
exports.notifyOnMessage = onDocumentWritten(
  {document: "config/{docId}", region: "northamerica-northeast1"},
  async (event) => {
    const id = event.params.docId;
    if (!id.startsWith("chat-")) return;

    const before = (event.data.before.exists && event.data.before.data()) || {};
    const after = (event.data.after.exists && event.data.after.data()) || {};
    const was = Array.isArray(before.msgs) ? before.msgs : [];
    const now = Array.isArray(after.msgs) ? after.msgs : [];
    // arrayUnion appends, so anything past the old length is new.
    const fresh = now.slice(was.length);
    if (!fresh.length) return;

    const pair = id.slice(5).split("__");
    const last = fresh[fresh.length - 1];
    const to = pair.find((p) => p !== last.by);
    if (!to) return;

    const db = getFirestore();
    const aud = await audience(db);
    const tokens = aud.forPerson(to);
    if (!tokens.length) {
      logger.info(`message for ${to} — no registered phone`);
      return;
    }

    const body = fresh.length > 1
      ? `${last.text} (+${fresh.length - 1} more)`
      : last.text;
    const sent = await push(db, aud.map, tokens, last.name || "Message", body, id);
    logger.info(`message from ${last.by} to ${to} — notified ${sent} phone(s)`);
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
