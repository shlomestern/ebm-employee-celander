# Turning on phone notifications

Notifications run both ways, and all of it works with the app closed:

- **A crew member** is told when a job is booked for them.
- **The office** is told when a crew member clocks in, and again when they clock out and the job is finished.

Two steps. The first is three clicks. The second is a one-off deploy, done entirely in your browser.

---

## Step 1 — get the Web Push key

1. Firebase console → **gear icon → Project settings**
2. Click the **Cloud Messaging** tab
3. Scroll to **Web Push certificates** → **Generate key pair**
4. Copy the long key it shows you

Paste it into `config.js` on the `vapidKey` line, or send it to Claude and it gets committed for you:

```js
vapidKey: "BEl...the long key..."
```

Until that line is filled in, notifications stay off and nothing else changes.

---

## Step 2 — deploy the notifier

This is a small program that runs on Firebase and watches for new jobs. It lives in `functions/`.

You don't need to install anything. Google Cloud Shell is a terminal in your browser, already signed in as you.

1. Open **https://console.cloud.google.com/?cloudshell=true&project=ebm-crew-calendar**
   (make sure you're signed in as `ebmteam220@gmail.com` — add `&authuser=1` if not)
2. Wait for the terminal at the bottom to be ready, then paste these one at a time:

```bash
git clone https://github.com/shlomestern/ebm-employee-Celander- ebm
cd ebm && git checkout claude/employee-scheduling-calendar-rz9f5d
```

```bash
npx -y firebase-tools@latest login --no-localhost
```

That prints a link. Open it, sign in, approve, copy the code it gives you, paste it back in the terminal.

```bash
cd functions && npm install && cd ..
```

```bash
npx -y firebase-tools@latest deploy --only functions --project ebm-crew-calendar
```

It will ask to enable a few Google APIs the first time — say **yes**. Deploying takes two or three minutes. You're done when it prints `Deploy complete!`.

You only ever do this once, unless the notification text itself changes.

---

## Checking it works

1. Open the calendar on a crew member's phone and sign in with **their** code.
2. Tap the round avatar top right → **Turn on notifications** → **Allow**. Do this on every phone that should get them, the office phone included.
3. On your computer, sign in as the office and book them a job.
4. Their phone should buzz within a few seconds.

**On iPhone this only works if the app was added to the Home Screen first** (the Install app button → Share → Add to Home Screen). Apple does not allow notifications from a page sitting in a Safari tab. Android works either way, but installing is better anyway.

## What it costs

Nothing in practice. The free allowance is two million function runs a month; you'll use a few hundred. Firebase Cloud Messaging itself is free on every plan.

## If a phone stops getting them

Phones throw tokens away sometimes — after a reinstall, or a long time unused. The app re-registers each time that person opens it, and the notifier deletes dead tokens on its own. Opening the app once fixes it.

## Where things are

- `functions/index.js` — the notifier. Sends when a job is created, and only to phones registered to that crew member.
- `sw.js` — receives the notification when the app is closed.
- `index.html` — registers the phone after a crew member signs in.
- Registered phones are listed in Firestore under `config/tokens`.
