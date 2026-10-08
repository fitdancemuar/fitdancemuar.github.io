/* R66 / R78 - FIT Dance service worker (deploy/build-site.js fills VERSION = the build id, and SHELL). Caches ONLY the app shell
   (the three pages, manifests, icons); every other request goes straight to the network untouched. It never sees the API:
   POSTs and other origins (script.google.com, script.googleusercontent.com, fonts, cdnjs) are not intercepted, and neither is
   version.json (the page's "is there a newer build?" check, R78).
   R78 - updates show at once:
   - pages (HTML) are NETWORK-FIRST: a fresh copy from the network every time; the cached copy is only the offline fallback (or
     used when the network has not answered within NET_WAIT ms - the page then sees the newer build via version.json and reloads);
   - the cache name carries the build id, so a new build installs a new shell (fetched past the HTTP cache) and old caches go;
   - the new worker takes over at once (skipWaiting + clients.claim). */
var VERSION = "ac0500ea2868";
var SHELL = ["./","./manifest.webmanifest","./staff/","./staff/manifest.webmanifest","./partners/","./partners/manifest.webmanifest","./icons/icon-32.png","./icons/icon-180.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-512-maskable.png"];
var CACHE = 'fda-shell-' + VERSION;
var NET_WAIT = 4000;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); })); // never the browser's HTTP-cached old copy
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('fda-shell-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function shellPath(url) {
  var base = new URL('./', self.location.href).pathname; // the site root ('/' on fitdancemuar.github.io)
  var rel = './' + url.pathname.slice(base.length);
  if (url.pathname.indexOf(base) !== 0) return null;
  if (rel === './index.html') rel = './';
  if (/^\.\/(staff|partners)\/index\.html$/.test(rel)) rel = rel.replace(/index\.html$/, '');
  return SHELL.indexOf(rel) >= 0 ? rel : null;
}
function isPage(rel) { return rel === './' || /\/$/.test(rel); }

/** Network first; the cached copy only when the network fails (offline) or is slower than NET_WAIT and a copy exists. */
function networkFirst(c, key, req) {
  var net = fetch(req.mode === 'navigate' ? key : req, { cache: 'no-cache' }).then(function (res) {
    if (res && res.ok) c.put(key, res.clone());
    return res;
  });
  return new Promise(function (resolve, reject) {
    var done = false, timer = null;
    function fallback(err) {
      return c.match(key).then(function (hit) {
        if (done) return;
        if (hit) { done = true; resolve(hit); } else if (err) { done = true; reject(err); }
      });
    }
    net.then(function (res) { if (timer) clearTimeout(timer); if (!done) { done = true; resolve(res); } },
      function (err) { if (timer) clearTimeout(timer); if (!done) fallback(err || new Error('offline')); });
    timer = setTimeout(function () { timer = null; if (!done) fallback(null); }, NET_WAIT);
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (x) { return; }
  if (url.origin !== self.location.origin) return;
  var rel = shellPath(url);
  if (!rel) return;
  var key = new URL(rel, self.location.href).href; // one cache entry per page whatever the ?m= query
  e.respondWith(caches.open(CACHE).then(function (c) {
    if (req.mode === 'navigate' || isPage(rel)) return networkFirst(c, key, req);
    // manifests and icons: this build's copy (the cache is per build), else the network
    return c.match(key).then(function (hit) {
      return hit || fetch(req).then(function (res) { if (res && res.ok) c.put(key, res.clone()); return res; });
    });
  }));
});
