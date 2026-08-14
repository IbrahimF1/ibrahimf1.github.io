# Ibrahim Faruquee — Portfolio

Personal portfolio of **Ibrahim Faruquee** — software engineer specializing in full-stack web development, applied machine learning, and real-time systems. Live at **[ibrahimf1.github.io](https://ibrahimf1.github.io/)**.

## Overview

A ditherpunk / brutalist "foundry specimen" portfolio: edge-to-edge hairline grids, a variable-width display typeface, a live WebGL2 Bayer-dithered background, a custom dot+ring cursor, and an ASCII point-cloud portrait rendered with three.js. Content is fully data-driven from a single YAML source of truth — no build step, no framework.

## Highlights

- **Data-driven** — every section (nav, hero, about, projects, experience, contact) is generated at runtime from [`data.yaml`](data.yaml); the dev diary reads [`diary/diary.yaml`](diary/diary.yaml).
- **SEO pre-rendered** — [`tools/prerender.mjs`](tools/prerender.mjs) (zero-dep Node) fills static content into both page shells between markers, emits per-entry article pages (`diary/entries/*.html` with `BlogPosting` JSON-LD + OG), and regenerates `rss.xml` (full-content `content:encoded`) + `sitemap.xml`; rerun it after editing content files.
- **Bayer-dithered WebGL2 background** (`js/bayer-background.js`) — domain-warped fBm with diamond-pixel ordered dithering, scroll/mouse-reactive, pauses when the tab is hidden, respects `prefers-reduced-motion`.
- **ASCII point-cloud portrait** (`js/contact-cloud.js`) — `assets/profile_pic.png` resampled into camera-facing ASCII glyphs with a one-shot "Bayer ink reveal"; three.js is lazy-loaded only when the contact section is approached.
- **Animated ditherpunk favicon** (`js/favicon.js`) — a 1-bit pixel-art favicon generated from the name, with a low-FPS Bayer-crawl + glitch animation loop.
- **Performance-first** — inlined critical CSS, deferred scripts, preconnects to CDNs, lazy-loaded images/videos, WebP `<picture>` sources, a fully self-hosted Workbox service worker (offline page, SWR for assets *and* data payloads) for offline + instant repeat visits, compositor-only cursor/counters, and lazily-streamed markdown-it on the diary.
- **Engagement** — a "latest transmissions" diary teaser on the home page, share links + copy-link + swipe navigation + reading times in the diary reader, and a command palette (⌘K) reachable from desktop and the mobile menu.
- **Accessible** — visible keyboard focus rings (with `:focus-visible` parity for hover-revealed content), a skip-to-content link, focus-trapped mobile menu and diary reader, `prefers-reduced-motion` paths everywhere, ARIA labels, and keyboard section navigation.

## Structure

```
index.html          # Portfolio shell (critical CSS inlined)
diary.html          # Dev diary shell
404.html            # Branded "signal lost" page
sw.js               # Workbox service worker (offline + SWR)
data.yaml           # Single source of truth for portfolio content
diary/diary.yaml    # Dev diary data + entry references
css/style.css       # Portfolio styles
css/diary.css       # Diary-specific styles
js/                 # bayer-background, contact-cloud, favicon, main, attention-pulse, diary
tools/prerender.mjs # Node prerender: fills index/diary markers, emits entry pages + rss.xml + sitemap.xml
assets/             # favicon, profile pic, project media, OG image
```

## Tech

Vanilla HTML / CSS / JavaScript · [GSAP](https://gsap.com/) + ScrollTrigger · [three.js](https://threejs.org/) · [js-yaml](https://github.com/nodeca/js-yaml) · [Workbox](https://developer.chrome.com/docs/workbox) · [Umami](https://umami.is/) analytics (cookie-less).

## License

© Ibrahim Faruquee. All rights reserved.
