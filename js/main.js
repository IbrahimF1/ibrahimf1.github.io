/* ============================================================
   PORTFOLIO://ENGINEER — DATA-DRIVEN BRUTALIST SCROLL ANIMATIONS
   All content is loaded from data.yaml — the single source of truth.
   DOM is generated programmatically; animations scale dynamically.
   ============================================================ */

// ---- SVG ICON TEMPLATES ----
const SVG_ICONS = {
    github: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9" /></svg>',
    linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-9,10v8h-3v-11h3v1h1v-1h4v1h1v10h-3v-8h-3Zm-9-4v-3h3v3h-3Zm3,1v11h-3v-11h3Z" /></svg>'
};

// Parse SVG string into a proper SVG DOM element (handles namespace correctly)
function parseSVG(svgString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.documentElement;
    // adoptNode moves the element into the current document's namespace
    return document.adoptNode(svgEl);
}

// ---- DOM GENERATION FUNCTIONS ----

function generateNav(data) {
    const navLinks = document.getElementById('navLinks');
    const mobileMenuLinks = document.getElementById('mobileMenuLinks');

    data.nav.forEach(item => {
        // Desktop nav link
        const link = document.createElement('a');
        link.href = `#${item.id}`;
        link.className = 'nav-link';
        link.dataset.section = item.data_section;
        link.textContent = item.label;
        navLinks.appendChild(link);

        // Mobile menu link
        const mobileLink = document.createElement('a');
        mobileLink.href = `#${item.id}`;
        mobileLink.className = 'mobile-menu-link';
        mobileLink.dataset.section = item.data_section;
        mobileLink.textContent = item.label;
        mobileMenuLinks.appendChild(mobileLink);
    });
}

function generateHero(data) {
    const hero = data.hero;
    const layers = document.getElementById('heroLayers');
    const meta = document.getElementById('heroMeta');

    // Layer 1: Background text
    const bgLayer = document.createElement('div');
    bgLayer.className = 'hero-layer hero-layer--bg';
    bgLayer.innerHTML = `<span class="hero-bg-text">${hero.bg_text}</span>`;
    layers.appendChild(bgLayer);

    // Layer 2: Mid elements
    const midLayer = document.createElement('div');
    midLayer.className = 'hero-layer hero-layer--mid';
    midLayer.innerHTML = `
        <div class="hero-tag hero-tag--top">${hero.tags.top}</div>
        <div class="hero-tag hero-tag--bottom">${hero.tags.bottom}</div>
    `;
    layers.appendChild(midLayer);

    // Layer 3: Name
    const nameLayer = document.createElement('div');
    nameLayer.className = 'hero-layer hero-layer--name';
    nameLayer.innerHTML = `
        <div class="hero-name">
            <span class="hero-name-line" data-line="1">${hero.name.line1}</span>
            <span class="hero-name-line" data-line="2">${hero.name.line2}</span>
        </div>
    `;
    layers.appendChild(nameLayer);

    // Layer 4: Foreground debris + social
    const fgLayer = document.createElement('div');
    fgLayer.className = 'hero-layer hero-layer--fg';

    // Debris
    hero.debris.forEach((d, i) => {
        const debris = document.createElement('div');
        debris.className = `hero-debris hero-debris--${i + 1}`;
        debris.textContent = d.content;
        fgLayer.appendChild(debris);
    });

    // Brackets
    const bracketLeft = document.createElement('div');
    bracketLeft.className = 'hero-bracket hero-bracket--left';
    bracketLeft.textContent = hero.brackets.left;
    fgLayer.appendChild(bracketLeft);

    const bracketRight = document.createElement('div');
    bracketRight.className = 'hero-bracket hero-bracket--right';
    bracketRight.textContent = hero.brackets.right;
    fgLayer.appendChild(bracketRight);

    // Social icons — using DOMParser for proper SVG namespace handling
    hero.social.forEach(s => {
        const floatDiv = document.createElement('div');
        floatDiv.className = `hero-social-float ${s.float_class}`;

        const link = document.createElement('a');
        link.href = s.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = `hero-social ${s.social_class}`;
        link.setAttribute('aria-label', s.aria_label);

        if (SVG_ICONS[s.platform]) {
            link.appendChild(parseSVG(SVG_ICONS[s.platform]));
        }

        floatDiv.appendChild(link);
        fgLayer.appendChild(floatDiv);
    });

    layers.appendChild(fgLayer);

    // Meta
    meta.innerHTML = `
        <span class="hero-meta-line">${hero.meta.scroll_text}</span>
        <span class="hero-meta-line hero-scroll-indicator">${hero.meta.scroll_indicator}</span>
    `;

    // Bottom glow element
    const glow = document.createElement('div');
    glow.className = 'hero-glow';
    document.getElementById('hero').appendChild(glow);

    // Startup animation overlay
    const overlay = document.createElement('div');
    overlay.className = 'startup-overlay';
    overlay.id = 'startupOverlay';
    document.body.appendChild(overlay);
}

function generateAbout(data) {
    const about = data.about;
    const container = document.getElementById('aboutContainer');
    const section = document.getElementById('about');

    // Block 1: Number + Heading
    const block1 = document.createElement('div');
    block1.className = 'about-block about-block--1';
    block1.innerHTML = `
        <div class="about-number">${about.number}</div>
        <h2 class="about-heading">${about.heading.join('<br>')}</h2>
    `;
    container.appendChild(block1);

    // Block 2: Text paragraphs
    const block2 = document.createElement('div');
    block2.className = 'about-block about-block--2';
    about.texts.forEach((text, i) => {
        const p = document.createElement('p');
        p.className = 'about-text' + (i > 0 ? ' about-text--secondary' : '');
        p.textContent = text;
        block2.appendChild(p);
    });
    container.appendChild(block2);

    // Block 3: Specs
    const block3 = document.createElement('div');
    block3.className = 'about-block about-block--3';
    const specsDiv = document.createElement('div');
    specsDiv.className = 'about-specs';
    about.specs.forEach(spec => {
        const row = document.createElement('div');
        row.className = 'spec-row';
        row.innerHTML = `
            <span class="spec-label">${spec.label}</span>
            <span class="spec-value">${spec.value}</span>
        `;
        specsDiv.appendChild(row);
    });
    block3.appendChild(specsDiv);
    container.appendChild(block3);

    // Debris — appended directly to the section for correct absolute positioning
    about.debris.forEach((d, i) => {
        const debris = document.createElement('div');
        debris.className = `about-debris about-debris--${i + 1}`;
        debris.textContent = d.content;
        section.appendChild(debris);
    });
}

function generateProjects(data) {
    const projects = data.projects;
    const stack = document.getElementById('projectsStack');
    const section = document.getElementById('projects');
    const headingBlock = document.getElementById('projectsHeadingBlock');

    // Background text
    document.getElementById('projectsBgText').textContent = projects.bg_text;

    // Project cards
    projects.items.forEach((project, i) => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.dataset.index = project.index;

        const tagsHtml = project.tags.map(t => `<span class="project-tag">${t}</span>`).join('');

        card.innerHTML = `
            <div class="project-card-image">
                <picture>
                    <source srcset="${project.image_webp}" type="image/webp">
                    <img src="${project.image_fallback}" alt="${project.image_alt}" loading="lazy">
                </picture>
            </div>
            <div class="project-card-overlay">
                <div class="project-card-number">${project.index}</div>
                <h3 class="project-card-title">${project.title_prefix}<span class="project-card-title-accent">${project.title_separator}</span>${project.title_suffix}</h3>
                <div class="project-card-line"></div>
                <p class="project-card-desc">${project.description}</p>
                <div class="project-card-tags">
                    ${tagsHtml}
                </div>
            </div>
            <div class="project-card-index">[${project.index}]</div>
        `;
        stack.appendChild(card);
    });

    // Debris — appended directly to the section
    projects.debris.forEach((d, i) => {
        const debris = document.createElement('div');
        debris.className = `projects-debris projects-debris--${i + 1}`;
        debris.textContent = d.content;
        section.appendChild(debris);
    });

    // Heading block
    const strokeClass = projects.heading.stroke_line === 2 ? 'projects-heading-stroke' : '';
    const nonStrokeClass = projects.heading.stroke_line === 1 ? 'projects-heading-stroke' : '';
    headingBlock.innerHTML = `
        <div class="projects-heading-number">${projects.heading.number}</div>
        <h2 class="projects-heading">${nonStrokeClass ? `<span class="${nonStrokeClass}">` : ''}${projects.heading.line1}${nonStrokeClass ? '</span>' : ''}<br>${strokeClass ? `<span class="${strokeClass}">` : ''}${projects.heading.line2}${strokeClass ? '</span>' : ''}</h2>
    `;
}

function generateExperience(data) {
    const experience = data.experience;
    const container = document.getElementById('expContainer');
    const section = document.getElementById('experience');

    // Timeline
    const timeline = document.createElement('div');
    timeline.className = 'exp-timeline';
    timeline.innerHTML = `
        <div class="exp-timeline-line"></div>
        <div class="exp-timeline-progress" id="expTimelineProgress"></div>
    `;
    container.appendChild(timeline);

    // Experience cards
    experience.items.forEach((exp, i) => {
        const card = document.createElement('div');
        card.className = 'exp-card';
        card.dataset.index = exp.index;

        const tagsHtml = exp.tags.map(t => `<span class="exp-tag">${t}</span>`).join('');

        card.innerHTML = `
            <div class="exp-card-marker"></div>
            <div class="exp-card-inner">
                <div class="exp-card-header">
                    <span class="exp-year">${exp.period}</span>
                    <span class="exp-index">[${exp.index}]</span>
                </div>
                <h3 class="exp-title">${exp.title}</h3>
                <div class="exp-company">${exp.company}</div>
                <div class="exp-line"></div>
                <p class="exp-desc">${exp.description}</p>
                <div class="exp-tags">
                    ${tagsHtml}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Debris — appended directly to the section
    experience.debris.forEach((d, i) => {
        const debris = document.createElement('div');
        debris.className = `exp-debris exp-debris--${i + 1}`;
        debris.textContent = d.content;
        section.appendChild(debris);
    });
}

function generateContact(data) {
    const contact = data.contact;
    const container = document.getElementById('contactContainer');
    const section = document.getElementById('contact');
    const footer = document.getElementById('contactFooter');

    // Debris — appended directly to the section
    contact.debris.forEach((d, i) => {
        const debris = document.createElement('div');
        debris.className = `contact-debris contact-debris--${i + 1}`;
        debris.setAttribute('aria-hidden', 'true');
        if (d.icon && SVG_ICONS[d.icon]) {
            debris.appendChild(parseSVG(SVG_ICONS[d.icon]));
        } else {
            debris.textContent = d.content;
        }
        section.appendChild(debris);
    });

    // Left block: heading + sub + links
    const leftBlock = document.createElement('div');
    leftBlock.className = 'contact-block contact-block--left';

    // Heading with character spans for animation
    const heading = document.createElement('h2');
    heading.className = 'contact-heading';

    [contact.heading.line1, contact.heading.line2].forEach((line, lineIdx) => {
        const lineSpan = document.createElement('span');
        lineSpan.className = 'contact-heading-line' + (lineIdx === 1 ? ' contact-highlight' : '');
        line.split('').forEach(char => {
            const charSpan = document.createElement('span');
            charSpan.className = 'contact-char';
            charSpan.dataset.char = char;
            charSpan.textContent = char;
            lineSpan.appendChild(charSpan);
        });
        heading.appendChild(lineSpan);
        if (lineIdx === 0) {
            heading.appendChild(document.createElement('br'));
        }
    });
    leftBlock.appendChild(heading);

    // Sub text
    const sub = document.createElement('div');
    sub.className = 'contact-sub';
    sub.innerHTML = contact.sub_text.replace(/\n/g, '<br>');
    leftBlock.appendChild(sub);

    // Contact links
    const linksDiv = document.createElement('div');
    linksDiv.className = 'contact-links';
    contact.links.forEach(link => {
        const a = document.createElement('a');
        a.href = link.url;
        a.className = 'contact-link';
        a.innerHTML = `
            <span class="contact-link-label">${link.label}</span>
            <span class="contact-link-value">${link.value}</span>
        `;
        linksDiv.appendChild(a);
    });
    leftBlock.appendChild(linksDiv);
    container.appendChild(leftBlock);

    // Footer
    contact.footer.forEach(text => {
        const span = document.createElement('span');
        span.textContent = text;
        footer.appendChild(span);
    });
}

// ---- ANIMATION INITIALIZATION ----

function initAnimations(data) {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

    // ---- CUSTOM CURSOR ----
    const isTouchDevice = window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const cursorDot = document.querySelector('.cursor-dot');
    const cursorRing = document.querySelector('.cursor-ring');

    if (!isTouchDevice && cursorDot && cursorRing) {
        let mouseX = 0, mouseY = 0;

        const dotXTo = gsap.quickTo(cursorDot, 'x', { duration: 0.1, ease: 'power2.out' });
        const dotYTo = gsap.quickTo(cursorDot, 'y', { duration: 0.1, ease: 'power2.out' });
        const ringXTo = gsap.quickTo(cursorRing, 'x', { duration: 0.35, ease: 'power2.out' });
        const ringYTo = gsap.quickTo(cursorRing, 'y', { duration: 0.35, ease: 'power2.out' });

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            dotXTo(mouseX);
            dotYTo(mouseY);
            ringXTo(mouseX);
            ringYTo(mouseY);
        });

        document.querySelectorAll('a, button, .exp-card, .project-card').forEach(el => {
            el.addEventListener('mouseenter', () => {
                gsap.to(cursorRing, { width: 60, height: 60, borderColor: 'var(--fg-bright)', duration: 0.2, ease: 'power2.out' });
            });
            el.addEventListener('mouseleave', () => {
                gsap.to(cursorRing, { width: 40, height: 40, borderColor: 'var(--fg-dim)', duration: 0.2, ease: 'power2.out' });
            });
        });
    }

    // ---- HAMBURGER MENU ----
    const hamburger = document.querySelector('.nav-hamburger');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileLinks = document.querySelectorAll('.mobile-menu-link');

    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.contains('is-open');
            if (isOpen) {
                mobileMenu.classList.remove('is-open');
                hamburger.classList.remove('is-active');
                hamburger.setAttribute('aria-expanded', 'false');
                mobileMenu.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            } else {
                mobileMenu.classList.add('is-open');
                hamburger.classList.add('is-active');
                hamburger.setAttribute('aria-expanded', 'true');
                mobileMenu.setAttribute('aria-hidden', 'false');
                document.body.style.overflow = 'hidden';
            }
        });

        mobileLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                mobileMenu.classList.remove('is-open');
                hamburger.classList.remove('is-active');
                hamburger.setAttribute('aria-expanded', 'false');
                mobileMenu.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';

                const targetId = link.getAttribute('href').replace('#', '');
                if (targetId === 'hero') {
                    gsap.to(window, { scrollTo: 0, duration: 0.8, ease: 'power3.inOut' });
                } else {
                    const target = document.getElementById(targetId);
                    if (target) {
                        gsap.to(window, { scrollTo: { y: target, offsetY: 0 }, duration: 0.8, ease: 'power3.inOut' });
                    }
                }
            });
        });
    }

    // ---- NAV INDEX COUNTER ----
    const navIndex = document.querySelector('.nav-index');
    const navSections = data.nav.map(item => item.id);

    function updateNavIndex() {
        const viewportCenter = window.innerHeight / 2;
        let activeIndex = 0;

        navSections.forEach((id, i) => {
            const el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top <= viewportCenter) {
                activeIndex = i;
            }
        });

        navIndex.textContent = `[${String(activeIndex).padStart(3, '0')}]`;
    }

    ScrollTrigger.create({
        trigger: 'body',
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: updateNavIndex
    });

    updateNavIndex();

    // ---- NAV LINK CLICK HANDLING ----
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').replace('#', '');
            if (targetId === 'hero') {
                gsap.to(window, { scrollTo: 0, duration: 0.8, ease: 'power3.inOut' });
            } else {
                const target = document.getElementById(targetId);
                if (target) {
                    gsap.to(window, { scrollTo: { y: target, offsetY: 0 }, duration: 0.8, ease: 'power3.inOut' });
                }
            }
        });
    });

    // ---- RESPONSIVE ANIMATIONS WITH gsap.matchMedia() ----
    const mm = gsap.matchMedia();

    mm.add({
        isDesktop: '(min-width: 601px)',
        isMobile: '(max-width: 600px)',
        reduceMotion: '(prefers-reduced-motion: reduce)'
    }, (context) => {
        const { isDesktop, isMobile, reduceMotion } = context.conditions;

        const m = (desktopVal) => isMobile ? Math.round(desktopVal * 0.4) : desktopVal;
        const mf = (desktopVal) => isMobile ? desktopVal * 0.4 : desktopVal;

        // ---- HERO: DECONSTRUCT ON SCROLL ----
        const heroTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#hero',
                start: 'top top',
                end: 'bottom top',
                scrub: isMobile ? 1 : 1.5,
                pin: true,
                pinSpacing: true
            }
        });

        heroTl.to('.hero-bg-text', {
            scale: isMobile ? 2 : 3,
            opacity: 0,
            duration: 1
        }, 0);

        heroTl.to('.hero-tag--top', {
            x: m(-300),
            rotation: -15,
            opacity: 0,
            duration: 1
        }, 0);

        heroTl.to('.hero-tag--bottom', {
            x: m(300),
            rotation: 15,
            opacity: 0,
            duration: 1
        }, 0);

        heroTl.to('.hero-name-line[data-line="1"]', {
            y: m(-200),
            x: m(-100),
            rotation: -8,
            skewX: 15,
            opacity: 0,
            duration: 1
        }, 0.1);

        heroTl.to('.hero-name-line[data-line="2"]', {
            y: m(200),
            x: m(100),
            rotation: 8,
            skewX: -15,
            opacity: 0,
            duration: 1
        }, 0.1);

        // Debris scatter — dynamically targets all hero debris
        for (let i = 1; i <= data.hero.debris.length; i++) {
            const debrisProps = getHeroDebrisAnim(i, m);
            heroTl.to(`.hero-debris--${i}`, { ...debrisProps, duration: 1 }, 0);
        }

        // Social icons scatter
        if (!reduceMotion) {
            data.hero.social.forEach((s, i) => {
                const socialEl = document.querySelector(`.${s.social_class}`);
                if (socialEl) {
                    const angle = (i * 137.5) * (Math.PI / 180); // golden angle distribution
                    heroTl.to(socialEl, {
                        x: m(Math.round(Math.cos(angle) * 250)),
                        y: m(Math.round(Math.sin(angle) * 180)),
                        rotation: Math.round(Math.cos(angle) * -25),
                        opacity: 0,
                        duration: 1
                    }, 0);
                }
            });
        }

        // Brackets close in
        heroTl.to('.hero-bracket--left', { x: m(200), rotation: 10, opacity: 0, duration: 1 }, 0);
        heroTl.to('.hero-bracket--right', { x: m(-200), rotation: -10, opacity: 0, duration: 1 }, 0);

        // Meta text fades
        heroTl.to('.hero-meta', { opacity: 0, y: m(50), duration: 0.5 }, 0);

        // Bottom glow fades out
        heroTl.to('.hero-glow', { opacity: 0, duration: 1 }, 0);

        // Hero social icon hover
        if (isDesktop && !reduceMotion) {
            document.querySelectorAll('.hero-social').forEach(icon => {
                const baseRotation = icon.classList.contains('hero-social--github') ? -8 : 6;

                icon.addEventListener('mouseenter', () => {
                    gsap.to(icon, {
                        opacity: 1,
                        rotation: 0,
                        scale: 1.25,
                        duration: 0.2,
                        ease: 'power2.out',
                        overwrite: 'auto'
                    });
                });

                icon.addEventListener('mouseleave', () => {
                    gsap.to(icon, {
                        opacity: 0.6,
                        rotation: baseRotation,
                        scale: 1,
                        duration: 0.3,
                        ease: 'power2.inOut',
                        overwrite: 'auto'
                    });
                });
            });
        }

        // ---- ABOUT: LAYOUT SHIFT ON SCROLL ----
        gsap.set('.about-block--1', { x: m(-100), opacity: 0 });
        gsap.set('.about-block--2', { x: m(100), opacity: 0, y: m(40) });
        gsap.set('.about-block--3', { y: m(80), opacity: 0 });

        const aboutEnterTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#about',
                start: 'top 70%',
                end: 'top 20%',
                scrub: 1
            }
        });

        aboutEnterTl
            .to('.about-block--1', { x: 0, opacity: 1, duration: 1 })
            .to('.about-block--2', { x: 0, opacity: 1, y: isMobile ? 0 : 40, duration: 1 }, 0.2)
            .to('.about-block--3', { y: 0, opacity: 1, duration: 1 }, 0.4);

        if (isDesktop) {
            const aboutShiftTl = gsap.timeline({
                scrollTrigger: {
                    trigger: '#about',
                    start: 'center center',
                    end: 'bottom top',
                    scrub: 2
                }
            });

            aboutShiftTl
                .to('.about-block--1', { x: 200, y: 50, rotation: 2, skewX: 3, duration: 1 }, 0)
                .to('.about-block--2', { x: -150, y: -30, rotation: -1, skewX: -2, duration: 1 }, 0)
                .to('.about-block--3', { y: -60, skewX: 5, duration: 1 }, 0);
        }

        // About debris parallax
        if (!isMobile) {
            for (let i = 1; i <= data.about.debris.length; i++) {
                const animProps = getAboutDebrisAnim(i);
                gsap.to(`.about-debris--${i}`, {
                    ...animProps,
                    scrollTrigger: {
                        trigger: '#about',
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: i % 2 === 0 ? 2 : 1
                    }
                });
            }
        }

        // ---- PROJECTS: DYNAMIC CARD ANIMATIONS ----
        gsap.set('.projects-heading-block', { y: isMobile ? 30 : 60, autoAlpha: 0 });

        gsap.timeline({
            scrollTrigger: {
                trigger: '#projects',
                start: 'top 65%',
                end: 'top 10%',
                scrub: 1.5
            }
        }).to('.projects-heading-block', { y: 0, autoAlpha: 1, duration: 0.25 });

        // Dynamic per-card exit animations — cycles through 3 patterns
        const projectCards = document.querySelectorAll('.project-card');
        projectCards.forEach((card, i) => {
            const patternIndex = i % 3;
            const keyframes = getProjectExitKeyframes(patternIndex, isMobile);

            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger: card,
                    start: 'top 15%',
                    end: 'bottom -20%',
                    scrub: 1.5
                }
            });
            keyframes.forEach((props) => {
                tl.to(card, props);
            });
        });

        // Card image parallax
        document.querySelectorAll('.project-card-image img').forEach(img => {
            gsap.fromTo(img, { y: 0 }, {
                y: isMobile ? -15 : -40,
                scrollTrigger: {
                    trigger: img.closest('.project-card'),
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1.5
                }
            });
        });

        // Heading skew
        gsap.to('.projects-heading-block', {
            x: isMobile ? 30 : 100,
            skewX: isMobile ? 5 : 15,
            autoAlpha: 0.3,
            scrollTrigger: {
                trigger: '#projects',
                start: 'center center',
                end: 'bottom top',
                scrub: 2
            }
        });

        // Background text animation
        gsap.timeline({
            scrollTrigger: {
                trigger: '#projects',
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1.5
            }
        }).to('.projects-bg-text', {
            scale: isMobile ? 1.2 : 1.5,
            autoAlpha: 0.5,
            x: isMobile ? -60 : -200,
            duration: 1
        });

        // Projects debris parallax
        if (!isMobile) {
            for (let i = 1; i <= data.projects.debris.length; i++) {
                const animProps = getProjectsDebrisAnim(i);
                gsap.to(`.projects-debris--${i}`, {
                    ...animProps,
                    scrollTrigger: {
                        trigger: '#projects',
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: [1, 1.5, 2, 1][i % 4]
                    }
                });
            }
        }

        // Project card hover micro-interactions
        if (isDesktop) {
            document.querySelectorAll('.project-card').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    gsap.to(card, { y: -4, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
                });
                card.addEventListener('mouseleave', () => {
                    gsap.to(card, { y: 0, duration: 0.3, ease: 'power2.inOut', overwrite: 'auto' });
                });
            });
        }

        // ---- EXPERIENCE: DYNAMIC CARD ENTRANCE + TIMELINE DRAW ----
        const expCards = document.querySelectorAll('.exp-card');

        // Set initial states dynamically — alternating left/right
        expCards.forEach((card, i) => {
            const xOffset = i % 2 === 0 ? m(-200 + (i * 25)) : m(200 - (i * 25));
            gsap.set(card, { x: xOffset, opacity: 0 });
        });

        gsap.set('.exp-card-inner', { opacity: 0, y: 20 });
        gsap.set('#expTimelineProgress', { height: '0%' });

        // Cards fly in — staggered
        const expEnterTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#experience',
                start: 'top 65%',
                end: 'top 15%',
                scrub: 1
            }
        });

        expCards.forEach((card, i) => {
            const inner = card.querySelector('.exp-card-inner');
            const staggerPos = i * 0.2;
            const innerPos = staggerPos + 0.35;

            expEnterTl
                .to(card, { x: 0, opacity: 1, duration: 0.4 }, staggerPos);

            if (inner) {
                expEnterTl
                    .to(inner, { opacity: 1, y: 0, duration: 0.3 }, innerPos);
            }
        });

        // Timeline progress
        gsap.to('#expTimelineProgress', {
            height: '100%',
            scrollTrigger: {
                trigger: '#experience',
                start: 'top 60%',
                end: 'bottom 40%',
                scrub: 1
            }
        });

        // Scroll-through shift
        const expShiftTl = gsap.timeline({
            scrollTrigger: {
                trigger: '#experience',
                start: '50% top',
                end: 'bottom top',
                scrub: 2,
                pin: false
            }
        });

        expCards.forEach((card, i) => {
            const shiftX = i % 2 === 0
                ? (isMobile ? 10 : 30 - i * 5)
                : (isMobile ? -8 : -(20 - i * 5));
            expShiftTl.to(card, {
                x: shiftX,
                opacity: 0.7 + (i % 2) * 0.1,
                duration: 1
            }, 0);
        });

        // Background text parallax
        gsap.to('.exp-bg-text', {
            x: isMobile ? -60 : -200,
            scrollTrigger: {
                trigger: '#experience',
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1
            }
        });

        // Experience debris parallax
        if (!isMobile) {
            for (let i = 1; i <= data.experience.debris.length; i++) {
                const animProps = getExpDebrisAnim(i);
                gsap.to(`.exp-debris--${i}`, {
                    ...animProps,
                    scrollTrigger: {
                        trigger: '#experience',
                        start: 'top bottom',
                        end: 'bottom top',
                        scrub: i % 2 === 0 ? 2 : 1
                    }
                });
            }
        }

        // Experience hover micro-interactions
        if (isDesktop) {
            document.querySelectorAll('.exp-card').forEach(card => {
                const inner = card.querySelector('.exp-card-inner');

                card.addEventListener('mouseenter', () => {
                    gsap.to(inner, { y: -4, duration: 0.2, ease: 'power2.out' });
                    gsap.to(card, { y: -2, duration: 0.2, ease: 'power2.out' });
                });

                card.addEventListener('mouseleave', () => {
                    gsap.to(inner, { y: 0, duration: 0.3, ease: 'power2.inOut' });
                    gsap.to(card, { y: 0, duration: 0.3, ease: 'power2.inOut' });
                });
            });
        }

        // ---- CONTACT: MASTER TIMELINE WITH INTERSECTION OBSERVER ----
        (function initContactAnimations() {
            const contactSection = document.querySelector('#contact');
            if (!contactSection) return;

            let hasAnimated = false;
            let masterTl = null;

            gsap.set('.contact-block--left', { y: mf(100), opacity: 0 });
            gsap.set('.contact-char', { opacity: 0, y: isMobile ? 15 : 30, skewX: isMobile ? 5 : 15 });

            gsap.set('.contact-sub', { x: mf(-200), opacity: 0 });
            gsap.set('.contact-link', { x: mf(-100), opacity: 0 });
            gsap.set('.contact-footer', { opacity: 0, y: 20 });

            function buildMasterTimeline() {
                const tl = gsap.timeline({ paused: true });

                // Phase 1: Debris fade in
                if (!isMobile && !reduceMotion) {
                    const debrisEls = document.querySelectorAll('#contact .contact-debris');
                    debrisEls.forEach((debris, i) => {
                        const animProps = getContactDebrisEntryAnim(i + 1);
                        tl.to(debris, {
                            ...animProps,
                            duration: 0.5 + Math.random() * 0.4,
                            ease: 'power2.out'
                        }, i * 0.05);
                    });
                }

                // Phase 3: Contact blocks
                tl.to('.contact-block--left', {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    ease: 'power3.out'
                }, 0.3);

                // Phase 4: Character-by-character heading
                tl.to('.contact-heading-line:first-of-type .contact-char', {
                    opacity: 1,
                    y: 0,
                    skewX: 0,
                    duration: 0.08,
                    stagger: 0.04,
                    ease: 'power2.out'
                }, 0.5);

                tl.to('.contact-heading-line:last-of-type .contact-char', {
                    opacity: 1,
                    y: 0,
                    skewX: 0,
                    duration: 0.1,
                    stagger: 0.05,
                    ease: 'back.out(2)'
                }, 0.85);

                // Phase 5: Sub text
                tl.to('.contact-sub', {
                    x: 0,
                    opacity: 1,
                    duration: 0.6,
                    ease: 'power2.out'
                }, 0.9);

                // Phase 6: Contact links
                tl.to('.contact-link', {
                    x: 0,
                    opacity: 1,
                    duration: 0.4,
                    stagger: 0.1,
                    ease: 'power2.out'
                }, 1.0);

                // Phase 9: Footer
                tl.to('.contact-footer', {
                    opacity: 1,
                    y: 0,
                    duration: 0.5,
                    ease: 'power2.out'
                }, 1.3);

                return tl;
            }

            // Debris parallax
            if (!isMobile && !reduceMotion) {
                const debrisEls = document.querySelectorAll('#contact .contact-debris');
                debrisEls.forEach((debris, i) => {
                    const animProps = getContactDebrisParallaxAnim(i + 1);
                    gsap.to(debris, {
                        ...animProps,
                        scrollTrigger: {
                            trigger: '#contact',
                            start: 'top bottom',
                            end: 'bottom top',
                            scrub: [1, 2, 1.5, 1, 1.5, 1.5, 2][i % 7]
                        }
                    });
                });
            }

            // IntersectionObserver
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !hasAnimated) {
                        hasAnimated = true;
                        masterTl = buildMasterTimeline();
                        masterTl.play();
                        observer.unobserve(contactSection);
                    }
                });
            }, {
                threshold: 0.25,
                rootMargin: '0px 0px -10% 0px'
            });

            observer.observe(contactSection);
        })();

        // ---- GLOBAL: SECTION LABELS PARALLAX ----
        gsap.utils.toArray('.section-label').forEach(label => {
            gsap.to(label, {
                y: isMobile ? -40 : -100,
                scrollTrigger: {
                    trigger: label.parentElement,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1
                }
            });
        });

        // ---- GLOBAL: GRID OVERLAY SHIFTS ----
        gsap.to('.grid-overlay', {
            x: isMobile ? 15 : 50,
            scrollTrigger: {
                trigger: 'body',
                start: 'top top',
                end: 'bottom bottom',
                scrub: 0.5
            }
        });

        return () => {
            // ScrollTrigger instances created inside matchMedia are auto-reverted
        };
    });
}

// ---- ANIMATION PATTERN HELPERS ----
// These functions provide cycling animation patterns so any number of
// cards/debris gets a unique but consistent animation.

function getHeroDebrisAnim(index, m) {
    const patterns = [
        { x: m(-200), y: m(-150), rotation: -45, opacity: 0 },
        { x: m(250), y: m(-100), rotation: 30, opacity: 0 },
        { x: m(-180), y: m(200), rotation: 60, opacity: 0 },
        { x: m(300), y: m(150), scale: 0.3, opacity: 0 },
        { x: m(200), y: m(-200), rotation: -90, opacity: 0 }
    ];
    return patterns[(index - 1) % patterns.length];
}

function getAboutDebrisAnim(index) {
    const patterns = [
        { y: -200 },
        { y: -100, x: 50 },
        { y: -150, x: -30 }
    ];
    return patterns[(index - 1) % patterns.length];
}

function getProjectsDebrisAnim(index) {
    const patterns = [
        { y: -200, rotation: -10 },
        { y: -120, x: 60, rotation: 15 },
        { y: -80, x: -40, rotation: -20 },
        { y: -150, x: 30, rotation: 45 }
    ];
    return patterns[(index - 1) % patterns.length];
}

function getExpDebrisAnim(index) {
    const patterns = [
        { y: -150 },
        { y: -80, x: 30 }
    ];
    return patterns[(index - 1) % patterns.length];
}

function getProjectExitKeyframes(patternIndex, isMobile) {
    const patterns = [
        // Pattern 0: fly right-up with 3D
        isMobile ? [
            { y: -30, skewX: 5, autoAlpha: 0.8, duration: 0.4 },
            { x: 80, y: -60, skewX: 8, autoAlpha: 0, duration: 0.6 }
        ] : [
            { y: -60, rotateY: 15, rotateX: -5, skewX: 10, scale: 0.95, autoAlpha: 0.8, duration: 0.4 },
            { x: 200, y: -150, rotateY: 45, rotateX: -20, scale: 0.7, skewX: 15, autoAlpha: 0, duration: 0.6 }
        ],
        // Pattern 1: fly left with rotation
        isMobile ? [
            { x: -60, y: -20, rotation: -4, autoAlpha: 0.7, duration: 0.5 },
            { x: -100, y: -40, rotation: -8, autoAlpha: 0, duration: 0.5 }
        ] : [
            { x: -250, y: -40, rotation: -8, skewX: -5, autoAlpha: 0.7, duration: 0.5 },
            { x: -350, y: -80, rotation: -15, scale: 0.9, autoAlpha: 0, duration: 0.5 }
        ],
        // Pattern 2: fly up with subtle rotation
        isMobile ? [
            { y: -50, rotation: 2, autoAlpha: 0.7, duration: 0.5 },
            { y: -100, rotation: -1, autoAlpha: 0, duration: 0.5 }
        ] : [
            { y: -100, rotation: 3, skewX: 4, autoAlpha: 0.7, duration: 0.5 },
            { y: -200, rotation: -2, scale: 1.05, skewX: 0, autoAlpha: 0, duration: 0.5 }
        ]
    ];
    return patterns[patternIndex];
}

function getContactDebrisEntryAnim(index) {
    const patterns = [
        { opacity: 0.12, x: -20 },
        { opacity: 0.25, y: -30 },
        { opacity: 0.1, x: 15 },
        { opacity: 0.08, y: -25 },
        { opacity: 0.2, x: 10 },
        { opacity: 0.15, y: -20, rotation: 10 },
        { opacity: 0.12, x: 15, rotation: -8 }
    ];
    return patterns[(index - 1) % patterns.length];
}

function getContactDebrisParallaxAnim(index) {
    const patterns = [
        { y: -180 },
        { y: -100, x: 40 },
        { y: -60, x: -30, rotation: 15 },
        { y: -120, x: 20 },
        { y: -80, x: -15, rotation: -20 },
        { y: -140, x: -25, rotation: 30 },
        { y: -90, x: 20, rotation: -15 }
    ];
    return patterns[(index - 1) % patterns.length];
}

// ---- STARTUP ANIMATION ----
// Immersive center-expand reveal with flip-in hero elements
function playStartupAnimation(data) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const overlay = document.getElementById('startupOverlay');

    // If reduced motion, skip animation entirely
    if (reduceMotion) {
        if (overlay) overlay.remove();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        // ---- Collect all hero elements ----
        const bgText = document.querySelector('.hero-bg-text');
        const nameLine1 = document.querySelector('.hero-name-line[data-line="1"]');
        const nameLine2 = document.querySelector('.hero-name-line[data-line="2"]');
        const tagTop = document.querySelector('.hero-tag--top');
        const tagBottom = document.querySelector('.hero-tag--bottom');
        const bracketLeft = document.querySelector('.hero-bracket--left');
        const bracketRight = document.querySelector('.hero-bracket--right');
        const debris = document.querySelectorAll('.hero-debris');
        const socialIcons = document.querySelectorAll('.hero-social');
        const socialFloats = document.querySelectorAll('.hero-social-float');
        const meta = document.querySelector('.hero-meta');
        const glow = document.querySelector('.hero-glow');
        const navBar = document.querySelector('.nav-bar');

        // ---- Capture original CSS-defined values before any GSAP manipulation ----
        const origTagTopX = tagTop ? gsap.getProperty(tagTop, 'x') : 0;
        const origTagBottomX = tagBottom ? gsap.getProperty(tagBottom, 'x') : 0;
        const origDebrisOpacity = Array.from(debris).map(d => parseFloat(gsap.getProperty(d, 'opacity')));
        const origSocialRotation = Array.from(socialIcons).map(s => parseFloat(gsap.getProperty(s, 'rotation')));
        const origSocialOpacity = Array.from(socialIcons).map(s => parseFloat(gsap.getProperty(s, 'opacity')));

        // ---- Set initial hidden states ----
        gsap.set(bgText, { scale: 0.2, opacity: 0, transformOrigin: 'center center' });
        gsap.set(nameLine1, { rotateX: -90, scale: 0.4, opacity: 0, transformOrigin: 'center center', transformPerspective: 800 });
        gsap.set(nameLine2, { rotateX: 90, scale: 0.4, opacity: 0, transformOrigin: 'center center', transformPerspective: 800 });
        gsap.set(tagTop, { rotateY: -80, x: 0, opacity: 0, transformOrigin: 'center center', transformPerspective: 600 });
        gsap.set(tagBottom, { rotateY: 80, x: 0, opacity: 0, transformOrigin: 'center center', transformPerspective: 600 });
        gsap.set(bracketLeft, { rotateY: 70, opacity: 0, transformOrigin: 'center center', transformPerspective: 600 });
        gsap.set(bracketRight, { rotateY: -70, opacity: 0, transformOrigin: 'center center', transformPerspective: 600 });
        gsap.set(debris, {
            rotateY: (i) => (i % 2 === 0 ? 90 : -90),
            scale: 0.3,
            opacity: 0,
            transformOrigin: 'center center',
            transformPerspective: 500
        });
        gsap.set(socialIcons, {
            rotateY: (i) => (i % 2 === 0 ? 100 : -100),
            scale: 0.3,
            opacity: 0,
            transformOrigin: 'center center',
            transformPerspective: 500
        });
        gsap.set(socialFloats, { opacity: 0 });
        gsap.set(meta, { y: 30, opacity: 0 });
        gsap.set(glow, { opacity: 0 });
        gsap.set(navBar, { y: -60, opacity: 0 });

        // ---- Build the timeline ----
        const tl = gsap.timeline({
            onComplete: () => {
                // Clear all inline styles so CSS takes over for scroll animations
                const elementsToClear = [bgText, nameLine1, nameLine2, tagTop, tagBottom,
                    bracketLeft, bracketRight, ...debris, ...socialIcons, ...socialFloats, meta, glow, navBar]
                    .filter(Boolean);
                gsap.set(elementsToClear, { clearProps: 'all' });

                if (overlay) overlay.remove();
                resolve();
            }
        });

        // ---- Phase 1: Overlay expands from center ----
        tl.to(overlay, {
            scale: 3,
            opacity: 0,
            duration: 1.4,
            ease: 'power3.inOut'
        }, 0);

        // ---- Phase 2: Background text scales in from center ----
        tl.to(bgText, {
            scale: 1,
            opacity: 1,
            duration: 1.4,
            ease: 'power3.out'
        }, 0.5);

        // ---- Phase 3: Name lines flip in from center ----
        tl.to(nameLine1, {
            rotateX: 0,
            scale: 1,
            opacity: 1,
            duration: 0.9,
            ease: 'back.out(1.4)'
        }, 0.8);

        tl.to(nameLine2, {
            rotateX: 0,
            scale: 1,
            opacity: 1,
            duration: 0.9,
            ease: 'back.out(1.4)'
        }, 0.95);

        // ---- Phase 4: Tags flip in to their original CSS positions ----
        tl.to(tagTop, {
            rotateY: 0,
            x: origTagTopX,
            opacity: 1,
            duration: 0.8,
            ease: 'back.out(1.2)'
        }, 1.1);

        tl.to(tagBottom, {
            rotateY: 0,
            x: origTagBottomX,
            opacity: 1,
            duration: 0.8,
            ease: 'back.out(1.2)'
        }, 1.2);

        // ---- Phase 5: Brackets flip outward ----
        tl.to(bracketLeft, {
            rotateY: 0,
            opacity: 0.3,
            duration: 0.7,
            ease: 'power3.out'
        }, 1.2);

        tl.to(bracketRight, {
            rotateY: 0,
            opacity: 0.3,
            duration: 0.7,
            ease: 'power3.out'
        }, 1.3);

        // ---- Phase 6: Debris stagger flip in to original opacities ----
        tl.to(debris, {
            rotateY: 0,
            scale: 1,
            opacity: (i) => origDebrisOpacity[i],
            duration: 0.5,
            ease: 'back.out(1.5)',
            stagger: 0.07
        }, 1.3);

        // ---- Phase 7: Social icons flip in to original rotations/opacities ----
        tl.to(socialIcons, {
            rotateY: 0,
            rotation: (i) => origSocialRotation[i],
            scale: 1,
            opacity: (i) => origSocialOpacity[i],
            duration: 0.6,
            ease: 'back.out(1.3)',
            stagger: 0.1
        }, 1.5);

        // Social float containers fade in
        tl.to(socialFloats, {
            opacity: 1,
            duration: 0.4,
            stagger: 0.1
        }, 1.5);

        // ---- Phase 8: Nav bar slides down ----
        tl.to(navBar, {
            y: 0,
            opacity: 1,
            duration: 0.6,
            ease: 'power3.out'
        }, 1.4);

        // ---- Phase 9: Meta text fades up ----
        tl.to(meta, {
            y: 0,
            opacity: 1,
            duration: 0.6,
            ease: 'power2.out'
        }, 1.8);

        // ---- Phase 10: Bottom glow fades in ----
        tl.to(glow, {
            opacity: 1,
            duration: 1.2,
            ease: 'power2.inOut'
        }, 2.4);
    });
}

// ---- REFRESH SCROLLTRIGGER ON RESIZE ----
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 250);
});

// ---- BOOTSTRAP: LOAD YAML → GENERATE DOM → INIT ANIMATIONS ----
(function bootstrap() {
    fetch('data.yaml')
        .then(response => {
            if (!response.ok) throw new Error(`Failed to load data.yaml: ${response.status}`);
            return response.text();
        })
        .then(yamlText => {
            const data = jsyaml.load(yamlText);

            // Update page title and meta from data
            if (data.site) {
                document.title = data.site.title || document.title;
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc && data.site.description) {
                    metaDesc.content = data.site.description;
                }
            }

            // Generate all DOM content
            generateNav(data);
            generateHero(data);
            generateAbout(data);
            generateProjects(data);
            generateExperience(data);
            generateContact(data);

            // Play startup animation, then initialize scroll animations
            playStartupAnimation(data).then(() => {
                initAnimations(data);
            });
        })
        .catch(err => {
            console.error('Portfolio bootstrap failed:', err);
            // Display a minimal error state
            document.body.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                    background:#0a0a0a;color:#c8c2b8;font-family:monospace;text-align:center;padding:20px;">
                    <div>
                        <p style="font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin-bottom:10px;">SYS::ERROR</p>
                        <p style="color:#6b6560;font-size:13px;">Failed to load data.yaml — ${err.message}</p>
                    </div>
                </div>
            `;
        });
})();
