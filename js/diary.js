/* ============================================================
   DEV_DIARY://LOG — DATA-DRIVEN DIARY PAGE
   Mirrors the architecture of main.js: content is loaded from
   diary/diary.yaml (the single source of truth), the DOM is generated
   programmatically, and GSAP/ScrollTrigger drive the motion.

   Each entry's full body now lives in its own Markdown file
   (diary/entries/*.md). The body is fetched on first expand,
   parsed to HTML with markdown-it, cached for re-opens, and
   mapped onto the existing diary-body__* CSS classes so the
   formatting stays consistent with the hand-built vocabulary.
   ============================================================ */

(function () {
    'use strict';

    // ---- SMALL HELPERS ----

    // Create an element with classes and optional innerHTML in one call.
    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    // Escape arbitrary text for safe insertion (used for non-HTML fields).
    function escapeText(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- MARKDOWN PARSER (markdown-it) ----

    // Lazily-built singleton. Its renderer rules are overridden so that the
    // generated HTML elements carry the existing diary-body__* classes —
    // meaning the Markdown output is styled by the very CSS that used to
    // target the hand-built blocks. No new styles are required for parity.
    let mdParser = null;

    function getMarkdownParser() {
        if (mdParser) return mdParser;
        if (typeof markdownit !== 'function') return null; // CDN blocked/unavailable

        const md = markdownit({
            html: false,        // escape raw HTML — bodies use Markdown syntax
            breaks: false,      // single newlines are NOT <br> (paragraph breaks only)
            linkify: false,     // don't auto-link bare URLs
            typographer: false  // preserve literal punctuation
        });

        // Generic passthrough so we can wrap the default renderer for any token.
        const proxy = (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);

        // Headings → .diary-body__heading
        const headingOpen = md.renderer.rules.heading_open || proxy;
        md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__heading');
            return headingOpen(tokens, idx, options, env, self);
        };

        // Paragraphs → .diary-body__paragraph
        const paragraphOpen = md.renderer.rules.paragraph_open || proxy;
        md.renderer.rules.paragraph_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__paragraph');
            return paragraphOpen(tokens, idx, options, env, self);
        };

        // Bullet & ordered lists → .diary-body__list
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

        // Blockquotes → .diary-body__quote
        const blockquoteOpen = md.renderer.rules.blockquote_open || proxy;
        md.renderer.rules.blockquote_open = function (tokens, idx, options, env, self) {
            tokens[idx].attrJoin('class', 'diary-body__quote');
            return blockquoteOpen(tokens, idx, options, env, self);
        };

        // Fenced code → .diary-body__code wrapper with a language label + <pre>,
        // matching the structure the old hand-built code blocks produced.
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

    // ---- ENTRY BODY LOADING (fetch + parse + cache, with error handling) ----

    // Cache of already-fetched+parsed entry bodies, keyed by file path.
    const bodyCache = new Map();

    // Fetch a Markdown body file, parse it to HTML, and cache the result.
    // Rejects (with a friendly Error) on network failure or a missing file
    // (e.g. 404) — callers render an inline error notice instead of crashing.
    function loadEntryBody(entry) {
        const path = entry.body;
        if (!path) return Promise.reject(new Error('No body file is referenced for this entry.'));

        // Serve from cache on repeat opens (avoids re-fetching).
        if (bodyCache.has(path)) return Promise.resolve(bodyCache.get(path));

        const md = getMarkdownParser();

        return fetch(path)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Log file not found (HTTP ${response.status}).`);
                }
                return response.text();
            })
            .then(markdown => {
                let html;
                if (md) {
                    html = md.render(markdown);
                } else {
                    // Parser unavailable (CDN blocked) — degrade gracefully to
                    // escaped plain text so the entry remains readable.
                    html = `<p class="diary-body__paragraph">${escapeText(markdown).replace(/\n{2,}/g, '</p><p class="diary-body__paragraph">')}</p>`;
                }
                bodyCache.set(path, html);
                return html;
            });
    }

    // Build the inline error notice shown when a body file can't be loaded.
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

    function generateHeader(page) {
        const header = document.getElementById('diaryHeader');

        const kicker = el('div', 'diary-header__kicker', 'FIELD NOTES // DEV JOURNAL');
        header.appendChild(kicker);

        // Split the title on "://" so the suffix gets the stroke treatment.
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

    function generateCard(entry) {
        const card = el('article', 'diary-card');
        card.setAttribute('data-index', entry.index || '');

        // Index watermark
        card.appendChild(el('div', 'diary-card__index', escapeText(entry.index || '')));

        // Head: date + title + line
        const head = el('div', 'diary-card__head');
        head.appendChild(el('div', 'diary-card__date', escapeText(entry.date || '')));
        head.appendChild(el('h2', 'diary-card__title', escapeText(entry.title || '')));
        head.appendChild(el('div', 'diary-card__line'));
        card.appendChild(head);

        // Media
        if (entry.image) {
            const media = el('div', 'diary-card__media');
            const img = document.createElement('img');
            img.src = entry.image;
            img.alt = entry.image_alt || '';
            img.loading = 'lazy';
            img.decoding = 'async';
            media.appendChild(img);
            card.appendChild(media);
        }

        // Preview body: summary + tags
        const preview = el('div', 'diary-card__body-preview');
        if (entry.summary) {
            preview.appendChild(el('p', 'diary-card__summary', escapeText(entry.summary)));
        }
        if (Array.isArray(entry.tags) && entry.tags.length) {
            const tags = el('div', 'diary-card__tags');
            entry.tags.forEach(tag => tags.appendChild(el('span', 'diary-tag', escapeText(tag))));
            preview.appendChild(tags);
        }
        card.appendChild(preview);

        // Read-more toggle (only if a Markdown body file is referenced).
        if (entry.body) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'diary-card__more';
            more.setAttribute('aria-expanded', 'false');
            more.innerHTML =
                '<span class="diary-card__more-prompt">></span>' +
                '<span class="diary-card__more-label">READ_LOG</span>' +
                '<span class="diary-card__more-arrow">→</span>';
            card.appendChild(more);

            // Expandable full entry — populated lazily on first open.
            const full = el('div', 'diary-card__full');
            full.setAttribute('aria-hidden', 'true');
            const inner = el('div', 'diary-card__full-inner');
            full.appendChild(inner);
            card.appendChild(full);

            // Toggle behaviour: fetch+parse the Markdown on first expand, then cache.
            more.addEventListener('click', () => toggleEntry(card, more, full, entry));
        }

        return card;
    }

    function toggleEntry(card, button, full, entry) {
        const isOpen = card.classList.contains('is-open');
        const label = button.querySelector('.diary-card__more-label');
        const inner = full.querySelector('.diary-card__full-inner');

        // Shared expand/collapse animation, factored out so it runs after the
        // body has been injected (keeping GSAP's height calc accurate).
        function collapse() {
            card.classList.remove('is-open');
            button.setAttribute('aria-expanded', 'false');
            full.setAttribute('aria-hidden', 'true');
            if (label) label.textContent = 'READ_LOG';
            if (prefersReducedMotion || typeof gsap === 'undefined') {
                full.style.height = '0';
                full.style.opacity = '0';
            } else {
                gsap.to(full, {
                    height: 0,
                    autoAlpha: 0,
                    duration: 0.4,
                    ease: 'power3.in',
                    onComplete: () => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); }
                });
            }
        }

        function expand() {
            card.classList.add('is-open');
            button.setAttribute('aria-expanded', 'true');
            full.setAttribute('aria-hidden', 'false');
            if (label) label.textContent = 'CLOSE_LOG';
            if (prefersReducedMotion || typeof gsap === 'undefined') {
                full.style.height = 'auto';
                full.style.opacity = '1';
            } else {
                gsap.to(full, {
                    height: 'auto',
                    autoAlpha: 1,
                    duration: 0.55,
                    ease: 'power3.out',
                    onComplete: () => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); }
                });
            }
        }

        if (isOpen) {
            collapse();
            return;
        }

        // If the body was already loaded (or errored), just expand.
        if (card.dataset.loaded === 'true') {
            expand();
            return;
        }

        // First open: fetch + parse the Markdown (or render an error notice),
        // mark as loaded, then expand so the user always sees a result.
        if (label) label.textContent = 'LOADING...';
        button.disabled = true;

        loadEntryBody(entry)
            .then(html => {
                inner.innerHTML = html;
            })
            .catch(err => {
                console.error(`Failed to load diary entry body "${entry.body}":`, err);
                inner.innerHTML = buildBodyError(err, entry);
            })
            .finally(() => {
                card.dataset.loaded = 'true';
                button.disabled = false;
                expand();
            });
    }

    function generateDiary(data) {
        const diary = data.diary || {};
        const page = diary.page || {};
        const entries = Array.isArray(diary.entries) ? diary.entries : [];

        // Page metadata
        if (page.title) {
            document.title = page.title;
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc && page.description) metaDesc.content = page.description;
        }

        // Background watermark + header
        document.getElementById('diaryBgText').textContent = page.bg_text || 'DIARY';
        generateHeader(page);

        // Nav entry count
        const navCount = document.getElementById('navCount');
        if (navCount) {
            navCount.textContent = `[${String(entries.length).padStart(2, '0')}]`;
        }

        // Entry cards
        const stack = document.getElementById('diaryStack');
        entries.forEach(entry => stack.appendChild(generateCard(entry)));
    }

    // ---- CUSTOM CURSOR (mirrors main.js initCursor, kept self-contained) ----

    function initCursor() {
        if (typeof gsap === 'undefined') return;
        const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        const cursorDot = document.querySelector('.cursor-dot');
        const cursorRing = document.querySelector('.cursor-ring');

        if (isTouchDevice || !cursorDot || !cursorRing) return;

        let cursorRevealed = false;
        const dotXTo = gsap.quickTo(cursorDot, 'x', { duration: 0.1, ease: 'power2.out' });
        const dotYTo = gsap.quickTo(cursorDot, 'y', { duration: 0.1, ease: 'power2.out' });
        const ringXTo = gsap.quickTo(cursorRing, 'x', { duration: 0.35, ease: 'power2.out' });
        const ringYTo = gsap.quickTo(cursorRing, 'y', { duration: 0.35, ease: 'power2.out' });

        document.addEventListener('mousemove', (e) => {
            const mx = e.clientX;
            const my = e.clientY;
            if (!cursorRevealed) {
                cursorRevealed = true;
                gsap.set(cursorDot, { x: mx, y: my, opacity: 1 });
                gsap.set(cursorRing, { x: mx, y: my, opacity: 1 });
                return;
            }
            dotXTo(mx);
            dotYTo(my);
            ringXTo(mx);
            ringYTo(my);
        });

        // Hover growth on interactive elements
        document.querySelectorAll('a, button, .diary-card').forEach(node => {
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
            // Reveal everything immediately, no motion.
            gsap.set('.diary-header, .diary-card', { autoAlpha: 1, y: 0 });
            return;
        }

        // Header reveal
        gsap.from('.diary-header > *', {
            autoAlpha: 0,
            y: 24,
            duration: 0.6,
            ease: 'power2.out',
            stagger: 0.08,
            delay: 0.1
        });

        // Staggered card reveals as they enter the viewport (ScrollTrigger.batch).
        gsap.set('.diary-card', { autoAlpha: 0, y: 40 });
        ScrollTrigger.batch('.diary-card', {
            start: 'top 85%',
            once: true,
            onEnter: (batch) => {
                gsap.to(batch, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.6,
                    ease: 'power2.out',
                    stagger: 0.12,
                    overwrite: true
                });
            }
        });

        // Keep trigger positions accurate on resize.
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 250);
        });
    }

    // ---- FAVICON (reuse the shared animator from favicon.js) ----

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

    // ---- BOOTSTRAP: LOAD YAML → GENERATE DOM → INIT ----

    (function bootstrap() {
        fetch('diary/diary.yaml')
            .then(response => {
                if (!response.ok) throw new Error(`Failed to load diary/diary.yaml: ${response.status}`);
                return response.text();
            })
            .then(yamlText => {
                const data = jsyaml.load(yamlText);

                generateDiary(data);
                initFavicon();
                initCursor();
                initAnimations();
            })
            .catch(err => {
                console.error('Dev Diary bootstrap failed:', err);
                document.body.insertAdjacentHTML('beforeend', `
                    <div style="position:relative;z-index:100;display:flex;align-items:center;justify-content:center;min-height:100vh;
                        padding:120px 30px 60px;text-align:center;">
                        <div>
                            <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:10px;color:#b5a898;">SYS::ERROR</p>
                            <p style="color:#6b6560;font-size:13px;">Failed to load diary/diary.yaml — ${err.message}</p>
                            <p style="margin-top:24px;"><a href="index.html" style="color:#b5a898;text-decoration:none;letter-spacing:0.2em;text-transform:uppercase;font-size:11px;">[← RETURN HOME]</a></p>
                        </div>
                    </div>
                `);
            });
    })();
})();
