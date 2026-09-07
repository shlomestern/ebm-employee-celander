# Setting up the shared calendar

Do this once. When you're done, anyone you send the link to opens the calendar on their phone and everyone sees the same bookings.

Two parts: **Firebase** holds the bookings, **GitHub Pages** puts the calendar online. Both are free.

Total time: about 15 minutes.

---

## Part 1 — Firebase (the bookings)

### 1. Make the project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project**.
3. Name it `EBM Crew Calendar`. Click Continue.
4. On the Google Analytics step, switch it **off**. You don't need it. Click **Create project**.
5. Wait for it to finish, then click **Continue**.

### 2. Turn on the database

1. In the left menu, click **Build → Firestore Database**.
2. Click **Create database**.
3. Choose a location close to Montreal — **nam5 (us-central)** or **northamerica-northeast1** are both fine. You cannot change this later.
4. Choose **Start in production mode**. Click **Create**.

### 3. Set the rules

Production mode blocks everything by default, so the calendar needs rules that let it read and write.

1. At the top of the Firestore page, click the **Rules** tab.
2. Delete everything in the box and paste this in:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // The crew calendar: bookings and the crew names.
    match /bookings/{doc} {
      allow read, write: if true;
    }
    match /config/{doc} {
      allow read, write: if true;
    }

    // Nothing else in this project is reachable.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Click **Publish**.

**What this means:** anybody who has your calendar link can read and change bookings. That's the trade-off for "no login, just open it on your phone." The passcode in Part 2 keeps out people who stumble on the link, and nothing else in the Firebase project is exposed. If you later want real accounts per person, tell me and I'll wire that up instead.

### 4. Get your six settings

1. Click the **gear icon** at the top of the left menu → **Project settings**.
2. Scroll to **Your apps** and click the **web icon** — it looks like `</>`.
3. App nickname: `Crew Calendar`. Do **not** tick "Firebase Hosting". Click **Register app**.
4. Firebase shows you a block of code. You want the six lines inside `firebaseConfig`:

```
apiKey: "AIza...."
authDomain: "ebm-crew-calendar.firebaseapp.com"
projectId: "ebm-crew-calendar"
storageBucket: "ebm-crew-calendar.appspot.com"
messagingSenderId: "123456789012"
appId: "1:123456789012:web:abc123..."
```

Leave that page open — you need those in a minute.

---

## Part 2 — Put the settings in the calendar

1. Go to your repo: **https://github.com/shlomestern/ebm-employee-celander**
2. Open the file **`config.js`**.
3. Click the **pencil icon** to edit it.
4. Paste each of the six values between the quote marks. Keep the quotes.
5. If you want a passcode, put it on the `passcode` line, for example `passcode: "empire25"`. Leave it as `""` for none.
6. Scroll down, click **Commit changes**.

That's the only file you ever have to touch.

---

## Part 3 — Put the calendar online

1. In the repo, click **Settings** (top right of the repo, not your account settings).
2. In the left menu, click **Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Pick the branch, leave the folder as **/ (root)**, click **Save**.
5. Wait about a minute, then refresh the page. GitHub shows you the address, something like:

   `https://shlomestern.github.io/ebm-employee-celander/`

That's the link you send to Rodrigo, Zion and the electrician. Tell them to add it to their home screen — on an iPhone, Share → Add to Home Screen — and it opens like an app.

---

## Checking it worked

Open the link. Top right should say **"Shared — everyone with the link"** with a green dot.

- Says **"Saved on this device only"** with an orange dot → the Firebase settings in `config.js` aren't filled in, or one of the six values has a typo.
- A booking gives you an error about rules → the rules in Part 1 step 3 weren't published.

Book a test hour, then open the link on your phone. If it shows up there too, you're done. Cancel the test booking.

---

## Cost

Firebase's free tier covers 50,000 reads and 20,000 writes a day. A three-person crew calendar uses a tiny fraction of that. GitHub Pages is free. You will not get a bill, and no credit card is asked for.

## If something breaks

Tell me what the page says and I'll fix it. Nothing here is permanent — the whole calendar is one HTML file in your repo.
