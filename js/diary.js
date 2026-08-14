/* ============================================================
   DEV_DIARY://LOG — TRANSMISSION CONSOLE
   Content loads from diary/diary.yaml (single source of truth),
   the DOM is generated programmatically, and GSAP/ScrollTrigger
   drive the motion. Each entry renders as a full-viewport
   "plate"; its Markdown body (diary/entries/*.md) is fetched and
   parsed on first open into a fullscreen reader, then cached.
   ============================================================ */

(function () {
    'use strict';

    // ---- SMALL HELPERS ----

    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    function escapeText(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    // Estimates reading time from rendered HTML (~200 WPM, min 1 min).
    function computeReadingTime(html) {
        try {
            const probe = document.createElement('div');
            probe.innerHTML = html || '';
            const words = (probe.textContent || '').split(/\s+/).filter(Boolean);
            if (!words.length) return '1 MIN READ';
            return Math.max(1, Math.round(words.length / 200)) + ' MIN READ';
        } catch (e) {
            return '1 MIN READ';
        }
    }

    // Cheap reading-time estimate from raw text — used for plate badges
    // before the entry body has been fetched, then refined on first load.
    function estimateReadingTime(text) {
        const words = String(text || '').split(/\s+/).filter(Boolean);
        if (!words.length) return '1 MIN READ';
        return Math.max(1, Math.round(words.length / 200)) + ' MIN READ';
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- MARKDOWN PARSER (markdown-it, injected on demand) ----

    // Lazily-built singleton. The vendor script itself is only injected on
    // first reader open (see loadMarkdownIt) so initial page load stays lean.
    // Renderer rules add the diary-body__* classes so parsed Markdown is
    // styled by the existing vocabulary.
    let mdParser = null;
    let mdLoadPromise = null;

    // Module-scope entry list + currently-open entry (deep linking & reader nav).
    let allEntries = [];
    let currentEntry = null;

    function getMarkdownParser() {
        if (mdParser) return mdParser;
        if (typeof markdownit !== 'function') return null; // CDN blocked/unavailable

        const md = markdownit({
            html: false,
            breaks: false,
            linkify: false,
            typographer: false
        });

        const proxy = (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);

        const headingOpen = md.renderer.rules.heading_open || proxy;
        md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__heading');
            return headingOpen(tokens, idx, options, env, self);
        };

        const paragraphOpen = md.renderer.rules.paragraph_open || proxy;
        md.renderer.rules.paragraph_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__paragraph');
            return paragraphOpen(tokens, idx, options, env, self);
        };

        const bulletOpen = md.renderer.rules.bullet_list_open || proxy;
        md.renderer.rules.bullet_list_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__list');
            return bulletOpen(tokens, idx, options, env, self);
        };
        const orderedOpen = md.renderer.rules.ordered_list_open || proxy;
        md.renderer.rules.ordered_list_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__list');
            return orderedOpen(tokens, idx, options, env, self);
        };

        const blockquoteOpen = md.renderer.rules.blockquote_open || proxy;
        md.renderer.rules.blockquote_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__quote');
            return blockquoteOpen(tokens, idx, options, env, self);
        };

        md.renderer.rules.fence = function (tokens, idx) {
            const token = tokens[idx];
            const lang = token.info ? token.info.trim() : '';
            const label = lang
                ? `<span class="diary-body__code-label">${md.utils.escapeHtml(lang)}</span>`
                : '';
            const code = md.utils.escapeHtml(token.content);
            return `<div class="diary-body__code">${label}<pre>${code}</pre></div>`;
        };

        mdParser = md;
        return md;
    }

    // Dynamically injects vendor/markdown-it.min.js and resolves with the
    // parser singleton. The promise is cached so concurrent opens share a
    // single request; a failed load clears the cache to allow a retry.
    function loadMarkdownIt() {
        if (typeof markdownit === 'function') return Promise.resolve(getMarkdownParser());
        if (mdLoadPromise) return mdLoadPromise;

        mdLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                reject(new Error('Timed out loading vendor/markdown-it.min.js.'));
            }, 8000);
            script.onload = () => {
                clearTimeout(timer);
                if (typeof markdownit === 'function') resolve(getMarkdownParser());
                else reject(new Error('markdown-it loaded but did not register.'));
            };
            script.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Failed to load vendor/markdown-it.min.js.'));
            };
            script.src = 'vendor/markdown-it.min.js';
            document.head.appendChild(script);
        });

        // Swallow this derived rejection (it only resets the cache slot).
        mdLoadPromise.catch(() => { mdLoadPromise = null; });

        return mdLoadPromise;
    }

    // ---- ENTRY BODY LOADING (fetch + parse + cache, with error handling) ----

    const bodyCache = new Map();

    function loadEntryBody(entry) {
        const path = entry.body;
        if (!path) return Promise.reject(new Error('No body file is referenced for this entry.'));
        if (bodyCache.has(path)) return Promise.resolve(bodyCache.get(path));

        return fetch(path)
            .then(response => {
                if (!response.ok) throw new Error(`Log file not found (HTTP ${response.status}).`);
                return response.text();
            })
            .then(markdown => loadMarkdownIt()
                .then(md => md.render(markdown))
                .catch(() => (
                    // Parser unavailable (vendor script blocked) — degrade to plain text.
                    `<p class="diary-body__paragraph">${escapeText(markdown).replace(/\n{2,}/g, '</p><p class="diary-body__paragraph">')}</p>`
                ))
            )
            .then(html => {
                bodyCache.set(path, html);
                return html;
            });
    }

    function buildBodyError(err, entry) {
        const msg = escapeText(err.message || 'Unknown error');
        const path = escapeText(entry.body || '');
        return (
            '<div class="diary-body__error">' +
            '<span class="diary-body__error-label">ERR::LOG_UNREACHABLE</span>' +
            `<p class="diary-body__error-msg">${msg}</p>` +
            `<p class="diary-body__error-path">file: <code>${path}</code></p>` +
            '<p class="diary-body__error-hint">This entry\'s Markdown could not be loaded — it may have been moved, renamed, or deleted.</p>' +
            '</div>'
        );
    }

    // ---- DOM GENERATION ----

    // Reading-time badges on plates, keyed by entry index. Seeded from the
    // summary word count, refined once the entry body has actually loaded.
    const plateReadingTimes = new Map();

    function updatePlateReadingTime(entry, html) {
        const span = entry && plateReadingTimes.get(entry.index);
        if (span) span.textContent = computeReadingTime(html);
    }

    function generateHeader(page) {
        const header = document.getElementById('diaryHeader');
        if (!header) return;

        header.appendChild(el('div', 'diary-header__kicker', 'FIELD NOTES // DEV JOURNAL'));

        const rawTitle = page.title || 'DEV_DIARY://LOG';
        const titleParts = rawTitle.split('://');
        const titleHtml = titleParts.length > 1
            ? `${escapeText(titleParts[0])}<span class="stroke">://${escapeText(titleParts[1])}</span>`
            : escapeText(rawTitle);
        header.appendChild(el('h1', 'diary-header__title', titleHtml));

        if (page.intro) {
            header.appendChild(el('p', 'diary-header__intro', escapeText(page.intro)));
        }
    }

    function makeOpenable(node, entry) {
        if (!entry.body || !node) return node;
        const label = 'Open transmission ' + (entry.index || '') + (entry.title ? ': ' + entry.title : '');
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-label', label);
        node.classList.add('is-openable');
        node.addEventListener('click', () => openReader(entry));
        node.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openReader(entry);
            }
        });
        return node;
    }

    function generatePlate(entry, position) {
        const plate = el('article', 'plate');
        plate.setAttribute('data-index', entry.index || '');
        if (position % 2 === 1) plate.classList.add('plate--alt');

        // Giant outline index
        plate.appendChild(el('div', 'plate__index', escapeText(entry.index || '')));

        // Vertical date stamp
        if (entry.date) plate.appendChild(el('div', 'plate__date', escapeText(entry.date)));

        // Text column (anchored bottom)
        const text = el('div', 'plate__text');
        text.appendChild(el('div', 'plate__label', 'TRANSMISSION ' + escapeText(entry.index || '')));
        const title = el('h2', 'plate__title', escapeText(entry.title || ''));
        text.appendChild(makeOpenable(title, entry));
        if (entry.summary) text.appendChild(el('p', 'plate__summary', escapeText(entry.summary)));
        if (Array.isArray(entry.tags) && entry.tags.length) {
            const tagsHtml = entry.tags.map(t => escapeText(t)).join('&nbsp;/&nbsp;');
            text.appendChild(el('div', 'plate__tags', '<b>&#9612;TAGS</b>&nbsp;&nbsp;' + tagsHtml));
        }
        if (entry.body) {
            const readingTime = el('span', 'plate__reading-time', estimateReadingTime(entry.summary));
            plateReadingTimes.set(entry.index, readingTime);
            text.appendChild(readingTime);
        }
        if (entry.body) {
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'plate__open';
            open.innerHTML = '[ OPEN_TRANSMISSION ' + escapeText(entry.index || '') + ' &rarr; ]';
            open.addEventListener('click', () => openReader(entry));
            text.appendChild(open);
        }
        plate.appendChild(text);

        // Media column
        if (entry.image) {
            const media = el('div', 'plate__media');
            const picture = document.createElement('picture');
            if (entry.image_webp) {
                const source = document.createElement('source');
                source.srcset = entry.image_webp;
                source.type = 'image/webp';
                picture.appendChild(source);
            }
            const img = document.createElement('img');
            img.src = entry.image;
            img.alt = entry.image_alt || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            picture.appendChild(img);
            media.appendChild(picture);
            ['tl', 'tr', 'bl', 'br'].forEach(c => media.appendChild(el('span', 'plate__tick plate__tick--' + c)));
            plate.appendChild(makeOpenable(media, entry));
        }

        return plate;
    }

    function generateDiary(data) {
        const diary = data.diary || {};
        const page = diary.page || {};
        const entries = Array.isArray(diary.entries) ? diary.entries : [];
        allEntries = entries;

        if (page.title) document.title = page.title;
        if (page.description) {
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.content = page.description;
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) ogDesc.content = page.description;
        }

        const bg = document.getElementById('diaryBgText');
        if (bg) bg.textContent = page.bg_text || 'DIARY';

        generateHeader(page);

        const navCount = document.getElementById('navCount');
        if (navCount) navCount.textContent = `[${String(entries.length).padStart(2, '0')}]`;

        const stack = document.getElementById('diaryStack');
        if (stack) entries.forEach((entry, i) => stack.appendChild(generatePlate(entry, i)));

        buildRail(entries);

        return entries.length;
    }

    // ---- RAIL ----

    function buildRail(entries) {
        const rail = document.getElementById('diaryRail');
        if (!rail) return;
        const plates = document.querySelectorAll('.plate');
        entries.forEach((e, i) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'rail__dot';
            dot.setAttribute('aria-label', 'Go to transmission ' + (e.index || (i + 1)));
            dot.dataset.index = e.index || '';
            dot.addEventListener('click', () => {
                const plate = plates[i];
                if (plate) plate.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
            });
            rail.appendChild(dot);
        });
    }

    // ---- READER (fullscreen, lazy body load) ----

    // Lazily-created reading-time badge (cached after first use).
    let readingTimeEl = null;

    // Finds or creates the reading-time span inside .reader__meta. Never throws.
    function getReadingTimeEl() {
        try {
            const existing = document.getElementById('diaryReadingTime');
            if (existing) { readingTimeEl = existing; return existing; }
            if (readingTimeEl) return readingTimeEl;
            const span = document.createElement('span');
            span.className = 'reader__reading-time';
            span.id = 'diaryReadingTime';
            span.style.display = 'none';
            const dateEl = document.getElementById('diaryReaderDate');
            if (dateEl && dateEl.parentNode) {
                dateEl.parentNode.insertBefore(span, dateEl.nextSibling);
            } else {
                const meta = document.querySelector('.reader__meta');
                if (meta) meta.appendChild(span);
            }
            readingTimeEl = span;
            return span;
        } catch (e) {
            return null;
        }
    }

    function showReadingTime(html) {
        const rt = getReadingTimeEl();
        if (!rt) return;
        rt.textContent = computeReadingTime(html);
        rt.style.display = '';
    }

    function hideReadingTime() {
        const rt = getReadingTimeEl();
        if (!rt) return;
        rt.style.display = 'none';
    }

    // Element focus was on when the reader opened — restored on close.
    let readerReturnFocus = null;

    function openReader(entry) {
        const reader = document.getElementById('diaryReader');
        const inner = document.getElementById('diaryReaderInner');
        if (!reader || !inner) return;

        currentEntry = entry;

        // Only capture the origin on a cold open — neighbor flips shouldn't
        // overwrite it with focus that already lives inside the reader.
        if (!reader.classList.contains('is-open')) {
            readerReturnFocus = document.activeElement;
        }

        const idxEl = document.getElementById('diaryReaderIdx');
        const titleEl = document.getElementById('diaryReaderTitle');
        const dateEl = document.getElementById('diaryReaderDate');
        if (idxEl) idxEl.textContent = entry.index || '';
        if (titleEl) titleEl.textContent = entry.title || '';
        if (dateEl) dateEl.textContent = entry.date || '';

        updateShareTargets(entry);

        const reveal = () => {
            reader.classList.add('is-open');
            reader.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            const scroller = reader.querySelector('.reader__scroll');
            if (scroller) scroller.scrollTop = 0;
            const closeBtn = document.getElementById('diaryReaderClose');
            if (closeBtn) closeBtn.focus();
            // Persist the deep link without an extra history entry or scroll jump.
            if (window.history && history.replaceState && entry && entry.index) {
                history.replaceState(null, '', '#entry-' + entry.index);
            }
        };

        // Cached: open immediately.
        if (entry.body && bodyCache.has(entry.body)) {
            inner.innerHTML = bodyCache.get(entry.body);
            showReadingTime(inner.innerHTML);
            reveal();
            updateReaderNav(entry);
            return;
        }

        // First open: show the reader with a loading state, then fetch.
        inner.innerHTML = '<p class="reader__loading">DECODING TRANSMISSION</p>';
        hideReadingTime();
        reveal();
        updateReaderNav(entry);

        loadEntryBody(entry)
            .then(html => {
                inner.innerHTML = html;
                showReadingTime(html);
                updatePlateReadingTime(entry, html);
            })
            .catch(err => {
                console.error(`Failed to load diary entry body "${entry.body}":`, err);
                inner.innerHTML = buildBodyError(err, entry);
                hideReadingTime();
            })
            .finally(() => {
                const scroller = reader.querySelector('.reader__scroll');
                if (scroller) scroller.scrollTop = 0;
            });
    }

    function closeReader() {
        const reader = document.getElementById('diaryReader');
        if (!reader || !reader.classList.contains('is-open')) return;
        reader.classList.remove('is-open');
        reader.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        currentEntry = null;
        // Drop a deep-link fragment without adding a history entry.
        if (window.history && history.replaceState && entryFromHash(window.location.hash)) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        // Hand focus back to whatever opened the reader, if it's still in the DOM.
        if (readerReturnFocus && document.documentElement.contains(readerReturnFocus)) {
            readerReturnFocus.focus();
        }
        readerReturnFocus = null;
    }

    // Keeps Tab / Shift+Tab inside the open reader (pairs with aria-modal).
    function trapReaderTab(e, reader) {
        const focusables = Array.from(
            reader.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(node => !node.disabled && !node.hidden && node.offsetParent !== null);
        if (!focusables.length) { e.preventDefault(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
            if (active === first || !reader.contains(active)) { e.preventDefault(); last.focus(); }
        } else if (active === last || !reader.contains(active)) {
            e.preventDefault();
            first.focus();
        }
    }

    // ---- DEEP LINKING & READER NAV (entry-NN fragments, prev/next) ----

    // Maps a "#entry-NN" fragment to its entry object (tolerant of leading # / whitespace).
    function entryFromHash(hash) {
        if (!hash) return null;
        const match = String(hash).trim().match(/^#?entry-(.+)$/i);
        if (!match) return null;
        const idx = match[1];
        for (let i = 0; i < allEntries.length; i++) {
            if (allEntries[i] && String(allEntries[i].index) === idx) return allEntries[i];
        }
        return null;
    }

    // Opens the entry matching the fragment, but only if the reader is closed.
    function openEntryFromHash(hash) {
        const entry = entryFromHash(hash);
        if (!entry) return;
        const reader = document.getElementById('diaryReader');
        if (reader && reader.classList.contains('is-open')) return;
        openReader(entry);
    }

    // Moves to a neighboring entry (-1 prev, +1 next), clamped to the list bounds.
    function openNeighbor(delta) {
        if (!allEntries.length || !currentEntry) return;
        const currentIdx = allEntries.indexOf(currentEntry);
        if (currentIdx === -1) return;
        let next = currentIdx + delta;
        if (next < 0) next = 0;
        if (next > allEntries.length - 1) next = allEntries.length - 1;
        if (next === currentIdx) return;
        openReader(allEntries[next]);
    }

    // Enables/disables prev/next based on position; no-op if buttons are absent.
    function updateReaderNav(entry) {
        const prevBtn = document.getElementById('diaryReaderPrev');
        const nextBtn = document.getElementById('diaryReaderNext');
        if (!prevBtn && !nextBtn) return;
        if (!allEntries.length) return;
        const idx = entry ? allEntries.indexOf(entry) : -1;
        const apply = (btn, disabled) => {
            if (!btn) return;
            btn.disabled = disabled;
            if (disabled) btn.setAttribute('aria-disabled', 'true');
            else btn.removeAttribute('aria-disabled');
        };
        apply(prevBtn, idx <= 0);
        apply(nextBtn, idx === -1 || idx >= allEntries.length - 1);
    }

    // ---- SHARE (X intent / clipboard / native + toast) ----

    // Absolute URL for the open entry — built from the current origin,
    // falling back to the canonical GitHub Pages URL when that fails.
    function buildEntryUrl(entry) {
        let base = 'https://ibrahimf1.github.io/diary.html';
        try {
            if (window.location.origin && window.location.pathname) {
                const dir = window.location.pathname.replace(/[^/]*$/, '');
                base = new URL(dir + 'diary.html', window.location.origin).href;
            }
        } catch (e) {
            // Unusual origin (e.g. file://) — keep the canonical fallback.
        }
        return entry && entry.index ? base + '#entry-' + encodeURIComponent(entry.index) : base;
    }

    // Pre-Clipboard-API fallback: hidden textarea + execCommand.
    function legacyCopyText(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) {
            return false;
        }
    }

    function copyEntryLink(url) {
        const fallback = () => {
            if (legacyCopyText(url)) showToast('LINK COPIED');
            else showToast('COPY FAILED');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => showToast('LINK COPIED'), fallback);
        } else {
            fallback();
        }
    }

    // Best-effort analytics — never lets a missing tracker break sharing.
    function trackShare(entry) {
        if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('diary_share', { entry: (entry && entry.index) || '' });
        }
    }

    // Points the X/Twitter intent link at the open entry.
    function updateShareTargets(entry) {
        const xLink = document.getElementById('diaryReaderShareX');
        if (!xLink) return;
        const title = entry && entry.title ? entry.title : '';
        xLink.href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) +
            '&url=' + encodeURIComponent(buildEntryUrl(entry));
    }

    function initShare() {
        const xLink = document.getElementById('diaryReaderShareX');
        const copyBtn = document.getElementById('diaryReaderShareCopy');
        const nativeBtn = document.getElementById('diaryReaderShareNative');

        if (xLink) xLink.addEventListener('click', () => trackShare(currentEntry));

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!currentEntry) return;
                trackShare(currentEntry);
                copyEntryLink(buildEntryUrl(currentEntry));
            });
        }

        if (nativeBtn && navigator.share) {
            nativeBtn.hidden = false;
            nativeBtn.addEventListener('click', () => {
                if (!currentEntry) return;
                trackShare(currentEntry);
                const shareData = { url: buildEntryUrl(currentEntry) };
                if (currentEntry.title) shareData.title = currentEntry.title;
                navigator.share(shareData).catch(() => { /* user cancelled */ });
            });
        }
    }

    // ---- SHARE TOAST ----

    // Lazily-created confirmation toast (single aria-live region, reused).
    let toastEl = null;
    let toastTimer = 0;

    function showToast(message) {
        if (!toastEl) {
            toastEl = el('div', 'diary-toast');
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
    }

    // ---- TOUCH SWIPE (reader, prev/next) ----

    // Horizontal swipe (>60px, |dx| > 2|dy|) on the reader's scroll container
    // flips entries; vertical scrolling is untouched and swipes starting on
    // links/buttons are ignored. Respects the prev/next list bounds.
    function initSwipe(reader) {
        const scroller = reader ? reader.querySelector('.reader__scroll') : null;
        if (!scroller) return;

        let startX = 0;
        let startY = 0;
        let onControl = false;

        scroller.addEventListener('touchstart', (e) => {
            const t = e.changedTouches[0];
            startX = t.clientX;
            startY = t.clientY;
            onControl = !!(t.target && t.target.closest && t.target.closest('a, button'));
        }, { passive: true });

        scroller.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            startX = startY = 0;
            const blocked = onControl;
            onControl = false;
            if (blocked) return;
            if (Math.abs(dx) < 60 || Math.abs(dx) <= 2 * Math.abs(dy)) return;
            const idx = currentEntry ? allEntries.indexOf(currentEntry) : -1;
            if (idx === -1) return;
            if (dx > 0 && idx > 0) openNeighbor(-1);
            else if (dx < 0 && idx < allEntries.length - 1) openNeighbor(1);
        }, { passive: true });
    }

    function initReader() {
        const reader = document.getElementById('diaryReader');
        const closeBtn = document.getElementById('diaryReaderClose');
        if (closeBtn) closeBtn.addEventListener('click', closeReader);

        // Prev / next transmission buttons (markup lives in diary.html).
        const prevBtn = document.getElementById('diaryReaderPrev');
        const nextBtn = document.getElementById('diaryReaderNext');
        if (prevBtn) prevBtn.addEventListener('click', () => openNeighbor(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => openNeighbor(1));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { closeReader(); return; }
            if (!reader || !currentEntry) return;
            if (e.key === 'Tab') { trapReaderTab(e, reader); return; }
            const t = e.target;
            const typing = t && (/^(input|textarea|select)$/i.test(t.tagName || '') || t.isContentEditable);
            if (typing) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); openNeighbor(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); openNeighbor(1); }
        });

        if (reader) {
            reader.addEventListener('click', (e) => {
                // Close only when clicking the overlay chrome, not the content.
                if (e.target === reader) closeReader();
            });
        }

        initSwipe(reader);
        initShare();

        // React to fragment changes (RSS deep links) only while the reader is closed.
        window.addEventListener('hashchange', () => {
            if (reader && reader.classList.contains('is-open')) return;
            openEntryFromHash(window.location.hash);
        });
    }

    // ---- TELEMETRY (live clock, signal, cursor coords) ----

    function initTelemetry() {
        const clock = document.getElementById('conClock');
        const sig = document.getElementById('conSig');
        const xEl = document.getElementById('conX');
        const yEl = document.getElementById('conY');

        if (clock) {
            const pad = n => String(n).padStart(2, '0');
            const tick = () => {
                const d = new Date();
                clock.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
            };
            tick();
            setInterval(tick, 1000);
        }

        if (sig) {
            const N = 6;
            for (let i = 0; i < N; i++) sig.appendChild(document.createElement('i'));
            const bars = sig.querySelectorAll('i');
            const fluctuate = () => {
                const level = 2 + Math.floor(Math.random() * (N - 1));
                bars.forEach((b, i) => b.classList.toggle('on', i < level));
            };
            fluctuate();
            setInterval(fluctuate, 1400);
        }

        if (xEl && yEl) {
            let raf = 0;
            let lastX = 0, lastY = 0;
            window.addEventListener('mousemove', (e) => {
                lastX = e.clientX;
                lastY = e.clientY;
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    xEl.textContent = String(Math.round(lastX)).padStart(4, '0');
                    yEl.textContent = String(Math.round(lastY)).padStart(4, '0');
                });
            });
        }
    }

    // ---- SCROLL SPY (active plate + progress readout) ----

    function initScrollSpy(entryCount) {
        const pos = document.getElementById('conPos');
        const rail = document.getElementById('diaryRail');
        const dots = rail ? rail.querySelectorAll('.rail__dot') : [];
        const plates = document.querySelectorAll('.plate');

        let raf = 0;
        const update = () => {
            raf = 0;
            const mid = window.innerHeight / 2;
            let active = 0;
            plates.forEach((p, i) => {
                const r = p.getBoundingClientRect();
                const center = r.top + r.height / 2;
                if (center <= mid + 1) active = i;
            });
            plates.forEach((p, i) => p.classList.toggle('is-active', i === active));
            dots.forEach((d, i) => d.classList.toggle('is-active', i === active));
            if (pos) {
                const idx = (plates[active] && plates[active].dataset.index) || String(active + 1).padStart(2, '0');
                pos.textContent = `${idx}/${String(entryCount).padStart(2, '0')}`;
            }
        };
        const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        update();
    }

    // ---- CUSTOM CURSOR ----

    function initCursor() {
        if (typeof gsap === 'undefined') return;
        const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        const cursorDot = document.querySelector('.cursor-dot');
        const cursorRing = document.querySelector('.cursor-ring');
        if (isTouchDevice || !cursorDot || !cursorRing) return;

        // Only hide the native cursor once the custom one is wired up — see
        // the html.js-cursor-ready gate in the inline critical CSS.
        document.documentElement.classList.add('js-cursor-ready');

        let cursorRevealed = false;
        const dotXTo = gsap.quickTo(cursorDot, 'x', { duration: 0.1, ease: 'power2.out' });
        const dotYTo = gsap.quickTo(cursorDot, 'y', { duration: 0.1, ease: 'power2.out' });
        const ringXTo = gsap.quickTo(cursorRing, 'x', { duration: 0.35, ease: 'power2.out' });
        const ringYTo = gsap.quickTo(cursorRing, 'y', { duration: 0.35, ease: 'power2.out' });

        document.addEventListener('mousemove', (e) => {
            if (!cursorRevealed) {
                cursorRevealed = true;
                gsap.set(cursorDot, { x: e.clientX, y: e.clientY, opacity: 1 });
                gsap.set(cursorRing, { x: e.clientX, y: e.clientY, opacity: 1 });
                return;
            }
            dotXTo(e.clientX);
            dotYTo(e.clientY);
            ringXTo(e.clientX);
            ringYTo(e.clientY);
        });

        document.querySelectorAll('a, button, .is-openable').forEach(node => {
            node.addEventListener('mouseenter', () => {
                gsap.to(cursorRing, { width: 60, height: 60, borderColor: 'var(--fg-bright)', duration: 0.2, ease: 'power2.out' });
            });
            node.addEventListener('mouseleave', () => {
                gsap.to(cursorRing, { width: 40, height: 40, borderColor: 'var(--fg-dim)', duration: 0.2, ease: 'power2.out' });
            });
        });
    }

    // ---- SCROLL ANIMATIONS ----

    function initAnimations() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
        gsap.registerPlugin(ScrollTrigger);

        if (prefersReducedMotion) {
            gsap.set('.diary-header > *', { autoAlpha: 1, y: 0 });
            gsap.set('.plate__index, .plate__label, .plate__title, .plate__summary, .plate__tags, .plate__reading-time, .plate__open, .plate__media, .plate__date', { autoAlpha: 1, y: 0 });
            return;
        }

        gsap.from('.diary-header > *', {
            autoAlpha: 0,
            y: 30,
            duration: 0.7,
            ease: 'power2.out',
            stagger: 0.08,
            delay: 0.1
        });

        gsap.utils.toArray('.plate').forEach(plate => {
            const kids = plate.querySelectorAll(
                '.plate__index, .plate__date, .plate__label, .plate__title, .plate__summary, .plate__tags, .plate__reading-time, .plate__open, .plate__media'
            );
            gsap.set(kids, { autoAlpha: 0, y: 44 });
            ScrollTrigger.create({
                trigger: plate,
                start: 'top 72%',
                once: true,
                onEnter: () => gsap.to(kids, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.75,
                    ease: 'power2.out',
                    stagger: 0.09,
                    overwrite: true
                })
            });
        });

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 250);
        });
    }

    // ---- FAVICON ----

    function initFavicon() {
        if (typeof animateFavicon !== 'function' && typeof generateInitialsFavicon !== 'function') return;
        const opts = {
            darkColor: '#0a0a0a',
            lightColor: '#d4c5ab',
            size: 32,
            gridSize: 16,
            ditherStrength: 0.7,
            border: true,
            glitch: true,
            glitchCount: 3,
            animate: !prefersReducedMotion,
            fps: 12
        };
        const name = 'DEV DIARY';
        if (typeof animateFavicon === 'function') animateFavicon(name, opts);
        else generateInitialsFavicon(name, opts);
    }

    // ---- IDLE PREFETCH ----

    // Warms the HTTP cache for the first entry's body once the page is idle,
    // so the likely-first reader open is instant. Best-effort — errors
    // are swallowed and nothing is parsed here.
    function prefetchFirstEntryOnIdle() {
        const whenIdle = window.requestIdleCallback
            ? window.requestIdleCallback.bind(window)
            : (cb) => setTimeout(cb, 2500);
        whenIdle(() => {
            const first = allEntries[0];
            if (first && first.body && !bodyCache.has(first.body)) {
                fetch(first.body, { cache: 'default' }).catch(() => {});
            }
        });
    }

    // ---- BOOTSTRAP ----

    (function bootstrap() {
        fetch('diary/diary.yaml')
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load diary/diary.yaml: ${response.status}`);
                return response.text();
            })
            .then(yamlText => {
                const data = jsyaml.load(yamlText);

                const count = generateDiary(data);
                initFavicon();
                initCursor();
                initReader();
                initTelemetry();
                initScrollSpy(count);
                initAnimations();
                openEntryFromHash(window.location.hash);
                prefetchFirstEntryOnIdle();
            })
            .catch(err => {
                console.error('Dev Diary bootstrap failed:', err);
                document.body.insertAdjacentHTML('beforeend', `
                    <div style="position:relative;z-index:100;display:flex;align-items:center;justify-content:center;min-height:100vh;
                        padding:120px 30px 60px;text-align:center;">
                        <div>
                            <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:10px;color:#b5a898;">SYS::ERROR</p>
                            <p style="color:#827a70;font-size:13px;">Failed to load diary/diary.yaml — ${escapeText(err.message || 'Unknown error')}</p>
                            <p style="margin-top:24px;"><a href="index.html" style="color:#b5a898;text-decoration:none;letter-spacing:0.2em;text-transform:uppercase;font-size:11px;">[&larr; RETURN HOME]</a></p>
                        </div>
                    </div>
                `);
            });
    })();
})();
