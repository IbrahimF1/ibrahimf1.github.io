/* ============================================================
   ATTENTION PULSE — periodic "clickability" sweep director
   ============================================================
   Every 15s, gathers every currently-visible clickable element
   (.hero-social, .project-card-repo, .about-cta, .contact-link)
   and fires a 2s white→gray moving-gradient sweep on each.

   The VISUAL lives in CSS on .clickable-pulse::after (a screen-
   blended overlay band). This module only owns VISIBILITY
   (IntersectionObserver) + SCHEDULING (staggered class toggling).
   It never touches host transform/opacity/color props → zero
   conflict with the GSAP scroll & hover tweens driving the same
   elements (Context7's GSAP conflict guidance: don't fight
   existing tweens on the same properties).

   Spacing rule: when several targets share the screen, each sweep
   is started on its own jittered offset (stagger ± jitter, shuffled
   order) so their bright bands never peak together — they read as
   asynchronous pulses, not a synced flash.
   ============================================================ */

(function () {
    'use strict';

    // Interactive surfaces to tease. Generated dynamically from data.yaml.
    var SELECTOR = [
        '.hero-social',          // social SVGs in the hero + contact footer
        '.project-card-repo'     // GitHub SVG on each project card
    ].join(', ');

    var CYCLE_MS = 15000;       // a sweep wave fires every 15s
    var SWEEP_MS = 2000;        // each sweep lasts 2s (matches the CSS animation)
    var FIRST_DELAY_MS = 4500;  // first wave waits until the startup animation settles
    var STAGGER_MS = 900;       // baseline spacing between visible targets
    var JITTER_MS = 300;        // ±randomness so the rhythm feels organic, not metronomic
    var MIN_GAP_MS = 7000;      // never fire two waves closer than this (global guard)

    // Honor reduced-motion: the CSS already suppresses the visual, and JS bails
    // so no scheduling/class toggling occurs at all.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var visible = new Set();
    var observer = null;
    var timer = null;
    var lastWave = 0;

    function start() {
        var nodes = document.querySelectorAll(SELECTOR);
        if (!nodes.length) return false;

        nodes.forEach(function (el) {
            el.classList.add('clickable-pulse');
            // SVG hosts need their icon as a mask so the gradient paints on
            // the shape itself, not a bounding box.
            if (el.matches('.hero-social, .project-card-repo')) {
                setupIconMask(el);
            }
        });

        observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) visible.add(entry.target);
                else visible.delete(entry.target);
            });
        }, { threshold: 0.6 });

        nodes.forEach(function (el) { observer.observe(el); });

        // Recursive setTimeout (not setInterval) so each wave lands a clean
        // CYCLE_MS after the previous one, regardless of skip/no-op frames.
        scheduleNext(FIRST_DELAY_MS);

        // On tab return, catch up if a wave was missed while hidden.
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && Date.now() - lastWave >= CYCLE_MS) {
                pulseAll();
            }
        });

        return true;
    }

    function scheduleNext(delay) {
        timer = setTimeout(function () {
            pulseAll();
            scheduleNext(CYCLE_MS);
        }, delay);
    }

    function pulseAll() {
        if (document.hidden) return;

        // Global throttle: guarantees waves stay well apart even if an extra
        // trigger (e.g. visibilitychange) fires soon after the heartbeat.
        var now = Date.now();
        if (now - lastWave < MIN_GAP_MS) return;

        // Snapshot the currently-visible targets, skipping any under the cursor
        // (the user already knows those are clickable).
        var pool = [];
        visible.forEach(function (el) {
            if (el.matches(':hover')) return;
            pool.push(el);
        });
        if (!pool.length) return;

        lastWave = now;
        shuffle(pool);

        // Asynchronous spacing: each element gets its own offset so the sweeps
        // never start (or peak) near-simultaneously.
        pool.forEach(function (el, i) {
            var delay = i * STAGGER_MS + (Math.random() * JITTER_MS * 2 - JITTER_MS);
            if (delay < 0) delay = 0;
            setTimeout(function () { sweep(el); }, delay);
        });
    }

    function sweep(el) {
        if (!el || !document.body.contains(el)) return;
        if (el.classList.contains('is-sweeping')) return; // mid-sweep — let it finish
        if (!visible.has(el)) return;                     // scrolled out of view
        el.classList.add('is-sweeping');
        // Remove one tick after the animation ends so it can re-trigger next wave.
        setTimeout(function () { el.classList.remove('is-sweeping'); }, SWEEP_MS + 80);
    }

    function shuffle(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    }

    /* Build a mask-image for an SVG icon host so the moving gradient is
       clipped to the icon's own silhouette instead of a rectangle. The
       mask is a WHITE-filled clone of the inline <svg>: white is the
       only color visible under BOTH mask-mode:alpha and mask-mode:luminance
       (MDN documents the two modes behaving differently), so this is
       robust regardless of which mode the browser applies. Only values
       literally equal to `currentColor` are swapped, so e.g. fill="none"
       on outlined icons is preserved. */
    function setupIconMask(host) {
        var svg = host.querySelector('svg');
        if (!svg) return;

        var clone = svg.cloneNode(true);
        clone.querySelectorAll('[fill="currentColor"]').forEach(function (n) {
            n.setAttribute('fill', '#ffffff');
        });
        clone.querySelectorAll('[stroke="currentColor"]').forEach(function (n) {
            n.setAttribute('stroke', '#ffffff');
        });
        if (clone.getAttribute('fill') === 'currentColor') {
            clone.setAttribute('fill', '#ffffff');
        }
        if (clone.getAttribute('stroke') === 'currentColor') {
            clone.setAttribute('stroke', '#ffffff');
        }

        var xml = new XMLSerializer().serializeToString(clone);
        var dataUrl = 'data:image/svg+xml,' + encodeURIComponent(xml);
        host.style.setProperty('--pulse-mask', 'url("' + dataUrl + '")');
    }

    // ---- Boot: the DOM is generated asynchronously from data.yaml by main.js,
    // so poll until the target nodes exist, then wire up. The poll is capped
    // (40 × 250ms = 10s) and main.js's 'portfolio:failed' event stops it
    // immediately when bootstrap has definitively failed. ----
    var POLL_MS = 250;
    var MAX_POLLS = 40;
    var polls = 0;
    var stopped = false;

    window.addEventListener('portfolio:failed', function () { stopped = true; });

    function tryBoot() {
        if (stopped) return;
        if (start()) return;
        if (++polls >= MAX_POLLS) return;
        setTimeout(tryBoot, POLL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryBoot);
    } else {
        tryBoot();
    }
})();
