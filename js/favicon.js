/* ============================================================
   DITHERPUNK PIXEL-ART FAVICON GENERATOR + ANIMATOR
   ------------------------------------------------------------
   Generates a brutalist, Web 1.0-inspired 1-bit favicon that
   matches the site's anti-design / ditherpunk identity, and
   optionally drives a seamless, performance-optimised ANIMATION
   loop over it.

   STATIC PIPELINE (unchanged, used as the one-shot fallback):
     1. Extracts initials from a name (robust to edge cases).
     2. Renders them through a hand-built 5×7 PIXEL FONT — every
        glyph is a grid of raw, un-anti-aliased squares.
     3. Lays the glyph onto a strict 1-BIT canvas (two colours
        only: a dark "off" and a light "on").
     4. Fills the negative space with an ordered BAYER DITHER
        (4×4 matrix) driven by a radial vignette, so the field
        dissolves into noisy halftone toward the edges.
     5. Wraps everything in a raw 1px border frame (no rounding,
        no smoothing) and sprinkles a few deterministic GLITCH
        pixels for a deliberately corrupted feel.
     6. Encodes the SVG as a percent-encoded data URI and injects
        it into <head>.

   ANIMATION PIPELINE (new):
     The initials + border are computed ONCE and never move, so
     the icon stays razor-legible at 16×16 / 32×32. Only the
     surrounding dither field and glitch pixels are re-rendered
     each frame, producing a living "analog signal" shimmer:

       • BAYER CRAWL — the 4×4 ordered-dither tile is offset by a
         slow, sine-driven integer vector so the halftone dots
         appear to march. Because the offset is periodic the loop
         is perfectly seamless.
       • DENSITY BREATHE — the vignette strength modulates on a
         slow sine, so the noisy edges swell and recede.
       • GLITCH BURSTS — a few stray lit squares flash on for a
         short window, vanish, then reappear elsewhere after a
         random gap — corrupted-transmission spikes.

   PERFORMANCE:
       • Frames are tiny SVG data URIs (no canvas / object-URL
         churn); only the dynamic rects are rebuilt per frame.
       • requestAnimationFrame is throttled to a low FPS (favicons
         need no 60 fps) via a time gate.
       • The loop is PAUSED on visibilitychange (tab hidden) and
         resumed on focus — no work the user can't see.
       • prefers-reduced-motion disables animation and falls back
         to a single static frame.

   Exposed globally:
     • window.generateInitialsFavicon(name, options) — one-shot static.
     • window.animateFavicon(name, options)              — animated.
   ============================================================ */

(function (global) {
    'use strict';

    /* ============================================================
       COLOR UTILITIES
       ============================================================ */

    /**
     * Parse a hex color (#rgb, #rrggbb, with or without leading #) into an
     * {r, g, b} object (0–255 channels). Returns null for invalid input.
     */
    function parseHexColor(hex) {
        if (typeof hex !== 'string') return null;
        let h = hex.trim().replace(/^#/, '');
        // Expand shorthand form: #abc -> #aabbcc
        if (h.length === 3) {
            h = h.split('').map(c => c + c).join('');
        }
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16)
        };
    }

    /**
     * WCAG 2.x relative luminance for an {r, g, b} color.
     * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
     */
    function relativeLuminance(rgb) {
        const channel = (c) => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    /**
     * Return black or white — whichever yields the higher WCAG contrast ratio
     * against the given hex background. Falls back to white on bad input.
     */
    function getContrastColor(hex) {
        const rgb = parseHexColor(hex);
        if (!rgb) return '#ffffff';
        const lum = relativeLuminance(rgb);
        // (L1 + 0.05) / (L2 + 0.05) — standard WCAG contrast formula.
        const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return contrast(lum, 0) >= contrast(lum, 1) ? '#000000' : '#ffffff';
    }

    /**
     * Deterministically derive a pleasant HSL hex color from an arbitrary
     * string. Kept for backward compatibility / fallback colour derivation.
     */
    function colorFromString(str, saturation = 62, lightness = 45) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
            hash |= 0; // keep as 32-bit integer
        }
        const hue = Math.abs(hash) % 360;
        return hslToHex(hue, saturation, lightness);
    }

    /** Convert HSL (degrees, %, %) to a #rrggbb hex string. */
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const k = (n) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
            const color = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    /* ============================================================
       INITIALS EXTRACTION
       ============================================================ */

    // Name particles / suffixes that should not contribute an initial.
    const SKIP_TOKENS = new Set([
        'van', 'von', 'de', 'der', 'den', 'del', 'da', 'di', 'du', 'le', 'la',
        'el', 'al', 'bin', 'ibn', 'jr', 'sr', 'ii', 'iii', 'iv', 'v', 'the'
    ]);

    /**
     * Extract up to `max` uppercase initials from a full name.
     *
     * Strategy:
     *   - Trim and collapse internal whitespace.
     *   - Split into tokens, dropping common particles/suffixes.
     *   - One token  → first letter.
     *   - Many tokens → first letter of the first and last meaningful tokens.
     *
     * Returns '' when no usable character is found.
     */
    function extractInitials(name, max = 2) {
        if (typeof name !== 'string') return '';
        const cleaned = name.trim().replace(/\s+/g, ' ');
        if (!cleaned) return '';

        const tokens = cleaned.split(' ').filter(t => {
            const lower = t.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
            return lower.length > 0 && !SKIP_TOKENS.has(lower);
        });

        if (tokens.length === 0) {
            // Last-resort: grab the first letter-like character anywhere.
            const m = cleaned.match(/[a-zà-ÿ]/i);
            return m ? m[0].toUpperCase() : '';
        }

        let picks;
        if (tokens.length === 1) {
            picks = [tokens[0]];
        } else if (max >= tokens.length) {
            picks = tokens;
        } else {
            picks = [tokens[0], tokens[tokens.length - 1]];
        }

        return picks
            .slice(0, max)
            .map(t => t.charAt(0).toUpperCase())
            .join('');
    }

    /* ============================================================
       5×7 PIXEL FONT
       ------------------------------------------------------------
       Each glyph is 7 rows of 5 columns. '1' = lit pixel, '0' = dark.
       Deliberately blocky, low-resolution, unpolished — built to
       survive downscaling to 16×16 without losing its silhouette.
       ============================================================ */

    const GLYPH_W = 5;
    const GLYPH_H = 7;

    const PIXEL_FONT = {
        'A': ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
        'B': ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
        'C': ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
        'D': ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
        'E': ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
        'F': ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
        'G': ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
        'H': ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
        'I': ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
        'J': ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
        'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
        'L': ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
        'M': ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
        'N': ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
        'O': ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
        'P': ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
        'Q': ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
        'R': ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
        'S': ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
        'T': ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
        'U': ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
        'V': ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
        'W': ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
        'X': ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
        'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
        'Z': ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
        '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
        '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
        '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
        '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
        '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
        '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
        '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
        '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
        '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
        '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
        '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
        // Solid block fallback for anything unrecognised.
        '#': ['11111', '11111', '11111', '11111', '11111', '11111', '11111']
    };

    /* ============================================================
       ORDERED DITHERING (4×4 BAYER MATRIX)
       ------------------------------------------------------------
       The same family of ordered dither the site's WebGL background
       uses, distilled to a tiny lookup. Returns a 0–1 threshold for
       any integer coordinate so the pattern tiles seamlessly.
       ============================================================ */

    const BAYER_4X4 = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];

    /** Ordered-dither threshold (0–1) for pixel (x, y). */
    function bayerThreshold(x, y) {
        const bx = ((x % 4) + 4) % 4;
        const by = ((y % 4) + 4) % 4;
        return (BAYER_4X4[by][bx] + 0.5) / 16;
    }

    /* ============================================================
       DETERMINISTIC HASH (for stable glitch pixels per name)
       ============================================================ */

    /** FNV-1a 32-bit hash → unsigned integer. */
    function hashStr(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /* ============================================================
       GLYPH → PIXEL GRID
       ------------------------------------------------------------
       Rasterises the initials onto the design grid, centred. Returns
       a Set of "x,y" coordinate keys for every lit glyph pixel.
       ============================================================ */

    function renderGlyphPixels(initials, grid) {
        let chars = (initials || '?').toUpperCase().split('').filter(c => c);
        if (chars.length === 0) chars = ['?'];
        const n = chars.length;
        const gap = 1;
        const totalW = n * GLYPH_W + (n - 1) * gap;
        const startX = Math.floor((grid - totalW) / 2);
        const startY = Math.floor((grid - GLYPH_H) / 2);

        const pixels = new Set();
        for (let i = 0; i < n; i++) {
            const glyph = PIXEL_FONT[chars[i]] || PIXEL_FONT['#'];
            for (let r = 0; r < GLYPH_H; r++) {
                const row = glyph[r];
                for (let c = 0; c < GLYPH_W; c++) {
                    if (row[c] === '1') {
                        const x = startX + i * (GLYPH_W + gap) + c;
                        const y = startY + r;
                        pixels.add(x + ',' + y);
                    }
                }
            }
        }
        return pixels;
    }

    /* ============================================================
       OPTION RESOLUTION
       ------------------------------------------------------------
       Shared by the static one-shot and the animator so colours /
       initials are derived identically everywhere.
       ============================================================ */

    const DEFAULTS = {
        darkColor: null,
        lightColor: null,
        bgColor: null,      // legacy alias for darkColor
        textColor: null,    // legacy alias for lightColor
        autoContrast: true,
        size: 32,
        gridSize: 16,
        ditherStrength: 0.7,
        dither: true,
        border: true,
        glitch: true,
        glitchCount: 3,
        maxInitials: 2,
        inject: true,
        // --- animation ---
        animate: true,      // master switch for the animation loop
        fps: 12             // target frame rate (favicons need no 60 fps)
    };

    /**
     * Resolve colours + initials + merged options from raw input.
     * @returns {{initials:string, darkColor:string, lightColor:string, opts:Object}}
     */
    function resolveConfig(name, options) {
        const opts = Object.assign({}, DEFAULTS, options || {});

        const darkColor = parseHexColor(opts.darkColor)
            ? opts.darkColor
            : (parseHexColor(opts.bgColor) ? opts.bgColor : '#0a0a0a');

        let lightColor = opts.lightColor || opts.textColor;
        if (!parseHexColor(lightColor)) {
            const darkRgb = parseHexColor(darkColor);
            // On a dark background, use the site's warm highlight for brand cohesion;
            // otherwise fall back to WCAG auto-contrast.
            if (darkRgb && relativeLuminance(darkRgb) < 0.4) {
                lightColor = '#d4c5ab';
            } else {
                lightColor = opts.autoContrast ? getContrastColor(darkColor) : '#d4c5ab';
            }
        }

        const initials = extractInitials(name, opts.maxInitials) || '?';
        return { initials, darkColor, lightColor, opts };
    }

    /* ============================================================
       GEOMETRY (computed once, reused every frame)
       ------------------------------------------------------------
       Everything that must NEVER move for legibility — the glyph,
       its dark moat, the border frame, the clean zone, and the
       candidate cells for the animated dither — is precomputed
       here. The animator only ever touches the dither cells.
       ============================================================ */

    /** Escape a string for safe inclusion as XML text content. */
    function escapeXml(str) {
        return String(str)
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>');
    }

    /** Serialise an iterable of "x,y" keys into a compact <rect> list. */
    function keysToRects(keys) {
        let s = '';
        keys.forEach(key => {
            const comma = key.indexOf(',');
            s += `<rect x="${key.slice(0, comma)}" y="${key.slice(comma + 1)}" width="1" height="1"/>`;
        });
        return s;
    }

    /**
     * Precompute the static geometry for a given initials + options.
     * @returns {Object} geo — { G, glyph, moat, inCleanZone, staticRects, ditherCells }
     */
    function computeGeometry(initials, opts) {
        const G = opts.gridSize;
        const glyph = renderGlyphPixels(initials, G);

        // --- 1px dark "moat" around the glyph so it always pops ---
        const moat = new Set();
        glyph.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= G || ny >= G) return;
                if (nx === 0 || nx === G - 1 || ny === 0 || ny === G - 1) return; // keep border clean
                const k = nx + ',' + ny;
                if (!glyph.has(k)) moat.add(k);
            });
        });

        // --- Clean zone: the glyph's bounding box (padded by 1) is forced
        //     dark everywhere except on the glyph itself, so ordered-dither
        //     and glitch pixels can never clutter the letterforms. This is
        //     what keeps the initials legible at 16×16. ---
        let minX = G, minY = G, maxX = -1, maxY = -1;
        glyph.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        });
        const czX1 = Math.max(1, minX - 1);
        const czY1 = Math.max(1, minY - 1);
        const czX2 = Math.min(G - 2, maxX + 1);
        const czY2 = Math.min(G - 2, maxY + 1);
        const inCleanZone = (x, y) => x >= czX1 && x <= czX2 && y >= czY1 && y <= czY2;

        // --- Static lit pixels: raw 1px border frame + glyph. These never
        //     change between frames, so their <rect> string is cached. ---
        const staticLit = new Set();
        if (opts.border) {
            for (let i = 0; i < G; i++) {
                staticLit.add('0,' + i);
                staticLit.add((G - 1) + ',' + i);
                staticLit.add(i + ',0');
                staticLit.add(i + ',' + (G - 1));
            }
        }
        glyph.forEach(key => staticLit.add(key));
        const staticRects = keysToRects(staticLit);

        // --- Candidate cells for the animated dither field. Each stores its
        //     normalised distance from centre (t) so the per-frame renderer
        //     only does cheap arithmetic. Glyph / moat / clean zone excluded. ---
        const ditherCells = [];
        if (opts.dither) {
            const cx = (G - 1) / 2;
            const cy = (G - 1) / 2;
            const maxDist = Math.sqrt(cx * cx + cy * cy);
            for (let y = 1; y < G - 1; y++) {
                for (let x = 1; x < G - 1; x++) {
                    const key = x + ',' + y;
                    if (glyph.has(key) || moat.has(key) || inCleanZone(x, y)) continue;
                    const dx = x - cx, dy = y - cy;
                    ditherCells.push({
                        x, y,
                        t: Math.sqrt(dx * dx + dy * dy) / maxDist, // 0 centre → 1 corner
                        bayer: bayerThreshold(x, y)
                    });
                }
            }
        }

        return { G, glyph, moat, inCleanZone, staticRects, ditherCells };
    }

    /* ============================================================
       SVG COMPOSITION
       ============================================================ */

    /**
     * Compose the final 1-bit ditherpunk SVG from cached static geometry
     * plus a string of dynamic (per-frame) <rect> elements.
     *
     * @param {Object} geo            - Output of computeGeometry().
     * @param {Object} rc             - { size, darkColor, lightColor, initials }.
     * @param {string} dynamicRects   - Pre-serialised dynamic <rect> list (may be '').
     */
    function composeSvg(geo, rc, dynamicRects) {
        const G = geo.G;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${rc.size}" height="${rc.size}" viewBox="0 0 ${G} ${G}" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(rc.initials)}">` +
            `<rect width="${G}" height="${G}" fill="${rc.darkColor}"/>` +
            `<g fill="${rc.lightColor}">${geo.staticRects}${dynamicRects || ''}</g>` +
            `</svg>`;
    }

    /**
     * Build the STATIC dynamic-layer (one-shot Bayer dither + seeded glitch).
     * Used by the one-shot generator and as the animation's first / fallback frame.
     */
    function staticDynamicRects(geo, opts, initials) {
        const dyn = new Set();

        if (opts.dither) {
            for (let i = 0; i < geo.ditherCells.length; i++) {
                const c = geo.ditherCells[i];
                if (c.t * opts.ditherStrength >= c.bayer) dyn.add(c.x + ',' + c.y);
            }
        }

        if (opts.glitch) {
            let s = (hashStr(initials || '?') || 1) >>> 0;
            const rnd = () => {
                s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
                return s / 0x7fffffff;
            };
            let placed = 0, tries = 0;
            while (placed < opts.glitchCount && tries < opts.glitchCount * 12) {
                tries++;
                const x = 1 + Math.floor(rnd() * (geo.G - 2));
                const y = 1 + Math.floor(rnd() * (geo.G - 2));
                const key = x + ',' + y;
                if (geo.glyph.has(key) || geo.moat.has(key) || geo.inCleanZone(x, y)) continue;
                dyn.add(key);
                placed++;
            }
        }

        return keysToRects(dyn);
    }

    /**
     * Build the raw 1-bit ditherpunk SVG markup (static one-shot).
     * Kept as a thin composition of the reusable pieces above.
     */
    function buildSvg(initials, opts) {
        const geo = computeGeometry(initials, opts);
        const rc = { size: opts.size, darkColor: opts.darkColor, lightColor: opts.lightColor, initials };
        return composeSvg(geo, rc, staticDynamicRects(geo, opts, initials));
    }

    /* ============================================================
       ANIMATED DYNAMIC LAYER
       ------------------------------------------------------------
       Re-rendered every frame. Drives two seamless, sine-based
       modulations over the cached dither cells plus stateful
       glitch bursts. Returns a serialised <rect> string.
       ============================================================ */

    // Animation tuning constants (periods chosen so motion is calm,
    // continuous, and loops without a visible seam).
    const ANIM = {
        breatheSpeed: 0.9,   // rad/s — density swell/recede (~7s period)
        crawlSpeedX:  0.33,  // rad/s — Bayer tile horizontal drift
        crawlSpeedY:  0.27,  // rad/s — Bayer tile vertical drift (offset → Lissajous)
        breatheFloor: 0.45,  // min multiplier on ditherStrength
        breatheCeil:  1.0    // max multiplier on ditherStrength
    };

    /**
     * @param {Object} geo      - Cached geometry from computeGeometry().
     * @param {Object} opts     - Resolved options.
     * @param {number} time     - performance.now() timestamp (ms).
     * @param {Object} glitch   - Mutable state: { nextBurstAt, visibleUntil, positions }.
     * @param {Function} rnd    - Seeded PRNG () => [0,1).
     */
    function animatedDynamicRects(geo, opts, time, glitch, rnd) {
        let out = '';
        const cells = geo.ditherCells;
        if (cells.length) {
            const sec = time * 0.001;

            // Density breathe: smooth swell/recede of the vignette strength.
            const breathe = 0.5 + 0.5 * Math.sin(sec * ANIM.breatheSpeed);
            const strength = opts.ditherStrength *
                (ANIM.breatheFloor + (ANIM.breatheCeil - ANIM.breatheFloor) * breathe);

            // Bayer crawl: integer offset (0–3) applied to the threshold lookup,
            // so the 4×4 halftone tile appears to march. Periodic → seamless.
            const ox = Math.round(3 * (0.5 + 0.5 * Math.sin(sec * ANIM.crawlSpeedX)));
            const oy = Math.round(3 * (0.5 + 0.5 * Math.cos(sec * ANIM.crawlSpeedY)));

            for (let i = 0; i < cells.length; i++) {
                const c = cells[i];
                const intensity = c.t * strength;
                if (intensity >= bayerThreshold(c.x + ox, c.y + oy)) {
                    out += `<rect x="${c.x}" y="${c.y}" width="1" height="1"/>`;
                }
            }
        }

        // Glitch bursts: flash a few stray pixels for a short window, then go
        // dark for a random gap. Positions always avoid the clean zone so the
        // initials never get corrupted.
        if (opts.glitch) {
            if (time >= glitch.nextBurstAt) {
                glitch.positions = [];
                let placed = 0, tries = 0;
                while (placed < opts.glitchCount && tries < opts.glitchCount * 12) {
                    tries++;
                    const x = 1 + Math.floor(rnd() * (geo.G - 2));
                    const y = 1 + Math.floor(rnd() * (geo.G - 2));
                    const key = x + ',' + y;
                    if (geo.glyph.has(key) || geo.moat.has(key) || geo.inCleanZone(x, y)) continue;
                    glitch.positions.push({ x, y });
                    placed++;
                }
                const burstLen = 120 + Math.floor(rnd() * 180);   // visible 120–300 ms
                glitch.visibleUntil = time + burstLen;
                glitch.nextBurstAt = time + burstLen + 400 + Math.floor(rnd() * 900); // gap 0.4–1.3 s
            }
            if (time < glitch.visibleUntil) {
                for (let i = 0; i < glitch.positions.length; i++) {
                    const p = glitch.positions[i];
                    out += `<rect x="${p.x}" y="${p.y}" width="1" height="1"/>`;
                }
            }
        }

        return out;
    }

    /* ============================================================
       DATA-URI ENCODING & HEAD INJECTION
       ============================================================ */

    /**
     * Encode an SVG string into a data URI suitable for <link href>.
     * Percent-encoding is preferred over base64 for SVG (smaller payload,
     * wider compatibility). Quotes are also encoded for attribute safety.
     */
    function svgToDataUri(svg) {
        const encoded = encodeURIComponent(svg)
            .replace(/'/g, '%27')   // encodeURIComponent leaves ' untouched
            .replace(/"/g, '%22');  // belt-and-suspenders for attribute quoting
        return `data:image/svg+xml,${encoded}`;
    }

    /**
     * Inject a static favicon into <head>, replacing any pre-existing icon
     * links so we never end up with duplicates. Sets both a standard icon
     * and an apple-touch-icon (the latter never animates).
     */
    function injectFavicon(dataUri) {
        const head = document.head || document.getElementsByTagName('head')[0];
        if (!head) return;

        ['icon', 'shortcut icon', 'apple-touch-icon'].forEach(rel => {
            head.querySelectorAll(`link[rel="${rel}"]`).forEach(el => el.remove());
        });

        const icon = document.createElement('link');
        icon.rel = 'icon';
        icon.type = 'image/svg+xml';
        icon.href = dataUri;
        head.appendChild(icon);

        const apple = document.createElement('link');
        apple.rel = 'apple-touch-icon';
        apple.href = dataUri;
        head.appendChild(apple);
    }

    /**
     * Ensure a single persistent <link rel="icon"> exists that the animation
     * loop can mutate in place (avoids per-frame DOM churn). Created once,
     * tagged with [data-favicon-live] so subsequent calls reuse it.
     * @returns {HTMLLinkElement|null}
     */
    function ensureIconLink() {
        const head = document.head || document.getElementsByTagName('head')[0];
        if (!head) return null;

        let link = head.querySelector('link[data-favicon-live]');
        if (!link) {
            // Drop any pre-existing icon links (static fallback / one-shot) first.
            ['icon', 'shortcut icon'].forEach(rel => {
                head.querySelectorAll(`link[rel="${rel}"]`).forEach(el => el.remove());
            });
            link = document.createElement('link');
            link.rel = 'icon';
            link.type = 'image/svg+xml';
            link.setAttribute('data-favicon-live', '');
            head.appendChild(link);
        }
        return link;
    }

    /* ============================================================
       ANIMATION LOOP
       ------------------------------------------------------------
       Throttled requestAnimationFrame, paused on tab hide, resumed
       on focus. Returns a controller with a stop() method.
       ============================================================ */

    // Tracks the currently running animation so a second call cleanly
    // tears down the first (no leaked RAF loops / listeners).
    let currentAnimation = null;

    /**
     * Start the live favicon animation.
     *
     * @param {Object} geo      - Cached geometry.
     * @param {Object} rc       - Render config { size, darkColor, lightColor, initials }.
     * @param {Object} opts     - Resolved options (reads fps, glitch, glitchCount, dither).
     * @param {HTMLLinkElement} liveLink - Persistent icon link to mutate each frame.
     * @returns {{stop:Function}} controller
     */
    function startAnimationLoop(geo, rc, opts, liveLink) {
        let rafId = null;
        let last = 0;
        const interval = 1000 / Math.max(1, opts.fps);

        // Glitch state lives across frames; PRNG seeded by the initials so the
        // corruption pattern is stable per identity.
        const glitch = { nextBurstAt: 0, visibleUntil: 0, positions: [] };
        let prng = (hashStr(rc.initials || '?') || 1) >>> 0;
        const rnd = () => {
            prng = (Math.imul(prng, 1103515245) + 12345) & 0x7fffffff;
            return prng / 0x7fffffff;
        };

        function frame(now) {
            rafId = requestAnimationFrame(frame);
            // Belt-and-suspenders: skip work if the tab is somehow still hidden.
            if (document.hidden) return;
            // Throttle to the target FPS — favicons need no 60 fps.
            if (now - last < interval) return;
            last = now;

            const dyn = animatedDynamicRects(geo, opts, now, glitch, rnd);
            liveLink.href = svgToDataUri(composeSvg(geo, rc, dyn));
        }

        function onVisibilityChange() {
            if (document.hidden) {
                if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            } else if (!rafId) {
                last = 0; // render immediately on resume
                rafId = requestAnimationFrame(frame);
            }
        }

        document.addEventListener('visibilitychange', onVisibilityChange);
        rafId = requestAnimationFrame(frame);

        return {
            stop() {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = null;
                document.removeEventListener('visibilitychange', onVisibilityChange);
            }
        };
    }

    /* ============================================================
       PUBLIC API
       ============================================================ */

    /**
     * Generate and (optionally) inject a brutalist 1-bit ditherpunk SVG
     * favicon built from a person's name (STATIC one-shot).
     *
     * @param {string} name - The person's full name (e.g. "John Doe").
     * @param {Object}  [options]  - See DEFAULTS above.
     * @returns {string} The generated SVG data URI (even when not injected).
     */
    function generateInitialsFavicon(name, options) {
        const cfg = resolveConfig(name, options);
        const rc = { size: cfg.opts.size, darkColor: cfg.darkColor, lightColor: cfg.lightColor, initials: cfg.initials };
        const geo = computeGeometry(cfg.initials, cfg.opts);
        const svg = composeSvg(geo, rc, staticDynamicRects(geo, cfg.opts, cfg.initials));
        const dataUri = svgToDataUri(svg);

        if (cfg.opts.inject) {
            injectFavicon(dataUri);
        }
        return dataUri;
    }

    /**
     * Generate an ANIMATED ditherpunk favicon and drive a seamless,
     * performance-optimised loop over it.
     *
     * The initials + border are rendered once and never move (so the icon
     * stays legible at 16×16 / 32×32); only the Bayer-dither field and
     * glitch pixels animate. Falls back to a single static frame when:
     *   • options.animate is false,
     *   • the user prefers reduced motion, or
     *   • requestAnimationFrame is unavailable.
     *
     * @param {string} name - The person's full name (e.g. "John Doe").
     * @param {Object}  [options]
     * @param {boolean} [options.animate=true] - Master switch for the loop.
     * @param {number}  [options.fps=12]       - Target frame rate.
     *   (plus all static options from generateInitialsFavicon)
     * @returns {{stop:Function}|null} Animation controller, or null if not animating.
     */
    function animateFavicon(name, options) {
        const cfg = resolveConfig(name, options);
        const rc = { size: cfg.opts.size, darkColor: cfg.darkColor, lightColor: cfg.lightColor, initials: cfg.initials };
        const geo = computeGeometry(cfg.initials, cfg.opts);

        // Tear down any previously running loop.
        if (currentAnimation) {
            currentAnimation.stop();
            currentAnimation = null;
        }

        // Static first frame + apple-touch-icon (set once; apple icons never animate).
        const firstUri = svgToDataUri(composeSvg(geo, rc, staticDynamicRects(geo, cfg.opts, cfg.initials)));
        injectFavicon(firstUri);

        // Accessibility / capability guards → keep the static frame, don't loop.
        const prefersReducedMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (!cfg.opts.animate || prefersReducedMotion || typeof global.requestAnimationFrame !== 'function') {
            return null;
        }

        const liveLink = ensureIconLink();
        if (!liveLink) return null; // no <head> — static frame already injected above
        liveLink.href = firstUri;

        currentAnimation = startAnimationLoop(geo, rc, cfg.opts, liveLink);
        return currentAnimation;
    }

    // Expose globally.
    global.generateInitialsFavicon = generateInitialsFavicon;
    global.animateFavicon = animateFavicon;
})(typeof window !== 'undefined' ? window : this);
