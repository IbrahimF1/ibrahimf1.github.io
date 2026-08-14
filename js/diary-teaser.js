/* ============================================================
   DIARY TEASER — LATEST TRANSMISSIONS (homepage interstitial)
   ------------------------------------------------------------
   Sits between EXPERIENCE and CONTACT on index.html. Fetches the
   same diary/diary.yaml the diary page uses and renders the two
   most recent entries as gapless specimen cards deep-linking to
   diary.html#entry-NN. Purely progressive enhancement: the YAML
   is fetched once the browser is idle (or the band scrolls within
   ~1.5 viewport heights, whichever comes first), and ANY failure
   simply hides the section — the homepage never depends on it.
   ============================================================ */
(() => {
    'use strict';

    const SECTION_ID = 'diary-latest';
    const GRID_ID = 'diaryTeaserGrid';
    const ENTRY_COUNT = 2;
    const TAG_LIMIT = 3;
    const WORDS_PER_MINUTE = 180;
    const STAGGER_MS = 80;

    const hideSection = () => {
        const section = document.getElementById(SECTION_ID);
        if (section) section.hidden = true;
    };

    const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    ));

    // Rough hook only: the entry body is NOT fetched here, so this is an
    // estimate from the summary alone (round up, floor of 1 minute).
    const estimateMinutes = (text) => {
        const words = String(text || '').split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
    };

    const cardHtml = (entry) => {
        const tags = (Array.isArray(entry.tags) ? entry.tags : []).slice(0, TAG_LIMIT);
        const mins = estimateMinutes(entry.summary);
        return (
            `<a class="diary-teaser__card" href="diary.html#entry-${esc(entry.index)}" data-cursor="link">` +
            `<span class="diary-teaser__date">${esc(entry.date)}</span>` +
            `<span class="diary-teaser__title">${esc(entry.title)}</span>` +
            `<span class="diary-teaser__summary">${esc(entry.summary)}</span>` +
            (tags.length
                ? `<span class="diary-teaser__tags">${tags.map((tag) => `<span class="diary-teaser__tag">${esc(tag)}</span>`).join('')}</span>`
                : '') +
            `<span class="diary-teaser__time" title="Estimate from the entry summary — the full read runs longer">~${mins} MIN</span>` +
            `</a>`
        );
    };

    const render = (entries) => {
        const section = document.getElementById(SECTION_ID);
        const grid = document.getElementById(GRID_ID);
        if (!section || !grid) { hideSection(); return; }

        // Dates are YYYY.MM.DD strings, so lexicographic order is chronological;
        // the zero-padded index breaks ties (higher = newer).
        const latest = entries
            .slice()
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) ||
                String(b.index || '').localeCompare(String(a.index || '')))
            .slice(0, ENTRY_COUNT);
        if (!latest.length) { hideSection(); return; }

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) section.classList.add('diary-teaser--no-motion');

        grid.innerHTML = latest.map(cardHtml).join('');

        // Gentle reveal: park each card at opacity 0 / +12px, then release
        // them one by one (~80ms apart). Skipped entirely under reduced motion.
        if (!reduceMotion) {
            const cards = grid.querySelectorAll('.diary-teaser__card');
            cards.forEach((card) => card.classList.add('is-revealing'));
            cards.forEach((card, i) => {
                setTimeout(() => card.classList.remove('is-revealing'), 60 + i * STAGGER_MS);
            });
        }

        if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('teaser_render');
        }
    };

    const load = () => {
        const opts = { cache: 'default' };
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            opts.signal = AbortSignal.timeout(10000);
        }
        fetch('diary/diary.yaml', opts)
            .then((response) => {
                if (!response.ok) throw new Error(`Failed to load diary/diary.yaml: ${response.status}`);
                return response.text();
            })
            .then((yamlText) => {
                if (!window.jsyaml || typeof window.jsyaml.load !== 'function') {
                    throw new Error('YAML parser failed to load (vendor/js-yaml.min.js)');
                }
                const data = window.jsyaml.load(yamlText);
                const entries = data && data.diary && Array.isArray(data.diary.entries) ? data.diary.entries : [];
                render(entries);
            })
            .catch(() => hideSection());
    };

    // Any synchronous throw anywhere above/below degrades to a hidden band,
    // never a broken page.
    try {
        const section = document.getElementById(SECTION_ID);
        if (!section) return;

        let started = false;
        const start = () => {
            if (started) return;
            started = true;
            load();
        };

        // Idle path — the teaser is an enhancement and must never contend
        // with boot. requestIdleCallback gets a 2s deadline so buried tabs
        // still resolve; no-rIC browsers fall back to a plain timeout.
        if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 2000 });
        else setTimeout(start, 2000);

        // Eager path — have the cards painted BEFORE the band scrolls into
        // view (root expanded by 1.5 viewport heights on either side).
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver((observed) => {
                if (observed.some((o) => o.isIntersecting)) {
                    io.disconnect();
                    start();
                }
            }, { rootMargin: '150% 0px 150% 0px' });
            io.observe(section);
        }
    } catch (_) {
        hideSection();
    }
})();
