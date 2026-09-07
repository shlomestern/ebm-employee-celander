/* Sends a phone notification when a job is booked for someone.
 *
 * Runs on Firebase. Deploy with:
 *   firebase deploy --only functions --project ebm-crew-calendar
 *
 * Phones register themselves in config/tokens as { tokens: { <token>: <personId> } }.
 * That collection is used because the Firestore rules already allow config/*,
 * so no rule change is needed to turn notifications on.
 */
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
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

exports.notifyCrewOnNewJob = onDocumentCreated(
  {document: "bookings/{jobId}", region: "us-central1"},
  async (event) => {
    const job = event.data && event.data.data();
    if (!job || job.v !== 2 || !job.crewId) return;

    const db = getFirestore();
    const [tokensSnap, crewSnap] = await Promise.all([
      db.doc("config/tokens").get(),
      db.doc("config/crew").get(),
    ]);

    const map = (tokensSnap.exists && tokensSnap.data().tokens) || {};
    const tokens = Object.keys(map).filter((t) => map[t] === job.crewId);
    if (!tokens.length) {
      logger.info(`no registered phone for ${job.crewId}`);
      return;
    }

    const people = (crewSnap.exists && crewSnap.data().people) || [];
    const person = people.find((p) => p.id === job.crewId);
    const when = job.allDay ? "All day" : `${HOURS(job.from)} – ${HOURS(job.to)}`;
    const where = job.buildingName + (job.unit ? ` · Unit ${job.unit}` : "");

    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: `New job — ${job.date}`,
        body: `${when} · ${where}`,
      },
      webpush: {
        notification: {
          icon: "/ebm-employee-celander/icons/icon-192.png",
          badge: "/ebm-employee-celander/icons/icon-192.png",
          tag: event.params.jobId,
        },
        fcmOptions: {link: "https://shlomestern.github.io/ebm-employee-celander/"},
      },
    });

    logger.info(
      `notified ${person ? person.name : job.crewId}: ` +
      `${res.successCount} delivered, ${res.failureCount} failed`
    );

    // Drop tokens the device has thrown away, so the list stays clean.
    // Rewrite the whole map rather than using dotted field paths: an FCM token
    // is not a safe field-path segment.
    const dead = new Set();
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") {
        dead.add(tokens[i]);
      }
    });
    if (dead.size) {
      const kept = {};
      Object.keys(map).forEach((t) => { if (!dead.has(t)) kept[t] = map[t]; });
      await db.doc("config/tokens").set({tokens: kept});
      logger.info(`removed ${dead.size} dead token(s)`);
    }
  }
);
