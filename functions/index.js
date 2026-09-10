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

/* The days the crew are not expected in, so the office is not told at seven
 * in the morning that everybody is free on Yom Kippur. The same table the app
 * marks the calendar with; Node carries the Hebrew calendar itself. */
const YOM_TOV = {
  Tishri: {1: 1, 2: 1, 10: 1, 15: 1, 16: 1, 22: 1, 23: 1},
  Nisan: {15: 1, 16: 1, 21: 1, 22: 1},
  Sivan: {6: 1, 7: 1},
};
let HEB = null;
try {
  HEB = new Intl.DateTimeFormat("en-u-ca-hebrew",
    {day: "numeric", month: "long", timeZone: ZONE});
} catch (e) { HEB = null; }
function isYomTov(when) {
  if (!HEB) return false;
  let mo = "";
  let dy = 0;
  try {
    HEB.formatToParts(when).forEach((part) => {
      if (part.type === "month") mo = part.value;
      if (part.type === "day") dy = parseInt(part.value, 10);
    });
  } catch (e) { return false; }
  return !!(YOM_TOV[mo] && YOM_TOV[mo][dy]);
}

/** Who has nothing on at all, as it reads on a lock screen. Pure, so it can
 *  be checked without a database. */
function freeText(free, booked, jobCount) {
  const names = free.length === 1 ? free[0]
    : free.slice(0, -1).join(", ") + " and " + free[free.length - 1];
  return {
    title: `Free today: ${names}`,
    body: booked
      ? `Nothing booked for them today. The rest of the crew have ` +
        `${jobCount} job${jobCount === 1 ? "" : "s"} on.`
      : "Nothing is booked for anybody today.",
  };
}

/** Seven in the morning, weekdays: anybody with no bookings at all today is
 *  named to the whole office, while there is still a day to fill.
 */
exports.freeToday = onSchedule(
  {schedule: "0 7 * * 1-5", timeZone: ZONE, region: "northamerica-northeast1"},
  async () => {
    const db = getFirestore();
    const now = new Date();
    const date = DATE_IN_ZONE.format(now);
    if (isYomTov(now)) {
      logger.info(`${date} is Yom Tov — nobody is expected in`);
      return;
    }

    const [snap, aud] = await Promise.all([
      db.collection("bookings").where("date", "==", date).get(),
      audience(db),
    ]);
    const jobs = snap.docs.map((d) => d.data()).filter((j) => j.v === 2);
    const busy = new Set(jobs.map((j) => j.crewId));

    // The men on the tools. An admin is not booked onto jobs, so an admin is
    // not free in any sense worth telling anybody about.
    const crew = aud.people.filter((p) => p.trade !== "admin");
    const free = crew.filter((p) => !busy.has(p.id));
    if (!crew.length || !free.length) {
      logger.info(`${date}: all ${crew.length} of the crew are booked`);
      return;
    }

    const tokens = aud.forOffice();
    if (!tokens.length) {
      logger.info(`${free.length} free on ${date} — no office phone registered`);
      return;
    }
    const {title, body} = freeText(free.map((p) => p.name), jobs.length > 0, jobs.length);
    const sent = await push(db, aud.map, tokens, title, body, `free-${date}`);
    logger.info(`free on ${date}: ${free.map((p) => p.name).join(", ")} ` +
      `— told ${sent} phone(s)`);
  }
);

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

/** When the break that just ended ended, straight from the document rather
 *  than from the clock this trigger happens to run on. */
function closedEnd(job) {
  const done = ((job && job.breaks) || []).filter((b) => b.to);
  return done.length ? done[done.length - 1].to : "";
}
/** The break still running on a job, if there is one: the last with no end. */
function openBreak(job) {
  const list = (job && job.breaks) || [];
  const last = list[list.length - 1];
  return last && !last.to ? last : null;
}
/** The English of a stored reason. The app keeps the reason as a key and the
 *  worker's own words separately, so it reads in the reader's language there;
 *  a notification has one language and this is it. */
const WHY_EN = {
  "Getting materials": "getting materials",
  "On another job": "on another job",
  "Break": "on a break",
};
function whyOf(br) {
  const head = WHY_EN[(br && br.why) || ""] || "on a break";
  const note = (br && br.note) || "";
  return note ? `${head} — ${note}` : head;
}
function awayFor(br, endIso) {
  const t0 = Date.parse((br && br.from) || "");
  if (!t0) return "a while";
  const t1 = Date.parse(endIso || "") || Date.now();
  const mins = Math.max(0, Math.round((t1 - t0) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
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
    // A break opening or closing. Clocking out closes one at the same moment,
    // and that is a finish, not a return — so it is left to the finish below.
    const heldBefore = openBreak(before);
    const heldNow = openBreak(after);
    const pausedNow = !!heldNow && !heldBefore;
    const backNow = !heldNow && !!heldBefore && !endedNow;
    if (!startedNow && !endedNow && !lateNow && !pausedNow && !backNow) return;

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

    // Where he has gone, and for how long he was away. Straight to the whole
    // office: somebody who is off buying a part is somebody whose afternoon
    // may need moving.
    if (pausedNow || backNow) {
      const title = pausedNow ? `${who} paused` : `${who} is back on it`;
      const body = pausedNow
        ? `${where} · ${whyOf(heldNow)}`
        : `${where} · away ${awayFor(heldBefore, closedEnd(after))} · ` +
          `${whyOf(heldBefore)}`;
      const sent = await push(db, aud.map, aud.forOffice(), title, body,
        `${event.params.jobId}-${pausedNow ? "pause" : "back"}`);
      logger.info(`${title} — notified ${sent} office phone(s)`);
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

/** An ask for somebody else's worker, and the answer to it.
 *
 *  The whole list lives in one document, so what changed is whatever is in
 *  the new list and was not in the old one — by id, and by state, since a
 *  request is answered in place rather than replaced.
 */
exports.notifyOnRequest = onDocumentWritten(
  {document: "config/requests", region: "northamerica-northeast1"},
  async (event) => {
    const was = new Map(((event.data.before.data() || {}).list || [])
      .map((r) => [r.id, r]));
    const now = ((event.data.after.data() || {}).list || []);
    const fresh = now.filter((r) => !was.has(r.id) && r.state === "open");
    const answered = now.filter((r) => {
      const b = was.get(r.id);
      return b && b.state === "open" && r.state !== "open";
    });
    if (!fresh.length && !answered.length) return;

    const db = getFirestore();
    const aud = await audience(db);
    const hours = (r) => {
      const n = r.to - r.from;
      return `${n} hour${n === 1 ? "" : "s"}`;
    };
    const where = (r) => r.buildingName + (r.unit ? ` · Unit ${r.unit}` : "");

    // The ask goes to whoever has to answer it, nobody else.
    for (const r of fresh) {
      const ids = new Set(r.askIds || []);
      const tokens = Object.keys(aud.map).filter((t) => ids.has(aud.map[t]));
      const sent = await push(db, aud.map, tokens,
        `${r.by} is asking for ${r.crewName}`,
        `${hours(r)} · ${HOURS(r.from)}–${HOURS(r.to)} · ${where(r)} · ${r.job}`,
        `req-${r.id}`);
      logger.info(`request ${r.id} from ${r.byId} — asked ${sent} phone(s)`);
    }
    // The answer goes back to the one who asked.
    for (const r of answered) {
      const tokens = aud.forPerson(r.byId);
      const yes = r.state === "approved";
      const what = r.how === "cancel"
        ? "the other work was dropped"
        : "the other work moved later";
      const sent = await push(db, aud.map, tokens,
        yes
          ? `${r.decidedBy} agreed — ${r.crewName} is yours`
          : `${r.decidedBy} said no to ${r.crewName}`,
        yes
          ? `${HOURS(r.from)}–${HOURS(r.to)} · ${where(r)} · ${what}`
          : `${HOURS(r.from)}–${HOURS(r.to)} · ${where(r)}`,
        `reqans-${r.id}`);
      logger.info(`request ${r.id} ${r.state} by ${r.decidedById} — ` +
        `told ${sent} phone(s)`);
    }
  }
);

/** A ringing phone. The call document appears named after the pair, the same
 *  as a conversation, and the one being called is told at once — a call that
 *  waits for somebody to open the app is not a call.
 */
exports.notifyOnCall = onDocumentWritten(
  {document: "config/{docId}", region: "northamerica-northeast1"},
  async (event) => {
    const id = event.params.docId;
    if (!id.startsWith("call-")) return;
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    // Only the moment it starts ringing, not every candidate trickled in.
    if (after.state !== "ringing" || before.state === "ringing") return;
    if (!after.to) return;

    const db = getFirestore();
    const aud = await audience(db);
    const tokens = aud.forPerson(after.to);
    const sent = await push(db, aud.map, tokens,
      `${after.fromName || "Somebody"} is calling`,
      "Open the app to answer", `ring-${id}`);
    logger.info(`ring ${id} to ${after.to} — ${sent} phone(s)`);
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
