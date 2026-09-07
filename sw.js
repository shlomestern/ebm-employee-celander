/* EBM Crew Calendar service worker.
   Bump CACHE when the app shell changes so phones pick up the new version. */
var CACHE = "ebm-crew-v3";
var SHELL = [
  "./", "./index.html", "./config.js", "./projects.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
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
