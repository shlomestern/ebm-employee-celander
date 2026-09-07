/* ---------------------------------------------------------------
   EBM Crew Calendar — settings

   Fill this in once and the calendar is shared: everyone who opens
   the link sees the same bookings.

   Step-by-step instructions are in SETUP.md.
   --------------------------------------------------------------- */

window.EBM_CONFIG = {

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

  /* Who can open the app, and what each of them sees.

     Each person gets their OWN code. The code is the login — it decides who
     you are and what you can open. A crew code opens only that person's own
     schedule; it cannot reach the office calendar. Change any of these to
     whatever you like, then tell that person their new code.

     Anyone whose code you blank out ("") can no longer get in. */
  access: {
    office:      "empire65",
    rodrigo:     "rd7412",
    zion:        "zn5836",
    electrician: "el2947"
  }
};
