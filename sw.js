/* EBM Crew Calendar service worker.
   Bump CACHE when the app shell changes so phones pick up the new version. */
var CACHE = "ebm-crew-v58";
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
  //
  // The page and its scripts are asked for with the browser's own HTTP cache
  // bypassed. GitHub serves them with ten minutes of freshness, so without
  // this the network request is answered out of that cache and a phone keeps
  // running the old app while appearing to have reloaded — the crew have no
  // reason to know a hard reload exists. Images are left alone; they are the
  // heavy ones and they change with their filename.
  var fresh = /\.(?:html|js|webmanifest)$|\/$/.test(url.pathname)
    ? new Request(req.url, {cache: "reload", credentials: "same-origin"})
    : req;

  e.respondWith(
    fetch(fresh).catch(function(){ return fetch(req); }).then(function(res){
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

/* ---- notifications ---------------------------------------------------
   A push from Firebase is an ordinary web push carrying JSON, so it is read
   here directly. The SDK used to be pulled off Google's CDN at worker
   startup to do this, which meant a slow or blocked fetch left the worker
   with no push handler at all: the job vanished, and the server still
   recorded it as delivered. Nothing is fetched now, so the only way a job
   goes unseen is if it never reached the device.

   The title is filled in even when the payload cannot be read, so silence
   always means the push did not arrive. */
self.addEventListener("push", function(e){
  var p = {};
  try { p = e.data ? e.data.json() : {}; } catch (err) { p = {}; }
  var n = p.notification || (p.data && p.data.notification) || p.data || {};
  e.waitUntil(self.registration.showNotification(n.title || "New job", {
    body: n.body || "",
    icon: "./icons/icon-192.png",
    badge: "./icons/badge-96.png",
    tag: n.tag || "ebm-job"
  }));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(list){
    for (var i=0;i<list.length;i++){
      if (list[i].url.indexOf(self.registration.scope) === 0 && "focus" in list[i]) return list[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
  }));
});
