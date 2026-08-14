/* ============================================================
   COMMAND PALETTE (Cmd/Ctrl+K)
   ------------------------------------------------------------
   Keyboard-first navigation for the portfolio: jump to any
   section, open the dev diary, copy the email, or follow social
   links. Self-contained, lazy-built on first open. Uses GSAP
   smooth-scroll when available (else native scrollIntoView), and
   fully respects prefers-reduced-motion.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function smoothScrollTo(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (!reduceMotion && window.gsap && window.ScrollToPlugin) {
            gsap.to(window, { scrollTo: { y: el, offsetY: 0 }, duration: 0.7, ease: 'power3.inOut' });
        } else {
            el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
    }

    function openExternal(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function fallbackCopy(text) {
        try {
            var t = document.createElement('textarea');
            t.value = text;
            t.style.position = 'fixed';
            t.style.top = '0';
            t.style.left = '-9999px';
            document.body.appendChild(t);
            t.select();
            document.execCommand('copy');
            document.body.removeChild(t);
            return true;
        } catch (_) { return false; }
    }

    function copyEmail() {
        var email = 'ifaruquee1@gmail.com';
        var done = function () { if (typeof showToast === 'function') showToast('EMAIL COPIED'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(email).then(done, function () { if (fallbackCopy(email)) done(); });
        } else if (fallbackCopy(email)) { done(); }
    }

    function commands() {
        return document.getElementById('diary') ? diaryCommands() : portfolioCommands();
    }

    function portfolioCommands() {
        return [
            { label: 'Home',           hint: 'Section 00',           run: function () { smoothScrollTo('hero'); } },
            { label: 'About',          hint: 'Section 01',           run: function () { smoothScrollTo('about'); } },
            { label: 'Projects',       hint: 'Section 02',           run: function () { smoothScrollTo('projects'); } },
            { label: 'Experience',     hint: 'Section 03',           run: function () { smoothScrollTo('experience'); } },
            { label: 'Contact',        hint: 'Section 04',           run: function () { smoothScrollTo('contact'); } },
            { label: 'Back to top',    hint: 'Scroll',               run: function () { smoothScrollTo('hero'); } },
            { label: 'Open Dev Diary', hint: 'Page',                 run: function () { window.location.href = 'diary.html'; } },
            { label: 'Copy email',     hint: 'ifaruquee1@gmail.com', run: copyEmail },
            { label: 'GitHub',         hint: 'External',             run: function () { openExternal('https://github.com/IbrahimF1'); } },
            { label: 'LinkedIn',       hint: 'External',             run: function () { openExternal('https://www.linkedin.com/in/ibrahim-f1'); } }
        ];
    }

    // Diary commands are built from the rendered plates at open time, so they
    // reflect the current entries. "Open" routes through the #entry-NN deep link
    // the reader already understands (diary.js).
    function diaryCommands() {
        var list = [
            { label: 'Back to portfolio', hint: 'Page',   run: function () { window.location.href = 'index.html'; } },
            { label: 'Back to top',       hint: 'Scroll', run: function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); } }
        ];
        var plates = document.querySelectorAll('.plate');
        for (var i = 0; i < plates.length; i++) {
            (function (plate) {
                var titleEl = plate.querySelector('.plate__title');
                var title = (titleEl && titleEl.textContent ? titleEl.textContent.trim() : ('Entry ' + (plate.dataset.index || '')));
                var idx = plate.dataset.index || String(i + 1);
                list.push({
                    label: 'Go to: ' + title, hint: 'Transmission ' + idx,
                    run: function () { plate.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
                });
                list.push({
                    label: 'Open: ' + title, hint: 'Reader ' + idx,
                    run: function () { window.location.hash = 'entry-' + idx; }
                });
            })(plates[i]);
        }
        list.push({ label: 'GitHub',   hint: 'External', run: function () { openExternal('https://github.com/IbrahimF1'); } });
        list.push({ label: 'LinkedIn', hint: 'External', run: function () { openExternal('https://www.linkedin.com/in/ibrahim-f1'); } });
        return list;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    var palette = null, input = null, listEl = null;
    var filtered = [];
    var active = 0;
    var lastFocused = null;

    function build() {
        if (palette) return;
        palette = document.createElement('div');
        palette.className = 'cmdk';
        palette.setAttribute('role', 'dialog');
        palette.setAttribute('aria-modal', 'false');
        palette.setAttribute('aria-label', 'Command palette');
        palette.hidden = true;
        palette.innerHTML =
            '<div class="cmdk__panel">' +
              '<input class="cmdk__input" type="text" placeholder="Type a command or search…" aria-label="Search commands" aria-autocomplete="list" autocomplete="off" spellcheck="false">' +
              '<ul class="cmdk__list" role="listbox" aria-label="Commands"></ul>' +
              '<div class="cmdk__foot"><span>&uarr;&darr; NAVIGATE</span><span>&crarr; SELECT</span><span>ESC CLOSE</span></div>' +
            '</div>';
        document.body.appendChild(palette);
        input = palette.querySelector('.cmdk__input');
        listEl = palette.querySelector('.cmdk__list');

        input.addEventListener('input', function () {
            filter(input.value);
            active = 0;
            render();
        });
        input.addEventListener('keydown', onKeydown);
        palette.addEventListener('click', function (e) { if (e.target === palette) close(); });
        listEl.addEventListener('click', function (e) {
            var li = e.target.closest ? e.target.closest('.cmdk__item') : null;
            if (li) { var idx = parseInt(li.dataset.idx, 10); if (!isNaN(idx)) runFiltered(idx); }
        });
        listEl.addEventListener('mousemove', function (e) {
            var li = e.target.closest ? e.target.closest('.cmdk__item') : null;
            if (li) { var idx = parseInt(li.dataset.idx, 10); if (!isNaN(idx) && idx !== active) setActive(idx); }
        });
    }

    function filter(q) {
        q = (q || '').trim().toLowerCase();
        var all = commands();
        filtered = !q ? all : all.filter(function (c) {
            return (c.label + ' ' + c.hint).toLowerCase().indexOf(q) !== -1;
        });
    }

    function render() {
        var html = '';
        for (var i = 0; i < filtered.length; i++) {
            var c = filtered[i];
            html += '<li class="cmdk__item' + (i === active ? ' is-active' : '') + '" role="option" aria-selected="' + (i === active ? 'true' : 'false') + '" id="cmdk-item-' + i + '" data-idx="' + i + '">' +
                '<span class="cmdk__label">' + escapeHtml(c.label) + '</span>' +
                '<span class="cmdk__hint">' + escapeHtml(c.hint) + '</span>' +
                '</li>';
        }
        if (!filtered.length) html = '<li class="cmdk__empty" role="status">NO MATCHES</li>';
        listEl.innerHTML = html;
        if (input) input.setAttribute('aria-activedescendant', filtered.length ? ('cmdk-item-' + active) : '');
    }

    function setActive(i) {
        if (!filtered.length) return;
        active = (i + filtered.length) % filtered.length;
        render();
        var el = listEl.children[active];
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    function onKeydown(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); runFiltered(active); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
    }

    function runFiltered(i) {
        var c = filtered[i];
        if (!c) return;
        close();
        setTimeout(function () { c.run(); }, 0);
    }

    function open() {
        build();
        lastFocused = document.activeElement;
        filter('');
        active = 0;
        render();
        palette.hidden = false;
        document.body.style.overflow = 'hidden';
        setTimeout(function () { if (input) { input.focus(); if (input.select) input.select(); } }, 0);
    }

    function close() {
        if (!palette || palette.hidden) return;
        palette.hidden = true;
        document.body.style.overflow = '';
        if (input) input.value = '';
        if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch (_) {} }
    }

    function toggle() { if (palette && !palette.hidden) close(); else open(); }

    // Global shortcut: Cmd/Ctrl+K
    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            toggle();
        }
    });

    // Discoverable nav button
    var btn = document.getElementById('navCmdK');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); toggle(); });

    // Mobile menu row — the .mobile-menu-cmdk button is static markup placed
    // beside #mobileMenuLinks, so a delegated listener survives main.js's
    // dynamic population. Closes the mobile menu first (restores body scroll),
    // then opens the palette on the next frame. open() itself carries no
    // analytics, so the event is tracked here exactly once per invocation.
    document.addEventListener('click', function (e) {
        var hit = e.target && e.target.closest ? e.target.closest('.mobile-menu-cmdk') : null;
        if (!hit) return;
        e.preventDefault();
        var burger = document.querySelector('.nav-hamburger[aria-expanded="true"]');
        if (burger) burger.click();
        if (window.umami && typeof window.umami.track === 'function') window.umami.track('cmdk_open');
        requestAnimationFrame(function () { open(); });
    });

    window.commandPalette = { open: open, close: close, toggle: toggle };
})();
