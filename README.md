# Ibrahim Faruquee — Portfolio

Personal portfolio of **Ibrahim Faruquee** — software engineer specializing in full-stack web development, applied machine learning, and real-time systems. Live at **[ibrahimf1.github.io](https://ibrahimf1.github.io/)**.

## Overview

A ditherpunk / brutalist "foundry specimen" portfolio: edge-to-edge hairline grids, a variable-width display typeface, a live WebGL2 Bayer-dithered background, a custom dot+ring cursor, and an ASCII point-cloud portrait rendered by a self-contained WebGL2 renderer (no 3D library). Content is fully data-driven from a single YAML source of truth — no build step, no framework.

## Highlights

- **Data-driven** — every section (nav, hero, about, projects, experience, contact, both marquee bands) is generated at runtime from [`data.yaml`](data.yaml); the dev diary reads [`diary/diary.yaml`](diary/diary.yaml). Hydration is idempotent: the runtime generators clear their containers, so pre-rendered and JS-rendered markup never duplicate.
- **SEO pre-rendered** — [`tools/prerender.mjs`](tools/prerender.mjs) (zero-dep Node) fills static content into both page shells between markers, emits per-entry article pages (`diary/entries/*.html` with enriched `BlogPosting` JSON-LD — description/keywords/wordCount/dateModified-from-mtime — OG article tags, Umami, X/LinkedIn share links), and regenerates `rss.xml` (full-content `content:encoded`, `dc:creator`) + `sitemap.xml` (mtime-based `lastmod`, per-entry image entries, orphan entry cleanup); rerun it after editing content files.
- **Bayer-dithered WebGL2 background** (`js/bayer-background.js`) — domain-warped fBm (energy-decaying octaves) with diamond-pixel ordered dithering, scroll/mouse-reactive, renders at 1× DPR (the chunky pattern needs no more), survives WebGL context loss, pauses when the tab is hidden, respects `prefers-reduced-motion` (including runtime toggles).
- **ASCII point-cloud portrait** (`js/contact-cloud.js`) — `assets/profile_pic.png` resampled into camera-facing ASCII glyphs with a one-shot "Bayer ink reveal", rendered by a hand-rolled instanced WebGL2 renderer (~0 KB of dependencies; the old 596 KB three.js dependency is gone). Falls back to the framed photo whenever WebGL2/decode fails or the visitor is on Save-Data.
- **Animated ditherpunk favicon** (`js/favicon.js`) — a 1-bit pixel-art favicon generated from the name, with a low-FPS Bayer-crawl + glitch animation loop.
- **Performance-first** — inlined critical CSS (kept in sync with `style.css`), deferred scripts, preconnects, lazy-loaded images/videos, WebP `<picture>` sources, `content-visibility` on below-fold sections, delegated (not per-element) pointer listeners, a fully self-hosted Workbox service worker (navigation preload, offline page, SWR for assets *and* data payloads, quota-safe cache expiration) for offline + instant repeat visits, and lazily-streamed markdown-it on the diary (idle-prefetched so the first entry opens instantly).
- **Engagement** — a "latest transmissions" diary teaser on the home page, a stack-keyword second marquee band, share links + copy-link + swipe navigation + reading progress + heading anchors in the diary reader, end-of-article NEXT/RELATED/RSS footers, Back-button reader semantics with per-entry scroll memory, and a command palette (⌘K) reachable from desktop and the mobile menu.
- **Accessible** — a real `<h1>` on every page, visible keyboard focus rings (with `:focus-visible` parity for hover-revealed content), a skip-to-content link, focus-trapped mobile menu and diary reader, instant-motion paths for `prefers-reduced-motion` everywhere (scroll, counters, reveals), ARIA labels, and keyboard section navigation.
- **PWA** — maskable PNG icons generated from the favicon SVG by [`tools/gen-icons.mjs`](tools/gen-icons.mjs) (zero-dep PNG encoder), manifest shortcuts, and offline recovery that auto-reloads when the connection returns.

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
js/                 # bayer-background, contact-cloud (raw WebGL2), favicon, main, attention-pulse, diary
tools/prerender.mjs # Node prerender: fills index/diary markers, emits entry pages + rss.xml + sitemap.xml
tools/gen-icons.mjs # Node PNG icon generator (favicon.svg -> PWA/apple PNGs, zero deps)
assets/             # favicon, profile pic, project media, OG image, PWA icons
```

## Tech

Vanilla HTML / CSS / JavaScript · [GSAP](https://gsap.com/) + ScrollTrigger · hand-rolled WebGL2 (background + ASCII portrait) · [js-yaml](https://github.com/nodeca/js-yaml) · [markdown-it](https://github.com/markdown-it/markdown-it) · [Workbox](https://developer.chrome.com/docs/workbox) · [Umami](https://umami.is/) analytics (cookie-less).

## License

© Ibrahim Faruquee. All rights reserved.
