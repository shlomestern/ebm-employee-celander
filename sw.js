/* EBM Crew Calendar service worker.
   Bump CACHE when the app shell changes so phones pick up the new version. */
var CACHE = "ebm-crew-v44";
var SHELL = [
  "./", "./index.html", "./config.js", "./projects.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "./icons/maskable-512.png", "./icons/badge-96.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(SHELL);
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // Firestore and the Firebase SDK must always go to the network.
  if (url.origin !== self.location.origin) return;

  // Network first so a deploy reaches phones on the next open; cache is the
  // fallback that keeps the app usable with no signal.
  e.respondWith(
    fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); });
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        return hit || caches.match("./index.html");
      });
    })
  );
});

/* ---- background notifications ----------------------------------------
   Only wires up once a vapidKey is set in config.js. Wrapped because these
   scripts come off the network: a phone installing the app on bad signal must
   still get a working service worker for caching. */
try {
  importScripts("./config.js");
  var FB = self.EBM_CONFIG && self.EBM_CONFIG.firebase;
  var VAPID = self.EBM_CONFIG && self.EBM_CONFIG.vapidKey;
  if (FB && FB.apiKey && VAPID) {
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
    firebase.initializeApp(FB);
    firebase.messaging().onBackgroundMessage(function(payload){
      // Anything carrying a notification block has already been put on screen
      // by the SDK itself. Showing it again here was posting every job twice,
      // under two different tags, so neither one replaced the other.
      if (payload && payload.notification) return;
      var d = (payload && payload.data) || {};
      self.registration.showNotification(d.title || "New job", {
        body: d.body || "",
        icon: "./icons/icon-192.png",
        badge: "./icons/badge-96.png",
        tag: d.tag || "ebm-job"
      });
    });
  }
} catch (e) {
  /* no notifications this session; caching still works */
}

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(list){
    for (var i=0;i<list.length;i++){
      if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) return list[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
  }));
});
