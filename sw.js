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
    // Must run before any workbox.* module access: without
    // modulePathPrefix, workbox-sw loads module bundles from
    // https://storage.googleapis.com/workbox-cdn/releases/7.1.0/.
    workbox.setConfig({ modulePathPrefix: 'vendor/workbox/', debug: false });
    workbox.core.setCacheNameDetails({ prefix: 'if-portfolio', suffix: 'v2' });

    self.skipWaiting();
    workbox.core.clientsClaim();
    workbox.precaching.cleanupOutdatedCaches();

    // Offline fallback page, precached with a revision so it is
    // available on the very first offline navigation.
    workbox.precaching.precacheAndRoute([{ url: 'offline.html', revision: 'v1' }]);

    // Data payloads (data.yaml, diary YAML, markdown posts): served
    // instantly from cache, revalidated in the background. Registered
    // BEFORE the asset route; fetch() has destination "" so the asset
    // route would otherwise never capture these.
    workbox.routing.registerRoute(
        new RegExp('/(data\\.yaml|diary/diary\\.yaml|.*\\.md)$'),
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
    var pagesStrategy = new workbox.strategies.NetworkFirst({
        cacheName: 'if-portfolio-pages',
        networkTimeoutSeconds: 3,
        plugins: [new workbox.expiration.ExpirationPlugin({ maxEntries: 10 })]
    });
    workbox.routing.registerRoute(
        function (_a) { var request = _a.request; return request.mode === 'navigate'; },
        function (args) {
            return pagesStrategy.handle(args).catch(function () {
                return caches.match(args.request).then(function (cached) {
                    return cached || workbox.precaching.matchPrecache('offline.html');
                });
            });
        }
    );

    // Same-origin static assets (CSS/JS/fonts/images): instant from cache,
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
    // Vendor bundle unreachable: a minimal pass-through fetch cache so offline still works.
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
