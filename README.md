# Ibrahim Faruquee — Portfolio

Personal portfolio of **Ibrahim Faruquee** — software engineer specializing in full-stack web development, applied machine learning, and real-time systems. Live at **[ibrahimf1.github.io](https://ibrahimf1.github.io/)**.

## Overview

A ditherpunk / brutalist "foundry specimen" portfolio: edge-to-edge hairline grids, a variable-width display typeface, a live WebGL2 Bayer-dithered background, a custom dot+ring cursor, and an ASCII point-cloud portrait rendered with three.js. Content is fully data-driven from a single YAML source of truth — no build step, no framework.

## Highlights

- **Data-driven** — every section (nav, hero, about, projects, experience, contact) is generated at runtime from [`data.yaml`](data.yaml); the dev diary reads [`diary/diary.yaml`](diary/diary.yaml).
- **Bayer-dithered WebGL2 background** (`js/bayer-background.js`) — domain-warped fBm with diamond-pixel ordered dithering, scroll/mouse-reactive, pauses when the tab is hidden, respects `prefers-reduced-motion`.
- **ASCII point-cloud portrait** (`js/contact-cloud.js`) — `assets/profile_pic.png` resampled into camera-facing ASCII glyphs with a one-shot "Bayer ink reveal"; three.js is lazy-loaded only when the contact section is approached.
- **Animated ditherpunk favicon** (`js/favicon.js`) — a 1-bit pixel-art favicon generated from the name, with a low-FPS Bayer-crawl + glitch animation loop.
- **Performance-first** — inlined critical CSS, deferred scripts, preconnects to CDNs, lazy-loaded images/videos, WebP `<picture>` sources, a Workbox service worker for offline + instant repeat visits, and compositor-only scroll progress.
- **Accessible** — visible keyboard focus rings, a skip-to-content link, focus-trapped mobile menu, `prefers-reduced-motion` paths everywhere, ARIA labels, and keyboard section navigation.

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
assets/             # favicon, profile pic, project media, OG image
```

## Tech

Vanilla HTML / CSS / JavaScript · [GSAP](https://gsap.com/) + ScrollTrigger · [three.js](https://threejs.org/) · [js-yaml](https://github.com/nodeca/js-yaml) · [Workbox](https://developer.chrome.com/docs/workbox) · [Umami](https://umami.is/) analytics (cookie-less).

## License

© Ibrahim Faruquee. All rights reserved.
