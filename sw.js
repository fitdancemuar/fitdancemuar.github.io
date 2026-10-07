/* R66 - FIT Dance service worker (deploy/build-site.js fills VERSION and SHELL). Caches ONLY the app shell (the three pages,
   manifests, icons) for an instant open; every other request goes straight to the network untouched. It never sees the API:
   POSTs and other origins (script.google.com, script.googleusercontent.com, fonts, cdnjs) are not intercepted.
   Pages: stale-while-revalidate (open from the cache at once, fetch a fresh copy for next time). A new build has a new VERSION,
   so the new shell is installed and old caches are removed. */
var VERSION = "6a749b4defaf";
var SHELL = ["./","./manifest.webmanifest","./staff/","./staff/manifest.webmanifest","./partners/","./partners/manifest.webmanifest","./icons/icon-32.png","./icons/icon-180.png","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-512-maskable.png"];
var CACHE = 'fda-shell-' + VERSION;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
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
    return c.match(key).then(function (hit) {
      var net = fetch(req.mode === 'navigate' ? key : req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) c.put(key, res.clone());
        return res;
      });
      if (hit) { net.catch(function () { /* offline: the cached shell is enough */ }); return hit; }
      return net;
    });
  }));
});
