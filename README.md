# EBM Crew Calendar

A clean booking calendar for the Empire Building Management field crew.

**Crew**

| Person | Trade |
| --- | --- |
| Rodrigo | Plumbing |
| Zion | Plumbing |
| *(electrician — name editable in the app)* | Electrical |

## What it does

- **Crew list down the side** — click a name and that person's calendar comes up. The calendar takes on their trade's color.
- **Month calendar** — a plain month grid, every day showing that person's booked hours.
- **Book an hour** — click a day to see its hours, then Book. Fill in customer/building, phone, address and the job.
- **Book a whole day** — one button on the day view; it holds every open hour and leaves already-taken hours alone.
- **Cancel** — open the day and cancel any booked hour.
- **Crew names** — the electrician's name (or anyone's) can be changed in the app under **Crew names**.
- Hours in the past are locked automatically.

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

Common tweaks, all near the top of the `<script>` block:

- `HOURS` — the bookable hours. `[8,9,10,11,12,13,14,15,16]` means 8:00 AM through the 4:00 PM slot, ending at 5:00 PM.
- `DEFAULT_CREW` — add or remove a crew member. Give each one a unique `id`, a `name`, and a `trade` of `plumbing` or `electrical`.
