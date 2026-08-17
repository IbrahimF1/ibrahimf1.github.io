# vendor/

Self-hosted vendor libraries so the site has no runtime cross-origin CDN dependency.

| File | Source | Version | License |
| --- | --- | --- | --- |
| `js-yaml.min.js` | https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js | 4.1.0 | MIT |
| `gsap.min.js` | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js | 3.12.5 | GreenSock Standard No-Charge License |
| `ScrollTrigger.min.js` | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js | 3.12.5 | GreenSock Standard No-Charge License |
| `ScrollToPlugin.min.js` | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollToPlugin.min.js | 3.12.5 | GreenSock Standard No-Charge License |
| `markdown-it.min.js` | https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js | 14.1.0 | MIT |

## workbox/

Workbox 7.1.0 runtime modules loaded by `sw.js` (prod builds only —
`debug: false`, so the `.dev.js` bundles are never fetched and are not kept
here). Only the modules sw.js actually imports are vendored:
`workbox-sw.js` (loader) + core / precaching / routing / strategies /
expiration / navigation-preload `.prod.js`. Source:
https://github.com/googlechrome/workbox/releases/tag/v7.1.0
