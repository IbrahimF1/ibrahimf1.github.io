/* ============================================================
   SERVICE WORKER — offline cache + instant repeat visits
   ------------------------------------------------------------
   Self-hosted Workbox runtime (vendor/workbox/) — no third-party
   importScripts dependency. Same-origin assets are served
   stale-while-revalidate (instant, then quietly updated); the
   HTML shell is network-first so deploys always land. PWA
   installable; works fully offline.
   ============================================================ */
importScripts('vendor/workbox/workbox-sw.js');

if (self.workbox) {
    workbox.setConfig({ debug: false });
    workbox.core.setCacheNameDetails({ prefix: 'if-portfolio', suffix: 'v1' });

    self.skipWaiting();
    workbox.core.clientsClaim();
    workbox.precaching.cleanupOutdatedCaches();

    // HTML navigations: network-first (3s timeout) so new deploys show up
    // immediately but still load offline from cache.
    workbox.routing.registerRoute(
        function (_a) { var request = _a.request; return request.mode === 'navigate'; },
        new workbox.strategies.NetworkFirst({
            cacheName: 'if-portfolio-pages',
            networkTimeoutSeconds: 3,
            plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 10 })]
        })
    );

    // Same-origin static assets (CSS/JS/fonts/images/YAML): instant from cache,
    // revalidated in the background.
    workbox.routing.registerRoute(
        function (args) {
            var url = args.url, request = args.request;
            return url.origin === self.location.origin &&
                ['style', 'script', 'font', 'image'].indexOf(request.destination) !== -1;
        },
        new workbox.strategies.StaleWhileRevalidate({ cacheName: 'if-portfolio-assets' })
    );

} else {
    // CDN unreachable: a minimal pass-through fetch cache so offline still works.
    self.addEventListener('fetch', function (event) {
        if (event.request.method !== 'GET') return;
        event.respondWith(
            caches.open('if-portfolio-fallback').then(function (cache) {
                return cache.match(event.request).then(function (cached) {
                    var fetchPromise = fetch(event.request).then(function (resp) {
                        if (resp && resp.status === 200) cache.put(event.request, resp.clone());
                        return resp;
                    }).catch(function () { return cached; });
                    return cached || fetchPromise;
                });
            })
        );
    });
}
