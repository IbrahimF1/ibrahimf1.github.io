/* ============================================================
   IBRAHIM FARUQUEE — GAPLESS FOUNDRY SPECIMEN
   Data-driven (data.yaml) DOM generation + GSAP scroll choreography.
   ============================================================ */

// ---- SVG ICON TEMPLATES ----
const SVG_ICONS = {
    github: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9" /></svg>',
    github_outlined: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"><polygon points="23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9" /></svg>',
    linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-9,10v8h-3v-11h3v1h1v-1h4v1h1v10h-3v-8h-3Zm-9-4v-3h3v3h-3Zm3,1v11h-3v-11h3Z" /></svg>',
    arrow: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>'
};

function parseSVG(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    return document.adoptNode(doc.documentElement);
}

// ---- SHARED: SECTION HEAD BUILDER ----
function buildSectionHead({ num, eyebrow, lines, goldLast, dither = true }) {
    const titleHtml = lines.map((ln, i) => {
        const gold = (goldLast && i === lines.length - 1) ? ' gold' : '';
        return `<span class="${gold.trim()}">${ln}</span>`;
    }).join('<br>');
    const ditherHtml = dither ? `<div class="section-dither" aria-hidden="true"></div>` : '';
    return `
        <span class="section-num">${num}</span>
        <div class="section-head__meta"><span class="section-eyebrow">${eyebrow}</span></div>
        <div class="section-rule"></div>
        <div class="section-titlerow">
            <h2 class="section-title">${titleHtml}</h2>
            ${ditherHtml}
        </div>
    `;
}

// ---- DOM GENERATION ----

function generateNav(data) {
    const navLinks = document.getElementById('navLinks');
    const mobileMenuLinks = document.getElementById('mobileMenuLinks');

    data.nav.forEach(item => {
        const link = document.createElement('a');
        link.href = `#${item.id}`;
        link.className = 'nav-link';
        link.dataset.section = item.data_section;
        link.dataset.target = item.id;
        link.textContent = item.label;
        navLinks.appendChild(link);

        const mobileLink = document.createElement('a');
        mobileLink.href = `#${item.id}`;
        mobileLink.className = 'mobile-menu-link';
        mobileLink.dataset.section = item.data_section;
        mobileLink.dataset.target = item.id;
        mobileLink.textContent = item.label;
        mobileMenuLinks.appendChild(mobileLink);
    });
}

function generateHero(data) {
    const hero = data.hero;

    // Name lines
    const nameEl = document.getElementById('heroName');
    nameEl.innerHTML = `
        <span class="line line--solid">${hero.name.line1}</span>
        <span class="line line--stroke">${hero.name.line2}</span>
    `;

    // Role
    const roleEl = document.getElementById('heroRole');
    const roleText = [hero.role_top, hero.role_bottom].filter(Boolean).join(' / ');
    roleEl.textContent = roleText;

    // Location + status
    document.getElementById('heroLocation').textContent = hero.location || '';
    document.getElementById('heroStatus').textContent = hero.status || '';

    // Stat bar
    const statsEl = document.getElementById('heroStats');
    hero.stats.forEach(s => {
        const stat = document.createElement('div');
        stat.className = 'hero-stat';
        stat.innerHTML = `
            <div class="hero-stat-num" data-count="${s.value}" data-suffix="${s.suffix || ''}">0</div>
            <div class="hero-stat-label">${s.label}</div>
        `;
        statsEl.appendChild(stat);
    });

    // Social icon row beneath the role — each item is a link holding an
    // icon <div.hero-social> (the attention-pulse / cursor / bayer hook, kept
    // scoped to the icon box so the pulse mask paints correctly) + a label.
    const socialEl = document.getElementById('heroSocial');
    (hero.social || []).forEach(s => {
        if (!SVG_ICONS[s.platform]) return;
        const link = document.createElement('a');
        link.className = 'hero-social-link';
        link.href = s.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const icon = document.createElement('div');
        icon.className = `hero-social hero-social--${s.platform}`;
        icon.appendChild(parseSVG(SVG_ICONS[s.platform]));
        const label = document.createElement('span');
        label.className = 'hero-social__label';
        label.textContent = s.aria_label || s.platform;
        link.appendChild(icon);
        link.appendChild(label);
        socialEl.appendChild(link);
    });

    // Startup overlay
    const overlay = document.createElement('div');
    overlay.className = 'startup-overlay';
    overlay.id = 'startupOverlay';
    document.body.appendChild(overlay);
}

function generateMarquee(data) {
    if (!data.marquee) return;
    const items = data.marquee.items || [];
    const sep = data.marquee.separator || '✦';

    // Build the track content once, then duplicate for a seamless -50% loop.
    function buildSequence() {
        return items.map(t =>
            `<span class="marquee-item">${t}</span><span class="marquee-sep">${sep}</span>`
        ).join('');
    }
    const sequence = buildSequence();

    ['marqueeTrack1', 'marqueeTrack2'].forEach(id => {
        const track = document.getElementById(id);
        if (track) track.innerHTML = sequence + sequence;
    });
}

function generateAbout(data) {
    const about = data.about;
    const head = document.getElementById('aboutHead');
    head.innerHTML = buildSectionHead({
        num: about.number,
        eyebrow: about.eyebrow,
        lines: about.statement,
        goldLast: true
    });

    const grid = document.getElementById('aboutGrid');
    const cells = about.cells || [];
    const cellCount = Math.max(cells.length, 1);

    // Intro cell (left, spans full height of the spec column) — bio + CTA
    const intro = document.createElement('div');
    intro.className = 'about-cell about-cell--statement';
    intro.style.setProperty('--intro-rows', cellCount);
    intro.innerHTML = `
        <span class="cell-label">${about.eyebrow} — BIO</span>
        <div class="about-intro-body">
            <p class="about-body">${about.body}</p>
            <p class="about-body about-body--sec">${about.body_secondary}</p>
        </div>
        ${about.cta && about.cta.href ? `
            <a class="about-cta" href="${about.cta.href}" data-cursor="link">
                <span class="about-cta__prompt">&gt;</span>
                <span>${about.cta.label}</span>
                <span class="about-cta__arrow">&rarr;</span>
            </a>` : ''}
    `;
    grid.appendChild(intro);

    // Spec cells (right column)
    cells.forEach((c, i) => {
        const cell = document.createElement('div');
        const hi = c.highlight ? ' about-cell--highlight' : '';
        cell.className = `about-cell about-cell--auto${hi}`;
        cell.innerHTML = `
            <span class="cell-label">${c.label}</span>
            <span class="cell-value">${c.value}</span>
            <span class="about-cell__index">0${i + 1}</span>
        `;
        grid.appendChild(cell);
    });
}

// Adaptive project teaser: the lead holds exactly as many words as fit on a
// single line of the description, so its width tracks a normal wrapped line of
// the expanded remainder. The count is measured against the tile's rendered
// width, so it follows any change in horizontal space — viewport resize, tile
// span, or a font swap (which also moves the max-width:60ch cap) — without
// hard-coded breakpoints.
let descMeasureSpan = null;
function getMeasureSpan() {
    if (!descMeasureSpan) {
        descMeasureSpan = document.createElement('span');
        descMeasureSpan.style.position = 'absolute';
        descMeasureSpan.style.visibility = 'hidden';
        descMeasureSpan.style.whiteSpace = 'pre';   // don't wrap/collapse; width = single-line width
        descMeasureSpan.style.top = '0';
        descMeasureSpan.style.left = '-99999px';
        document.body.appendChild(descMeasureSpan);
    }
    return descMeasureSpan;
}

// Pixel width of `text` rendered with descEl's font metrics.
function measureDescText(descEl, text) {
    const cs = getComputedStyle(descEl);
    const el = getMeasureSpan();
    el.style.font = cs.font;
    el.style.letterSpacing = cs.letterSpacing;
    el.style.textTransform = cs.textTransform;
    el.textContent = text;
    return el.getBoundingClientRect().width;
}

// Greatest number of leading words of `fullDesc` that fit on one line inside
// descEl, accounting for the ellipsis (and its 2px margin) that follows.
function computeLeadWordCount(descEl, fullDesc) {
    const words = String(fullDesc || '').trim().split(/\s+/).filter(Boolean);
    const n = words.length;
    if (n <= 1) return n;
    const avail = descEl.getBoundingClientRect().width;
    if (!(avail > 0)) return 1;  // layout not ready; refined on fonts.ready / load / resize
    const ellipsisW = measureDescText(descEl, '…') + 2;  // .projects-tile__desc-ellipsis margin-left
    if (measureDescText(descEl, words.join(' ')) + ellipsisW <= avail) return n;  // whole desc is one line
    let lo = 1, hi = n - 1, best = 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const w = measureDescText(descEl, words.slice(0, mid).join(' ')) + ellipsisW + 1;  // +1px sub-pixel guard
        if (w <= avail) { best = mid; lo = mid + 1; }
        else { hi = mid - 1; }
    }
    return best;
}

function buildProjectsDescInner(description, leadWords) {
    const descWords = String(description || '').trim().split(/\s+/).filter(Boolean);
    const leadText = descWords.slice(0, leadWords).join(' ');
    const restText = descWords.slice(leadWords).join(' ');
    return `<span class="projects-tile__desc-lead">${leadText}</span>${restText ? `<span class="projects-tile__desc-ellipsis" aria-hidden="true">…</span><span class="projects-tile__desc-rest">${restText}</span>` : ''}`;
}

// Re-measure each tile's lead against its current rendered width.
function updateProjectsTeasers() {
    document.querySelectorAll('.projects-tile').forEach(tile => {
        const descEl = tile.querySelector('.projects-tile__desc');
        if (!descEl || tile.dataset.fullDesc === undefined) return;
        descEl.innerHTML = buildProjectsDescInner(tile.dataset.fullDesc, computeLeadWordCount(descEl, tile.dataset.fullDesc));
    });
}

function generateProjects(data) {
    const projects = data.projects;
    const head = document.getElementById('projectsHead');
    head.innerHTML = buildSectionHead({
        num: projects.number,
        eyebrow: projects.eyebrow,
        lines: [projects.heading.line1, projects.heading.line2],
        goldLast: true
    });

    const grid = document.getElementById('projectsGrid');
    (projects.items || []).forEach(p => {
        const tile = document.createElement('a');
        tile.className = `projects-tile projects-tile--${p.span || 'auto'}`;
        tile.href = p.repo_url || '#';
        tile.target = '_blank';
        tile.rel = 'noopener noreferrer';
        tile.setAttribute('aria-label', p.title);

        tile.dataset.fullDesc = p.description || '';
        const tagsHtml = (p.tags || []).map(t => `<span class="projects-tag">${t}</span>`).join('');
        const descHtml = `<p class="projects-tile__desc"></p>`;
        const repoHtml = p.repo_url
            ? `<span class="projects-tile__repo project-card-repo" aria-label="View source on GitHub">${SVG_ICONS.github_outlined}</span>`
            : '';

        // Media: <video> for animated items, otherwise a <picture> with a
        // WebP source and a raster fallback. Images/videos stay lazy.
        const mediaHtml = p.video
            ? `<video class="projects-tile__video" muted loop playsinline preload="none"
                 poster="${p.video.poster || p.image || ''}" aria-label="${p.image_alt || p.title || ''}">
                 <source src="${p.video.webm}" type="video/webm">
                 <source src="${p.video.mp4}" type="video/mp4">
               </video>`
            : `<picture>${p.image_webp ? `<source srcset="${p.image_webp}" type="image/webp">` : ''}
                 <img src="${p.image}" alt="${p.image_alt || ''}" loading="lazy" decoding="async">
               </picture>`;

        tile.innerHTML = `
            <div class="projects-tile__media">
                ${mediaHtml}
            </div>
            <div class="projects-tile__scrim"></div>
            <div class="projects-tile__body">
                <div class="projects-tile__top">
                    <span class="projects-tile__num">${p.index}</span>
                    ${p.award ? `<span class="projects-tile__award">${p.award}</span>` : ''}
                </div>
                <div class="projects-tile__foot">
                    <div class="projects-tile__tags">${tagsHtml}</div>
                    ${descHtml}
                    <h3 class="projects-tile__title">${p.title}</h3>
                </div>
            </div>
            ${repoHtml}
        `;
        grid.appendChild(tile);
    });

    // Initial teaser split from the tiles' rendered widths; refined on
    // font-ready / load / resize (see updateProjectsTeasers).
    updateProjectsTeasers();
    initLazyVideos();
}

// Lazy project videos: only play while the tile is on screen (saves CPU +
// battery), and never auto-play under prefers-reduced-motion (poster shows).
function initLazyVideos() {
    const videos = document.querySelectorAll('.projects-tile__video');
    if (!videos.length) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            const v = e.target;
            if (e.isIntersecting) {
                if (v.readyState === 0) v.load();
                const p = v.play();
                if (p && p.catch) p.catch(() => {});
            } else {
                v.pause();
            }
        });
    }, { rootMargin: '100px 0px', threshold: 0.05 });
    videos.forEach(v => io.observe(v));
}

function generateExperience(data) {
    const experience = data.experience;
    const head = document.getElementById('experienceHead');
    head.innerHTML = buildSectionHead({
        num: experience.number,
        eyebrow: experience.eyebrow,
        lines: [experience.heading.line1, experience.heading.line2],
        goldLast: true
    });

    const list = document.getElementById('experienceList');
    (experience.items || []).forEach(item => {
        const row = document.createElement('div');
        row.className = 'experience-row';
        const tagsHtml = (item.tags || []).map(t => `<span class="experience-tag">${t}</span>`).join('');
        row.innerHTML = `
            <div class="experience-row__index">${item.index}</div>
            <div class="experience-row__period">${item.period}</div>
            <div class="experience-row__role">
                <span class="ttl">${item.title}</span>
                <span class="co">${item.company}</span>
            </div>
            <div class="experience-row__desc">${item.description}</div>
            <div class="experience-row__tags">${tagsHtml}</div>
        `;
        list.appendChild(row);
    });
}

function generateContact(data) {
    const contact = data.contact;
    const head = document.getElementById('contactHead');
    head.innerHTML = buildSectionHead({
        num: contact.number,
        eyebrow: contact.eyebrow,
        lines: [contact.heading.line1, contact.heading.line2],
        goldLast: true,
        dither: false
    });

    // ASCII portrait frame — sits in the dither-swatch grid cell on the right
    // of the title so the point-cloud canvas (js/contact-cloud.js) composes as
    // a framed tile in the section-head grid instead of a full-bleed background.
    const portraitFrame = document.createElement('div');
    portraitFrame.className = 'contact-portrait';
    portraitFrame.setAttribute('aria-hidden', 'true');
    const contactTitleRow = head.querySelector('.section-titlerow');
    if (contactTitleRow) contactTitleRow.appendChild(portraitFrame);

    const grid = document.getElementById('contactGrid');
    (contact.links || []).forEach(link => {
        const tile = document.createElement('a');
        tile.className = 'contact-tile';
        tile.href = link.url;
        tile.target = link.url.startsWith('http') ? '_blank' : '';
        tile.rel = 'noopener noreferrer';
        tile.setAttribute('aria-label', link.label);
        tile.innerHTML = `
            <span class="contact-tile__label">${link.label}</span>
            <span class="contact-tile__value">${link.value}</span>
            <span class="contact-tile__arrow">&rarr;</span>
        `;
        grid.appendChild(tile);
    });

    // Footer
    const footer = document.getElementById('contactFooter');
    (contact.footer || []).forEach(t => {
        const span = document.createElement('span');
        span.textContent = t;
        footer.appendChild(span);
    });

}

// ---- CURSOR ----
function initCursor() {
    // Graceful degradation: if the GSAP CDN is blocked/unavailable, skip the
    // custom cursor entirely. Throwing here would abort bootstrap before the
    // startup overlay is removed, leaving a blank page. (Mirrors diary.js.)
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || typeof ScrollToPlugin === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    if (isTouch || !dot || !ring) return;

    // Only hide the native cursor once the custom one is actually wired up,
    // so a failed/blocking CDN load still leaves the user with a pointer.
    document.documentElement.classList.add('js-cursor-ready');

    let revealed = false;
    const dx = gsap.quickTo(dot, 'x', { duration: 0.1, ease: 'power2.out' });
    const dy = gsap.quickTo(dot, 'y', { duration: 0.1, ease: 'power2.out' });
    const rx = gsap.quickTo(ring, 'x', { duration: 0.35, ease: 'power2.out' });
    const ry = gsap.quickTo(ring, 'y', { duration: 0.35, ease: 'power2.out' });

    document.addEventListener('mousemove', (e) => {
        if (!revealed) {
            revealed = true;
            gsap.set(dot, { x: e.clientX, y: e.clientY, opacity: 1 });
            gsap.set(ring, { x: e.clientX, y: e.clientY, opacity: 1 });
            return;
        }
        dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    });
}

// ---- STAT COUNTERS (odometer-style count-up) ----
function animateCounters() {
    // Robust against a blocked GSAP CDN: render the final value directly so the
    // stat bar is never stuck at 0 even when the count-up tween can't run.
    const html = (v, suffix) => Math.round(v) + (suffix ? `<span class="suffix">${suffix}</span>` : '');
    const hasGsap = typeof gsap !== 'undefined';
    document.querySelectorAll('.hero-stat-num').forEach(el => {
        const to = parseInt(el.dataset.count, 10) || 0;
        const suffix = el.dataset.suffix || '';
        if (!to || !hasGsap) { el.innerHTML = html(to, suffix); return; }
        const obj = { v: 0 };
        gsap.to(obj, {
            v: to,
            duration: 1.8,
            ease: 'power3.out',
            onUpdate: () => {
                el.innerHTML = html(obj.v, suffix);
            }
        });
    });
}

// ---- NAV CLOCK (NYC time) ----
function initNavClock() {
    const el = document.getElementById('navClock');
    if (!el) return;
    function tick() {
        try {
            const t = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false
            }).format(new Date());
            el.textContent = `NYC ${t}`;
        } catch (_) { el.textContent = 'NYC'; }
    }
    tick();
    setInterval(tick, 30000);
}

// ---- STARTUP ANIMATION ----
function playStartupAnimation() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overlay = document.getElementById('startupOverlay');
    const hasVisited = localStorage.getItem('portfolio_visited') === 'true';

    if (reduceMotion || hasVisited) {
        if (overlay) overlay.remove();
        if (!hasVisited) localStorage.setItem('portfolio_visited', 'true');
        animateCounters();
        return Promise.resolve();
    }

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return new Promise((resolve) => {
        const nav = document.querySelector('.nav-bar');
        const nameLines = document.querySelectorAll('.hero-name .line');
        const role = document.querySelector('.hero-role');
        const socialRow = document.getElementById('heroSocial');
        const scrollHint = document.getElementById('heroScrollHint');
        const eyebrow = document.querySelector('.hero-eyebrow');
        const stats = document.querySelectorAll('.hero-stat');

        let finished = false;
        let safety = null;
        const finish = () => {
            if (finished) return;
            finished = true;
            if (safety) clearTimeout(safety);
            try {
                gsap.set([nav, role, socialRow, scrollHint, eyebrow, ...nameLines, ...stats].filter(Boolean), {
                    clearProps: 'opacity,transform,y,x,scale,rotation'
                });
            } catch (_) {}
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            localStorage.setItem('portfolio_visited', 'true');
            if (overlay) overlay.remove();
            resolve();
        };

        try {
            gsap.set([nav, role, socialRow, scrollHint, eyebrow].filter(Boolean), { opacity: 0 });
            gsap.set(nameLines, { yPercent: 115 });
            gsap.set(stats, { opacity: 0, y: 24 });

            const tl = gsap.timeline({ onComplete: finish });

            tl.to(overlay, { scale: 3, opacity: 0, duration: 1.1, ease: 'power3.inOut' }, 0)
              .to(nav, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.2)
              .to(eyebrow, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.35)
              .to(nameLines, { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.08 }, 0.45)
              .to(role, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.9)
              .to(socialRow, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.05)
              .to(scrollHint || [], { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.15)
              .to(stats, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 }, 1.0)
              .add(animateCounters, 1.2);

            safety = setTimeout(finish, 8000);
        } catch (err) {
            console.error('Startup animation failed, recovering:', err);
            finish();
        }
    });
}

// ---- ANIMATIONS ----
function initAnimations(data) {
    // Graceful degradation: without GSAP/ScrollTrigger, skip all motion. Content
    // stays fully visible (the gsap.from() calls below never run, so no element
    // is ever parked at opacity:0). Native anchor links + CSS still work.
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');

    // Cursor hover targets
    if (!isTouch && dot && ring) {
        document.querySelectorAll('a, button, .projects-tile, .contact-tile, .experience-row, .about-cell').forEach(el => {
            el.addEventListener('mouseenter', () => {
                gsap.to(ring, { width: 64, height: 64, borderColor: '#f2eee7', duration: 0.2, ease: 'power2.out' });
            });
            el.addEventListener('mouseleave', () => {
                gsap.to(ring, { width: 40, height: 40, borderColor: '#827a70', duration: 0.2, ease: 'power2.out' });
            });
        });
    }

    // ---- HAMBURGER ----
    const hamburger = document.querySelector('.nav-hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = Array.from(document.querySelectorAll('.mobile-menu-link'));
    let menuLastFocused = null;

    function setMenu(open) {
        if (!mobileMenu || !hamburger) return;
        const wasOpen = mobileMenu.classList.contains('is-open');
        mobileMenu.classList.toggle('is-open', open);
        hamburger.classList.toggle('is-active', open);
        hamburger.setAttribute('aria-expanded', String(open));
        mobileMenu.setAttribute('aria-hidden', String(!open));
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) {
            menuLastFocused = document.activeElement;
            requestAnimationFrame(() => mobileLinks[0] && mobileLinks[0].focus());
        } else if (wasOpen && menuLastFocused && menuLastFocused.focus) {
            menuLastFocused.focus();
        }
    }

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            setMenu(!mobileMenu.classList.contains('is-open'));
        });
        // Escape closes; Tab is trapped inside the menu while it is open.
        document.addEventListener('keydown', (e) => {
            if (!mobileMenu.classList.contains('is-open')) return;
            if (e.key === 'Escape') { e.preventDefault(); setMenu(false); hamburger.focus(); return; }
            if (e.key === 'Tab' && mobileLinks.length) {
                const first = mobileLinks[0], last = mobileLinks[mobileLinks.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }

    // ---- NAV LINK SMOOTH SCROLL + ACTIVE STATE ----
    const navSections = data.nav.map(i => i.id);

    function scrollTo(targetId) {
        if (targetId === 'hero') {
            gsap.to(window, { scrollTo: 0, duration: 0.8, ease: 'power3.inOut' });
        } else {
            const t = document.getElementById(targetId);
            if (t) gsap.to(window, { scrollTo: { y: t, offsetY: 0 }, duration: 0.8, ease: 'power3.inOut' });
        }
    }

    document.querySelectorAll('.nav-link, .mobile-menu-link, .nav-brand').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href') || '';
            if (!href.startsWith('#')) return;
            e.preventDefault();
            const id = href.replace('#', '');
            if (mobileMenu && mobileMenu.classList.contains('is-open')) setMenu(false);
            scrollTo(id);
        });
    });

    // Active nav link highlight
    const navLinks = document.querySelectorAll('.nav-link');
    function updateActive() {
        const center = window.innerHeight / 2;
        let active = navSections[0];
        navSections.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top <= center) active = id;
        });
        navLinks.forEach(l => {
            const isActive = l.dataset.target === active;
            l.classList.toggle('is-active', isActive);
            if (isActive) l.setAttribute('aria-current', 'true');
            else l.removeAttribute('aria-current');
        });
    }
    ScrollTrigger.create({ trigger: 'body', start: 'top top', end: 'bottom bottom', onUpdate: updateActive });
    updateActive();

    // ---- RESPONSIVE ANIMATIONS ----
    const mm = gsap.matchMedia();
    mm.add({
        isDesktop: '(min-width: 601px)',
        isMobile: '(max-width: 600px)',
        reduceMotion: '(prefers-reduced-motion: reduce)'
    }, (ctx) => {
        const { isMobile, reduceMotion } = ctx.conditions;
        const m = (v) => isMobile ? v * 0.4 : v;
        const listenerSignal = new AbortController();
        const on = (el, type, fn) => el.addEventListener(type, fn, { signal: listenerSignal.signal });

        if (reduceMotion) {
            // Reveal everything; just draw counters if not done.
            return () => listenerSignal.abort();
        }

        // ---- HERO PARALLAX (non-pinned) ----
        gsap.to('.hero-name', {
            yPercent: m(-18), opacity: 0,
            scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1 }
        });
        gsap.to('.hero-role', {
            yPercent: m(-30), opacity: 0,
            scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1 }
        });
        gsap.to('.hero-social-row', {
            yPercent: m(-36), opacity: 0,
            scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 1 }
        });

        // ---- SECTION HEADS ----
        gsap.utils.toArray('.section-head').forEach(head => {
            const num = head.querySelector('.section-num');
            const title = head.querySelector('.section-title');
            gsap.from(head.querySelectorAll('.section-eyebrow, .section-rule'), {
                opacity: 0, y: 20, duration: 0.5, stagger: 0.05, ease: 'power2.out',
                scrollTrigger: { trigger: head, start: 'top 85%', toggleActions: 'play none none reverse' }
            });
            // Dither window / portrait frame: opacity-only (no transform) so
            // its veil hole — measured from layout — always lines up with the
            // panel (and the portrait clip stays aligned).
            const swatch = head.querySelector('.section-dither, .contact-portrait');
            if (swatch) {
                gsap.from(swatch, {
                    opacity: 0, duration: 0.6, ease: 'power2.out',
                    scrollTrigger: { trigger: head, start: 'top 85%', toggleActions: 'play none none reverse' }
                });
            }
            if (num) gsap.from(num, {
                opacity: 0, x: -30, duration: 0.6, ease: 'power3.out',
                scrollTrigger: { trigger: head, start: 'top 85%', toggleActions: 'play none none reverse' }
            });
            if (title) {
                const parts = title.querySelectorAll('span');
                if (parts.length) {
                    gsap.from(parts, {
                        opacity: 0, yPercent: 60, duration: 0.7, stagger: 0.08, ease: 'power4.out',
                        scrollTrigger: { trigger: head, start: 'top 82%', toggleActions: 'play none none reverse' }
                    });
                } else {
                    gsap.from(title, {
                        opacity: 0, y: 40, duration: 0.7, ease: 'power3.out',
                        scrollTrigger: { trigger: head, start: 'top 82%', toggleActions: 'play none none reverse' }
                    });
                }
            }
        });

        // ---- ABOUT CELLS ----
        gsap.from('.about-cell', {
            opacity: 0, y: 40, duration: 0.6, stagger: 0.06, ease: 'power3.out',
            scrollTrigger: { trigger: '#aboutGrid', start: 'top 80%', toggleActions: 'play none none reverse' }
        });

        // ---- PROJECTS TILES ----
        gsap.utils.toArray('.projects-tile').forEach((tile, i) => {
            const baseDelay = i * 0.08;
            gsap.from(tile, {
                opacity: 0, y: 50, duration: 0.7, ease: 'power3.out',
                delay: baseDelay,
                scrollTrigger: { trigger: tile, start: 'top 88%', toggleActions: 'play none none reverse' }
            });
            // Layered reveal: description peek + title settle in just after the tile
            const inner = tile.querySelectorAll('.projects-tile__desc, .projects-tile__title');
            if (inner.length) {
                gsap.from(inner, {
                    opacity: 0, y: 18, duration: 0.55, stagger: 0.07, ease: 'power2.out',
                    delay: baseDelay + 0.12,
                    scrollTrigger: { trigger: tile, start: 'top 88%', toggleActions: 'play none none reverse' }
                });
            }
        });

        // ---- EXPERIENCE ROWS ----
        gsap.from('.experience-row', {
            opacity: 0, x: m(-40), duration: 0.6, stagger: 0.08, ease: 'power3.out',
            scrollTrigger: { trigger: '#experienceList', start: 'top 82%', toggleActions: 'play none none reverse' }
        });

        // ---- CONTACT ----
        gsap.from('.contact-tile', {
            opacity: 0, y: 40, duration: 0.6, stagger: 0.08, ease: 'power3.out',
            scrollTrigger: { trigger: '#contactGrid', start: 'top 82%', toggleActions: 'play none none reverse' }
        });

        // ---- MARQUEE: pause while off-screen to spare the compositor ----
        const marqueeTracks = document.querySelectorAll('.marquee-track');
        if (marqueeTracks.length && 'IntersectionObserver' in window) {
            const mObs = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) {
                    e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
                });
            }, { rootMargin: '60px 0px' });
            marqueeTracks.forEach(function (t) { mObs.observe(t); });
        }

        // ---- BAYER BACKGROUND SYNC ----
        if (window.bayerBg) {
            const sectionEls = navSections.map(id => document.getElementById(id)).filter(Boolean);
            if (sectionEls.length) {
                ScrollTrigger.create({
                    trigger: 'body', start: 'top top', end: 'bottom bottom',
                    onUpdate: () => {
                        const total = document.documentElement.scrollHeight - window.innerHeight;
                        if (total <= 0) return;
                        window.bayerBg.setSectionProgress((window.scrollY / total) * sectionEls.length);
                    }
                });
                ScrollTrigger.create({
                    trigger: 'body', start: 'top top', end: 'bottom bottom',
                    onUpdate: (self) => {
                        window.bayerBg.setScrollVelocity(Math.min(Math.abs(self.getVelocity()) / 5000, 1));
                    }
                });
                if (!isTouch) {
                    document.querySelectorAll('.projects-tile, .contact-tile, .experience-row, .nav-link, .hero-social').forEach(el => {
                        on(el, 'mouseenter', () => window.bayerBg.setInteractive(0.5));
                        on(el, 'mouseleave', () => window.bayerBg.setInteractive(0));
                    });
                }
            }
        }

        return () => listenerSignal.abort();
    });
}

// ---- DITHER WINDOW SYNC ----
// Cut a rectangular hole in each section's veil at the dither panel's box,
// so the fixed #bayer-bg canvas shows through next to the title. Measured
// via the offset chain (transform-immune) relative to the section; re-run
// on any layout change (resize, fonts, lazy images, ScrollTrigger refresh).
function syncDitherHoles() {
    document.querySelectorAll('.section-dither').forEach(panel => {
        const section = panel.closest('.section');
        if (!section) return;
        let x = 0, y = 0, node = panel;
        while (node && node !== section) {
            x += node.offsetLeft || 0;
            y += node.offsetTop || 0;
            const parent = node.offsetParent;
            if (!parent || parent === node || !section.contains(parent)) break;
            node = parent;
        }
        section.style.setProperty('--hx', x + 'px');
        section.style.setProperty('--hy', y + 'px');
        section.style.setProperty('--hw', panel.offsetWidth + 'px');
        section.style.setProperty('--hh', panel.offsetHeight + 'px');
    });
}

// ---- RESIZE / LOAD REFRESH ----
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { updateProjectsTeasers(); ScrollTrigger.refresh(); syncDitherHoles(); }, 250);
});
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { updateProjectsTeasers(); ScrollTrigger.refresh(); syncDitherHoles(); });
}
window.addEventListener('load', () => { updateProjectsTeasers(); ScrollTrigger.refresh(); syncDitherHoles(); });

function refreshOnLazyImages() {
    if (typeof ScrollTrigger === 'undefined') return;
    let t;
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) return;
        const onLoad = () => {
            clearTimeout(t);
            t = setTimeout(() => { ScrollTrigger.refresh(); syncDitherHoles(); }, 200);
        };
        img.addEventListener('load', onLoad, { once: true });
        img.addEventListener('error', onLoad, { once: true });
    });
}

// ---- SCROLL PROGRESS BAR ----
// Compositor-only: a single transform:scaleX update per frame, batched via rAF.
function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;
    let ticking = false;
    const update = () => {
        ticking = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(window.scrollY / max, 1) : 0})`;
    };
    window.addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
}

// ---- BACK TO TOP ----
// Reveals a floating control once the hero is scrolled past, and smoothly
// returns to the top. rAF-batched + passive so it never janks the main thread.
function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    let ticking = false;
    const threshold = Math.max(window.innerHeight * 0.9, 400);
    const update = () => {
        ticking = false;
        btn.classList.toggle('is-visible', window.scrollY > threshold);
    };
    window.addEventListener('scroll', () => {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    btn.addEventListener('click', () => {
        if (typeof gsap !== 'undefined') gsap.to(window, { scrollTo: 0, duration: 0.7, ease: 'power3.inOut' });
        else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    update();
}

// ---- HERO SCROLL HINT ----
// Click (or Enter) jumps to the first content section; the hint also fades
// out once the hero is scrolled away so it never lingers over content.
function initScrollHint(data) {
    const hint = document.getElementById('heroScrollHint');
    if (!hint) return;
    const firstContentId = (data.nav && data.nav[1] && data.nav[1].id) || 'about';
    hint.addEventListener('click', () => {
        const t = document.getElementById(firstContentId);
        if (t && window.gsap) gsap.to(window, { scrollTo: { y: t, offsetY: 0 }, duration: 0.8, ease: 'power3.inOut' });
        else if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
    // Fade hint out past the hero.
    const hero = document.getElementById('hero');
    if (hero && window.gsap) {
        gsap.to(hint, {
            opacity: 0, ease: 'none',
            scrollTrigger: { trigger: hero, start: 'top top', end: '25% top', scrub: true }
        });
    }
}

// ---- KEYBOARD SECTION NAVIGATION ----
// Number keys 1–N jump to each section; Home/End go to top/bottom; PageUp/Down
// step by viewport. Only fires when not typing in a field. Surfaces a toast so
// the navigation is discoverable.
function showToast(msg) {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('is-visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('is-visible'), 1600);
}

function initKeyboardNav(data) {
    const ids = (data.nav || []).map(i => i.id).filter(Boolean);
    if (!ids.length) return;
    const isTyping = (e) => {
        const t = e.target;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    document.addEventListener('keydown', (e) => {
        if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
        // Number keys → section jump
        if (e.key >= '1' && e.key <= '9') {
            const idx = parseInt(e.key, 10) - 1;
            if (idx < ids.length) {
                e.preventDefault();
                const t = document.getElementById(ids[idx]);
                if (t && window.gsap) gsap.to(window, { scrollTo: { y: t, offsetY: 0 }, duration: 0.8, ease: 'power3.inOut' });
                const labels = (data.nav || []).map(i => i.label);
                showToast('→ ' + (labels[idx] || ids[idx].toUpperCase()));
            }
            return;
        }
        if (e.key === 'Home') { e.preventDefault(); window.gsap ? gsap.to(window, { scrollTo: 0, duration: 0.6 }) : window.scrollTo(0, 0); return; }
        if (e.key === 'End' && window.gsap) {
            e.preventDefault();
            gsap.to(window, { scrollTo: { y: document.documentElement.scrollHeight }, duration: 0.6 });
        }
    });
}

// ---- BOOTSTRAP ----
(function bootstrap() {
    fetch('data.yaml')
        .then(r => {
            if (!r.ok) throw new Error(`Failed to load data.yaml: ${r.status}`);
            return r.text();
        })
        .then(yamlText => {
            const data = jsyaml.load(yamlText);

            if (data.site) {
                document.title = data.site.title || document.title;
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc && data.site.description) metaDesc.content = data.site.description;
            }

            // Animated favicon from the name
            let faviconName = '';
            if (data.hero && data.hero.name) {
                faviconName = `${data.hero.name.line1 || ''} ${data.hero.name.line2 || ''}`.trim();
            }
            const faviconOpts = {
                darkColor: '#0a0a0a', lightColor: '#e8c98c',
                size: 32, gridSize: 16, ditherStrength: 0.7,
                border: true, glitch: true, glitchCount: 3, animate: true, fps: 12
            };
            if (typeof animateFavicon === 'function') animateFavicon(faviconName, faviconOpts);
            else if (typeof generateInitialsFavicon === 'function') generateInitialsFavicon(faviconName, faviconOpts);

            generateNav(data);
            generateHero(data);
            generateMarquee(data);
            generateAbout(data);
            generateProjects(data);
            generateExperience(data);
            generateContact(data);

            initCursor();
            initNavClock();
            initScrollProgress();
            initBackToTop();

            playStartupAnimation().then(() => {
                updateProjectsTeasers();   // final split once fonts have settled, right at reveal
                initAnimations(data);
                initScrollHint(data);
                initKeyboardNav(data);
                refreshOnLazyImages();
                // Sync dither windows after layout settles (DOM gen + font swap).
                requestAnimationFrame(() => requestAnimationFrame(syncDitherHoles));
            });
        })
        .catch(err => {
            console.error('Portfolio bootstrap failed:', err);
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                    background:#0a0a0a;color:#c8c2b8;font-family:monospace;text-align:center;padding:20px;">
                    <div>
                        <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:10px;">SYS::ERROR</p>
                        <p style="color:#827a70;font-size:13px;">Failed to load data.yaml — ${err.message}</p>
                    </div>
                </div>`;
        });
})();
