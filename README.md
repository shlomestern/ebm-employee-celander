# EBM Crew Calendar

A clean booking calendar for the Empire Building Management field crew.

**Crew**

| Person | Trade |
| --- | --- |
| Rodrigo | Plumbing |
| Zion | Plumbing |
| *(electrician — name editable in the app)* | Electrical |

## What it does

**Office view** — the crew down the side, a month calendar for whoever is selected, and a day sheet for adding jobs.

**Worker view** — each person sees only their own upcoming jobs, and can clock in, clock out, and leave notes.

A job is booked against a real property: pick the **project** (23 companies), then the **building** (the list narrows to that project's addresses), then the **unit**. Choose **all day** or a **from–to** time inside 8:00 AM – 5:00 PM. Double-booking a crew member is refused.

Anyone — office or crew — can add notes to a job. Past days are locked.

**Installs like an app.** Android Chrome offers "Install app"; on iPhone it's Share → Add to Home Screen. It then opens full screen with its own icon, and the app shell is cached so it still opens with no signal.

## The property list

`projects.js` holds 23 projects and 59 buildings, generated from *EBM  All Projects Info 10.xlsx*. Each project carries its number, company name, manager and manager's phone; each building its address, city and postal code. Edit that file to add a building or a project — the format is one line per building.

## Making it shared

Out of the box the calendar keeps bookings in whoever's browser opened it. To make it a real shared calendar — one link, everyone sees the same thing — fill in `config.js` and switch on GitHub Pages.

**Step-by-step instructions: [SETUP.md](SETUP.md).** About 15 minutes, free, no credit card.

Once that's done the top right of the page says *"Shared — everyone with the link"* and bookings appear on everyone's phone within seconds.

`config.js` also holds an optional passcode. Anyone opening the calendar types it once and their phone remembers it. It keeps out people who stumble on the link; it is not real security, and it is visible to anyone who reads the page source.

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
