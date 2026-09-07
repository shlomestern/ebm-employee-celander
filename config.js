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
    apiKey:            "",
    authDomain:        "",
    projectId:         "",
    storageBucket:     "",
    messagingSenderId: "",
    appId:             ""
  },

  /* Optional passcode. Anyone opening the calendar types it once and the
     phone remembers it. Leave it as "" for no passcode.
     It keeps strangers who stumble on the link out — it is not a password
     vault, so don't reuse a real password here. */
  passcode: ""
};
