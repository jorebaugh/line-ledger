// Offline support. The whole app is cached as one version, so a phone never mixes old and new files.
// When you change any file, bump APP_VERSION in config.js and VERSION here to match (a test checks).
const VERSION = 'line-ledger-0.6.3';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'rules.js',
  'css/app.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/banks.js',
  'js/core.js',
  'js/feedback.js',
  'js/install.js',
  'js/k401.js',
  'js/paymath.js',
  'js/pdftext.js',
  'js/recap.js',
  'js/retire.js',
  'js/sample.js',
  'js/store.js',
  'js/stub.js',
  'js/ui.js',
  'js/view.js',
  'js/screens/banks.js',
  'js/screens/feedback.js',
  'js/screens/home.js',
  'js/screens/intake.js',
  'js/screens/k401.js',
  'js/screens/pay.js',
  'js/screens/profile-form.js',
  'js/screens/retire.js',
  'js/screens/settings.js',
  'js/screens/stub-sheet.js',
];

// crewport.co used to run Crewport Car Share, whose offline worker also lived at /sw.js. When this
// worker replaces one that isn't Line Ledger's (no line-ledger cache yet), it takes over right away
// instead of waiting, so old Car Share visitors land on Line Ledger. Line Ledger updates still wait
// for the user's "Reload".
const OLD_APP_CACHES = ['crewport-'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => caches.keys())
    .then((keys) => { if (!keys.some((k) => k.startsWith('line-ledger-') && k !== VERSION)) self.skipWaiting(); }));
});

self.addEventListener('activate', (e) => {
  const stale = (k) => (k.startsWith('line-ledger-') && k !== VERSION) || OLD_APP_CACHES.some((p) => k.startsWith(p));
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter(stale).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page asks the new version to take over when the user taps "Reload".
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only this site's own files. Feedback and anything else off-site goes straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch {
        if (req.mode === 'navigate') return cache.match('index.html');
        throw new Error('offline');
      }
    }),
  );
});
