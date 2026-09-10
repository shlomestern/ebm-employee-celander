/* ---------------------------------------------------------------
   EBM Crew Calendar — settings

   Fill this in once and the calendar is shared: everyone who opens
   the link sees the same bookings.

   Step-by-step instructions are in SETUP.md.
   --------------------------------------------------------------- */

self.EBM_CONFIG = {   /* self, not window: the service worker reads this file too */

  /* Paste the six values Firebase gives you.
     Firebase console → gear icon → Project settings → Your apps → Web app.
     Keep the quotes. */
  firebase: {
    apiKey:            "AIzaSyC8BJmam80xIJKX1fwA650b_-LRANkyt7U",
    authDomain:        "ebm-crew-calendar.firebaseapp.com",
    projectId:         "ebm-crew-calendar",
    storageBucket:     "ebm-crew-calendar.firebasestorage.app",
    messagingSenderId: "525924907190",
    appId:             "1:525924907190:web:5673ae7b2c8c7eecdb0e17"
  },

  /* The office code. This one lives here, in the file, so a typo made inside
     the app can never lock you out of your own calendar — it always works.

     Everyone else's name and code is managed inside the app: sign in as the
     office and use the "Crew & codes" button. */
  access: {
    office: "empire65"
  },

  /* Phone notifications. Paste the Web Push certificate key pair from
     Firebase console → Project settings → Cloud Messaging → Web Push
     certificates → Generate key pair. Leave "" and notifications stay off. */
  vapidKey: "BJKLqsvXz4E6Lpu7Q5vX8iMKY3hdPOMTTfZTi-1If5bCdd22XrpAJT8Moybx2BH7yzmOMiWgOoWlcUNdwiZt7nQ",

  /* Video calls, on mobile networks.

     A call goes straight between the two phones wherever it can. On some
     mobile networks it cannot, and then it needs a relay to carry the
     picture — without one those calls say "no route between the two phones".
     A relay is a paid service; paste the details a provider gives you here
     and nothing else has to change. Leave it empty and calls still work on
     wi-fi and on most networks.

     turn: [
       {urls: "turn:your-relay:3478", username: "user", credential: "secret"}
     ] */
  turn: []
};
