# EBM Crew Calendar

A clean booking calendar for the Empire Building Management field crew.

**Crew**

| Person | Trade |
| --- | --- |
| Rodrigo | Plumbing |
| Zion | Plumbing |
| *(electrician — name editable in the app)* | Electrical |

## What it does

**Everyone has their own code.** The code is the login: it decides who you are and what you can open. The office code opens the full calendar; a crew code opens only that person's own schedule and cannot reach the office view.

**The office manages everyone from inside the app** — the **Crew & codes** button. Add someone, name them, give them a code, and pick what they are:

| Role | What they get |
| --- | --- |
| Plumbing / Electrical | Their own jobs only. Clock in, clock out, notes. No calendar. |
| Admin (office) | The whole calendar — plus two tickboxes for what they may do: **book and cancel jobs**, and **add people and change codes**. |

**A booking belongs to whoever made it.** Only that person can cancel it, and every job card says who booked it. The office code from `config.js` is the exception — it can cancel anything, because somebody has to be able to.

Everyone sees their own name at the top of the app, the office included — set yours under **Your name** in the same editor.

Two people can't share a code, and nobody can be saved without one. The roster lives in the database so a change reaches every phone; each device also caches it so codes still work with no signal.

**One calendar, for everyone.** A month grid where each day shows the project number and unit. Click a day to see what's on it.

- The **office** gets the crew down the side and can switch between them, add jobs, and cancel their own.
- **Crew** get the same calendar showing only their own work. No crew column, no adding, no cancelling — they open a day, read the job, clock in, clock out, and leave notes.

A job is booked against a real property: pick the **project** (23 companies), then the **building** (the list narrows to that project's addresses), then the **unit**. Choose **all day** or a **from–to** time inside 8:00 AM – 5:00 PM. Double-booking a crew member is refused.

Anyone — office or crew — can add notes to a job. Past days are locked, and Saturdays and Sundays read "Off".

If the app can't reach the network it says **No connection** and shows the last data saved on that device, rather than hanging or pretending the schedule is empty.

**Installs like an app.** Android Chrome offers "Install app"; on iPhone it's Share → Add to Home Screen. It then opens full screen with its own icon, and the app shell is cached so it still opens with no signal.

## Phone notifications

When a job is booked, that crew member's phone can buzz even with the app closed. It is off until a `vapidKey` is set in `config.js` and the Cloud Function in `functions/` is deployed — **[NOTIFICATIONS.md](NOTIFICATIONS.md)** walks through both, and the deploy is done from a browser with nothing to install.

Turn them on per phone from the avatar in the top right. On iPhone the app has to be added to the Home Screen first, which is Apple's rule, not ours.

## The property list

`projects.js` holds 23 projects and 59 buildings, generated from *EBM  All Projects Info 10.xlsx*. Each project carries its number, company name, manager and manager's phone; each building its address, city and postal code. Edit that file to add a building or a project — the format is one line per building.

## Making it shared

Out of the box the calendar keeps bookings in whoever's browser opened it. To make it a real shared calendar — one link, everyone sees the same thing — fill in `config.js` and switch on GitHub Pages.

**Step-by-step instructions: [SETUP.md](SETUP.md).** About 15 minutes, free, no credit card.

Once that's done the top right of the page says *"Shared — everyone with the link"* and bookings appear on everyone's phone within seconds.

`config.js` holds only the **office** code. It is deliberately the one code that lives in the file rather than the app, so a typo made inside the app can never lock the office out of its own calendar — it always works. Everyone else is managed in the app.

Each person types their code once and their phone remembers it; **Sign out** clears it.

Be clear-eyed about what these codes are: they live in the page's JavaScript, so anyone who knows how to view a page's source can read all of them. They stop crew members casually opening each other's or the office's view. They are **not** account security. The same goes for the permission tickboxes and for who owns a booking: they decide what the app offers you, and the database itself does not enforce them. Someone who knows how to talk to Firestore directly could go around all of it.

For real enforcement you want proper logins — Firebase Authentication with a Firestore rule per person — which is a bigger job and gives every worker a username and password to manage.

## Where the bookings live

The app picks its storage automatically:

| Where it's running | Bookings go to |
| --- | --- |
| GitHub Pages with `config.js` filled in | Your Firebase database — shared with everyone |
| Published as a Claude Artifact | Claude's store — shared inside your Claude workspace |
| Anywhere else, or `config.js` left blank | That one browser only, and the page says so |

Bookings are stored one document per crew-member-day, with an hour-keyed `slots` map merged on write, so two people booking different hours of the same day never overwrite each other.

## Editing it

Everything lives in `index.html` — no build step, no install, nothing to compile. Open it in an editor, change it, refresh the browser. `config.js` holds your settings and is the only file you need for setup.

Common tweaks, near the top of the `<script>` block in `index.html`:

- `DAY_START` / `DAY_END` — the working day, as 24-hour numbers. `8` and `17` mean 8:00 AM to 5:00 PM.
- `CREW` — add or remove a crew member. Each needs a unique `id`, a `name`, and a `trade` of `plumbing` or `electrical`.

The other files: `config.js` (Firebase settings and the passcode), `projects.js` (properties), `manifest.webmanifest` and `sw.js` (what makes it installable). After changing `index.html`, bump `CACHE` in `sw.js` so phones pick up the new version.
