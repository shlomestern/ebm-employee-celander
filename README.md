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

## The two ways to run it

The whole app is one file, `index.html`. It stores bookings differently depending on where it runs:

1. **Published as a Claude Artifact** — bookings are shared. Everyone who opens the link sees the same calendar live, and a booking made on one phone shows up on everyone else's within seconds. This is the version to send to the team. Viewers have to be signed in to the Empire Building Management workspace.
2. **Anywhere else** (GitHub Pages, opened from a file, any web host) — bookings are saved in that one browser only. Good for trying it out; not for real scheduling, and the app says so at the top of the page.

## Publishing on GitHub Pages

Repo **Settings → Pages → Source: Deploy from a branch**, pick the branch and `/ (root)`, save. The calendar lands at
`https://shlomestern.github.io/ebm-employee-Celander-/`.

Remember it will be the device-only version there — see above.

## Editing it

Everything lives in `index.html`: no build step, no dependencies, no install. Open it in an editor, change it, refresh the browser.

Common tweaks, all near the top of the `<script>` block:

- `HOURS` — the bookable hours. `[8,9,10,11,12,13,14,15,16]` means 8:00 AM through the 4:00 PM slot, ending at 5:00 PM.
- `DEFAULT_CREW` — add or remove a crew member. Give each one a unique `id`, a `name`, and a `trade` of `plumbing` or `electrical`.
