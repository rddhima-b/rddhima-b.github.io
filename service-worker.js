const CACHE_NAME = "carpool-v1"; // name of OUR cache, can change name when you want to update cache or files

const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/main.js",
  "/Request.js",
  "/manifest.json"
];
// these are the files the app needs to run
// these are downloaded once and stored in the browser locally
// served even when user is offline

self.addEventListener("install", event => {
  event.waitUntil( // tells browser to finish caching before installing
    // if caching fails, service-worker installation fails
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});
// opens the cache, only runs when the service worker is first installed
// downloads files in ASSETS
// stores locally

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
});
// runs when a new version of s-w takes over
// gets list of all cache names and deletes caches not carpool-v1
// important because otherwise the old js files will stay cached forever
// why we got the issues with page not updating without ts

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(res => res || fetch(event.request))
  );
});
// intercepts all network requests our pwa makes
// requests a file, and s-w checks if it alr has it cached
//    if it is cached then it returns the cached version
//    if not, then it fetches from the internet