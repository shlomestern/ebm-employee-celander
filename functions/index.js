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
        icon: "/ebm-employee-celander/icons/ebm-192-v2.png",
        badge: "/ebm-employee-celander/icons/ebm-192-v2.png",
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

/** The office hears when a crew member starts, stops, or finishes. */
exports.notifyOfficeOnClock = onDocumentUpdated(
  {document: "bookings/{jobId}", region: "us-central1"},
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (after.v !== 2) return;

    const startedNow = !before.clockIn && !!after.clockIn;
    const endedNow = !before.clockOut && !!after.clockOut;
    if (!startedNow && !endedNow) return;

    const db = getFirestore();
    const aud = await audience(db);
    const person = aud.people.find((p) => p.id === after.crewId);
    const who = person ? person.name : after.crewId;
    const where = after.buildingName + (after.unit ? ` · Unit ${after.unit}` : "");

    const title = endedNow ? `${who} finished` : `${who} clocked in`;
    const body = endedNow
      ? `${where} · job done`
      : `${where} · started ${HOURS(after.from)}`;

    const sent = await push(db, aud.map, aud.forOffice(), title, body,
      `${event.params.jobId}-${endedNow ? "out" : "in"}`);
    logger.info(`${title} — notified ${sent} office phone(s)`);
  }
);

exports.notifyCrewOnNewJob = onDocumentCreated(
  {document: "bookings/{jobId}", region: "us-central1"},
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
