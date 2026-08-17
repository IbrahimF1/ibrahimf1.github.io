/* ============================================================
   SERVICE WORKER — offline cache + instant repeat visits
   ------------------------------------------------------------
   Self-hosted Workbox runtime (vendor/workbox/) — no third-party
   importScripts dependency. A failed importScripts aborts the whole
   script before any fallback could run, so none is attempted.
   Same-origin assets are served stale-while-revalidate (instant,
   then quietly updated); the HTML shell is network-first so deploys
   always land. PWA installable; works fully offline. New versions
   wait for a SKIP_WAITING message instead of seizing control.
   ============================================================ */
importScripts('vendor/workbox/workbox-sw.js');

workbox.setConfig({ modulePathPrefix: 'vendor/workbox/', debug: false });
workbox.core.setCacheNameDetails({ prefix: 'if-portfolio', suffix: 'v2' });

workbox.core.clientsClaim();
workbox.precaching.cleanupOutdatedCaches();
workbox.navigationPreload.enable();

// Update flow: activate immediately only when a controlled page asks
// the waiting worker to take over (official Workbox pattern).
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Cache hygiene: on activate, drop ANY 'if-portfolio*' cache that is
// not part of the current expected set — covers precache suffix bumps
// and renamed/retired strategy caches from older deploys. (Strategy
// cacheName strings are used verbatim by Workbox, so only the precache
// name carries the -v2 suffix.)
const EXPECTED_CACHES = [
    'if-portfolio-precache-v2',
    'if-portfolio-data',
    'if-portfolio-pages',
    'if-portfolio-assets'
];
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => Promise.all(
            names
                .filter((name) => name.startsWith('if-portfolio') && !EXPECTED_CACHES.includes(name))
                .map((name) => caches.delete(name))
        ))
    );
});

// Offline fallback page, precached with a revision so it is available
// on the very first offline navigation. The revision is the sha256 of
// offline.html, kept in sync by tools/prerender.mjs — do not hand-edit.
workbox.precaching.precacheAndRoute([{ url: 'offline.html', revision: 'fb0189f9883fa84fd80a66740b10d294275ebe4403dd40d56b42609d551617c2' }]);

// Data payloads (data.yaml, diary YAML, markdown posts): served
// instantly from cache, revalidated in the background. Function
// matcher — anchored to same-origin, non-navigation requests so the
// route can never capture cross-origin traffic or page navigations.
// Registered BEFORE the asset route; fetch() has destination "" so the
// asset route would otherwise never capture these.
workbox.routing.registerRoute(
    ({ url, request }) =>
        url.origin === self.location.origin &&
        request.mode !== 'navigate' &&
        /\.md$|\.yaml$/.test(url.pathname),
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'if-portfolio-data',
        plugins: [new workbox.expiration.ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 30 * 24 * 60 * 60
        })]
    }),
    'GET'
);

// HTML navigations: network-first (3s timeout) so new deploys show up
// immediately but still load offline from cache; if the network fails
// and the page was never cached, serve the precached offline page.
const pagesStrategy = new workbox.strategies.NetworkFirst({
    cacheName: 'if-portfolio-pages',
    networkTimeoutSeconds: 3,
    plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 10 })]
});
workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    (args) => {
        return pagesStrategy.handle(args).catch(() => {
            return caches.match(args.request).then((cached) => {
                return cached || workbox.precaching.matchPrecache('offline.html');
            });
        });
    }
);

// Same-origin static assets (CSS/JS/fonts/images): instant from cache,
// revalidated in the background; bounded so the storage quota is safe.
workbox.routing.registerRoute(
    ({ url, request }) =>
        url.origin === self.location.origin &&
        ['style', 'script', 'font', 'image'].includes(request.destination),
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: 'if-portfolio-assets',
        plugins: [new workbox.expiration.ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true
        })]
    })
);
