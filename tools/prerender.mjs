#!/usr/bin/env node
/* ============================================================
   PRERENDER — static SEO fallback generator (zero npm deps)
   ------------------------------------------------------------
   Usage:
       node tools/prerender.mjs

   Run it after editing any of:
       - data.yaml            (portfolio content)
       - diary/diary.yaml     (diary entries / metadata)
       - diary/entries/*.md   (entry bodies)

   What it does:
       - index.html : fills the JS-populated containers between
         idempotent <!-- prerender:ID --> markers, mirroring the
         exact markup js/main.js + js/diary-teaser.js generate.
       - diary.html : fills #diaryHeader / #diaryStack between
         markers, mirroring js/diary.js plate markup.
       - diary/entries/<stem>.html : one static, JS-free article
         page per entry (full markdown body, OG + JSON-LD).
       - rss.xml     : full feed; items point at the static entry
         pages and carry the rendered body in <content:encoded>.
       - sitemap.xml : home + diary + one URL per entry page.

   The runtime scripts replace the prerendered container
   innerHTML on hydration, so this markup is safely overwritten
   whenever JS runs. Node >= 18 (ESM, node: modules only).
   ============================================================ */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const jsyaml = require('../vendor/js-yaml.min.js');
const markdownit = require('../vendor/markdown-it.min.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = 'https://ibrahimf1.github.io';
const ENTRY_DIR_REL = 'diary/entries';

// ---- SMALL HELPERS -------------------------------------------------------

function die(msg) {
    console.error('prerender: FAIL — ' + msg);
    process.exit(1);
}

// Same esc() as js/main.js — escapes every interpolated string below.
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);

// Same safeUrl() allow-list as js/main.js (hrefs/srcs come from YAML).
function safeUrl(url) {
    const u = String(url == null ? '' : url).trim();
    if (u === '') return '#';
    if (u.startsWith('#')) return u;
    if (/^(https?|mailto|tel):/i.test(u)) return u;
    if (u.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
    return u;
}

function readUtf8(rel) {
    try {
        return fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch (e) {
        die('cannot read ' + rel + ' — ' + e.message);
    }
}

function assertFile(rel, what) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
        die('missing ' + (what || 'referenced file') + ': ' + rel);
    }
}

function loadYaml(rel) {
    const doc = jsyaml.load(readUtf8(rel));
    if (!doc || typeof doc !== 'object') die(rel + ' parsed to an empty document');
    return doc;
}

const pad2 = (n) => String(n).padStart(2, '0');

// YAML date "YYYY.MM.DD" → "YYYY-MM-DD"
function yamlDateToISO(d) {
    const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(String(d || '').trim());
    if (!m) die('bad date "' + d + '" (expected YYYY.MM.DD)');
    return `${m[1]}-${m[2]}-${m[3]}`;
}

// YAML date "YYYY.MM.DD" → RFC-822 ("Fri, 12 Jun 2026 00:00:00 GMT")
function yamlDateToRFC822(d) {
    const iso = yamlDateToISO(d);
    return new Date(iso + 'T00:00:00Z').toUTCString();
}

const toISODate = (date) => date.toISOString().slice(0, 10);

// Absolute site URL for a root-relative asset/page path.
const absUrl = (p) => SITE + '/' + String(p || '').replace(/^\.\//, '');

// Entry-page-relative version of a root-relative path (pages live two levels deep).
const entryRel = (p) => '../../' + String(p || '').replace(/^\.\//, '');

// Word count of rendered HTML (tags stripped) — feeds reading-time estimates.
function htmlWords(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
}

// js/diary.js computeReadingTime — full rendered body, 200 wpm, min 1.
function readingTimeBody(html) {
    const words = htmlWords(html);
    if (!words) return '1 MIN READ';
    return Math.max(1, Math.round(words / 200)) + ' MIN READ';
}

// js/diary.js estimateReadingTime — plate badge from the summary, 200 wpm.
function readingTimePlate(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words) return '1 MIN READ';
    return Math.max(1, Math.round(words.length / 200)) + ' MIN READ';
}

// js/diary-teaser.js estimateMinutes — teaser card, 180 wpm, rounds up.
function teaserMinutes(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 180));
}

// ---- MARKDOWN (mirrors js/diary.js getMarkdownParser renderer rules) ----

function makeMarkdownParser() {
    const md = markdownit({ html: false, breaks: false, linkify: false, typographer: false });
    const proxy = (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);
    const wrap = (rule, cls) => {
        const prev = md.renderer.rules[rule] || proxy;
        md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
            tokens[idx].attrJoin('class', cls);
            return prev(tokens, idx, options, env, self);
        };
    };
    wrap('heading_open', 'diary-body__heading');
    wrap('paragraph_open', 'diary-body__paragraph');
    wrap('bullet_list_open', 'diary-body__list');
    wrap('ordered_list_open', 'diary-body__list');
    wrap('blockquote_open', 'diary-body__quote');
    md.renderer.rules.fence = (tokens, idx) => {
        const token = tokens[idx];
        const lang = token.info ? token.info.trim() : '';
        const label = lang
            ? `<span class="diary-body__code-label">${md.utils.escapeHtml(lang)}</span>`
            : '';
        const code = md.utils.escapeHtml(token.content);
        return `<div class="diary-body__code">${label}<pre>${code}</pre></div>`;
    };
    return md;
}

// ---- MARKER INJECTION (idempotent, cannot duplicate) ----------------------
//
// Path A (markers present): replace exactly the span between the open and
// close markers — nothing else in the file is touched.
// Path B (markers absent, e.g. first run or after runtime JS was saved over
// the file): locate the container element by its id and wrap its inner
// content with a fresh marker pair, matching the close tag by depth count.

function detectEol(html) {
    return html.includes('\r\n') ? '\r\n' : '\n';
}

function inject(html, id, content) {
    const open = `<!-- prerender:${id} -->`;
    const close = `<!-- /prerender:${id} -->`;
    const nOpen = html.split(open).length - 1;
    const nClose = html.split(close).length - 1;
    if (nOpen !== nClose || nOpen > 1) {
        die(`marker state invalid for "${id}" (open=${nOpen}, close=${nClose}) — refusing to continue`);
    }

    const eol = detectEol(html);
    let insertAt; // index just after the open tag's ">"

    if (nOpen === 1) {
        insertAt = html.indexOf(open);
    } else {
        const tagRx = new RegExp('<([a-zA-Z][\\w-]*)[^>]*\\sid="' + id + '"[^>]*>', 'i');
        const m = tagRx.exec(html);
        if (!m) die(`container #${id} not found in HTML — cannot insert prerender markers`);
        insertAt = m.index + m[0].length;
    }

    // Indentation of the line the marker lives on (cosmetic alignment only).
    const lineStart = html.lastIndexOf('\n', insertAt) + 1;
    const baseIndent = /^[ \t]*/.exec(html.slice(lineStart, insertAt))[0];
    const pad = baseIndent + '    ';
    const body = String(content).trim().split(/\r?\n/).map((ln) => (ln ? pad + ln : ln)).join(eol);

    const block = open + eol + body + eol + baseIndent + close;

    if (nOpen === 1) {
        const end = html.indexOf(close) + close.length;
        return html.slice(0, insertAt) + block + html.slice(end);
    }

    // Find the matching close tag for the container (depth-counted).
    const tagName = /<([a-zA-Z][\w-]*)/.exec(html.slice(lineStart, insertAt))[1];
    const rest = html.slice(insertAt);
    const events = [];
    const openRx = new RegExp('<' + tagName + '(?=[\\s>])', 'g');
    const closeRx = new RegExp('</' + tagName + '\\s*>', 'g');
    let t;
    while ((t = openRx.exec(rest)) !== null) events.push([t.index, 1]);
    while ((t = closeRx.exec(rest)) !== null) events.push([t.index, -1]);
    events.sort((a, b) => a[0] - b[0]);
    let depth = 1;
    let closeIdx = -1;
    for (const [i, d] of events) {
        depth += d;
        if (depth === 0) { closeIdx = i; break; }
    }
    if (closeIdx === -1) die(`no matching </${tagName}> found for container #${id}`);

    return html.slice(0, insertAt) + block + html.slice(insertAt + closeIdx);
}

// ---- SVG ICONS (verbatim from js/main.js SVG_ICONS) -----------------------

const SVG_ICONS = {
    github: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9" /></svg>',
    github_outlined: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"><polygon points="23 9 23 15 22 15 22 17 21 17 21 19 20 19 20 20 19 20 19 21 18 21 18 22 16 22 16 23 15 23 15 18 14 18 14 17 15 17 15 16 17 16 17 15 18 15 18 14 19 14 19 9 18 9 18 6 16 6 16 7 15 7 15 8 14 8 14 7 10 7 10 8 9 8 9 7 8 7 8 6 6 6 6 9 5 9 5 14 6 14 6 15 7 15 7 16 9 16 9 18 7 18 7 17 6 17 6 16 4 16 4 17 5 17 5 19 6 19 6 20 9 20 9 23 8 23 8 22 6 22 6 21 5 21 5 20 4 20 4 19 3 19 3 17 2 17 2 15 1 15 1 9 2 9 2 7 3 7 3 5 4 5 4 4 5 4 5 3 7 3 7 2 9 2 9 1 15 1 15 2 17 2 17 3 19 3 19 4 20 4 20 5 21 5 21 7 22 7 22 9 23 9" /></svg>',
    linkedin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m22,2v-1H2v1h-1v20h1v1h20v-1h1V2h-1Zm-9,10v8h-3v-11h3v1h1v-1h4v1h1v10h-3v-8h-3Zm-9-4v-3h3v3h-3Zm3,1v11h-3v-11h3Z" /></svg>'
};

// ---- INDEX GENERATORS (mirror js/main.js markup exactly) ------------------

// js/main.js buildSectionHead — same tags/classes; class="" mirrors the
// template's `${gold.trim()}` for non-gold lines. `titleRowExtra` mirrors
// what generateContact appends INSIDE .section-titlerow (portrait frame).
function buildSectionHead({ num, eyebrow, lines, goldLast, dither = true, titleRowExtra = '' }) {
    const titleHtml = (lines || []).map((ln, i) => {
        const gold = (goldLast && i === lines.length - 1) ? ' gold' : '';
        return `<span class="${gold.trim()}">${esc(ln)}</span>`;
    }).join('<br>');
    const ditherHtml = dither ? `\n    <div class="section-dither" aria-hidden="true"></div>` : '';
    return [
        `<span class="section-num">${esc(num)}</span>`,
        `<div class="section-head__meta"><span class="section-eyebrow">${esc(eyebrow)}</span></div>`,
        `<div class="section-rule"></div>`,
        `<div class="section-titlerow">`,
        `    <h2 class="section-title">${titleHtml}</h2>${ditherHtml}${titleRowExtra ? '\n    ' + titleRowExtra : ''}`,
        `</div>`
    ].join('\n');
}

function genNavLinks(data) {
    return (data.nav || []).map((item) =>
        `<a class="nav-link" href="#${esc(item.id)}">${esc(item.label)}</a>`
    ).join('\n');
}

function genHeroSocial(hero) {
    return (hero.social || []).filter((s) => SVG_ICONS[s.platform]).map((s) => (
        `<a class="hero-social-link" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">` +
        `<div class="hero-social hero-social--${esc(s.platform)}">${SVG_ICONS[s.platform]}</div>` +
        `<span class="hero-social__label">${esc(s.aria_label || s.platform)}</span>` +
        `</a>`
    )).join('\n');
}

// Final odometer values in the exact DOM shape animateCounters() leaves behind
// (number text node + suffix span); data-count/data-suffix are JS-only, omitted.
function genHeroStats(hero) {
    return (hero.stats || []).map((s) => {
        const suffix = s.suffix ? `<span class="suffix">${esc(s.suffix)}</span>` : '';
        return [
            `<div class="hero-stat">`,
            `    <div class="hero-stat-num">${esc(s.value)}${suffix}</div>`,
            `    <div class="hero-stat-label">${esc(s.label)}</div>`,
            `</div>`
        ].join('\n');
    }).join('\n');
}

function genMarqueeTrack(data) {
    const items = (data.marquee && data.marquee.items) || [];
    const sep = (data.marquee && data.marquee.separator) || '✦';
    const seq = (dup) => items.map((t) => {
        const d = dup ? ' data-dup' : '';
        return `<span class="marquee-item"${d}>${esc(t)}</span><span class="marquee-sep"${d}>${esc(sep)}</span>`;
    }).join('');
    return seq(false) + seq(true);
}

function genAboutGrid(about) {
    const cells = about.cells || [];
    const out = [];
    out.push([
        `<div class="about-cell about-cell--statement" style="--intro-rows:${Math.max(cells.length, 1)}">`,
        `    <span class="cell-label">${esc(about.eyebrow)} — BIO</span>`,
        `    <div class="about-intro-body">`,
        `        <p class="about-body">${esc(about.body)}</p>`,
        `        <p class="about-body about-body--sec">${esc(about.body_secondary)}</p>`,
        `    </div>`,
        (about.cta && about.cta.href) ? [
            `    <a class="about-cta" href="${esc(safeUrl(about.cta.href))}" data-cursor="link">`,
            `        <span class="about-cta__prompt">&gt;</span>`,
            `        <span>${esc(about.cta.label)}</span>`,
            `        <span class="about-cta__arrow">&rarr;</span>`,
            `    </a>`
        ].join('\n') : '',
        `</div>`
    ].filter(Boolean).join('\n'));
    cells.forEach((c, i) => {
        const hi = c.highlight ? ' about-cell--highlight' : '';
        out.push([
            `<div class="about-cell about-cell--auto${hi}">`,
            `    <span class="cell-label">${esc(c.label)}</span>`,
            `    <span class="cell-value">${esc(c.value)}</span>`,
            `    <span class="about-cell__index">${pad2(i + 1)}</span>`,
            `</div>`
        ].join('\n'));
    });
    return out.join('\n');
}

// Static fallback for the adaptive description teaser: same lead/ellipsis/rest
// span structure the runtime measure produces (8-word lead stand-in), so the
// full text is in the DOM and the pure-CSS hover reveal works without JS.
function projectsDescStatic(description) {
    const words = String(description || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const LEAD = 8;
    const leadText = words.slice(0, LEAD).join(' ');
    const restText = words.slice(LEAD).join(' ');
    const inner = `<span class="projects-tile__desc-lead">${esc(leadText)}</span>` +
        (restText
            ? `<span class="projects-tile__desc-ellipsis" aria-hidden="true">…</span><span class="projects-tile__desc-rest">${esc(restText)}</span>`
            : '');
    return `    <p class="projects-tile__desc">${inner}</p>`;
}

function genProjectsGrid(projects) {
    return (projects.items || []).map((p) => {
        const tagsHtml = (p.tags || []).map((t) => `<span class="projects-tag">${esc(t)}</span>`).join('');
        // Static fallback: video tiles emit the poster <img> variant only —
        // <video> sources are useless to non-JS crawlers.
        const mediaHtml = p.video
            ? `<picture><img src="${esc(p.image)}" alt="${esc(p.image_alt || '')}" loading="lazy" decoding="async"></picture>`
            : `<picture>${p.image_webp ? `<source srcset="${esc(p.image_webp)}" type="image/webp">` : ''}<img src="${esc(p.image)}" alt="${esc(p.image_alt || '')}" loading="lazy" decoding="async"></picture>`;
        const repoHtml = p.repo_url
            ? `<span class="projects-tile__repo project-card-repo" aria-label="View source on GitHub">${SVG_ICONS.github_outlined}</span>`
            : '';
        return [
            `<a class="projects-tile projects-tile--${esc(p.span || 'auto')}" href="${esc(safeUrl(p.repo_url))}" target="_blank" rel="noopener noreferrer">`,
            `    <div class="projects-tile__media">`,
            `        ${mediaHtml}`,
            `    </div>`,
            `    <div class="projects-tile__scrim"></div>`,
            `    <div class="projects-tile__body">`,
            `        <div class="projects-tile__top">`,
            `            <span class="projects-tile__num">${esc(p.index)}</span>`,
            p.award ? `            <span class="projects-tile__award">${esc(p.award)}</span>` : '',
            `        </div>`,
            `        <div class="projects-tile__foot">`,
            `            <div class="projects-tile__tags">${tagsHtml}</div>`,
            projectsDescStatic(p.description),
            `            <h3 class="projects-tile__title">${esc(p.title)}</h3>`,
            `        </div>`,
            `    </div>`,
            `    ${repoHtml}`,
            `</a>`
        ].filter(Boolean).join('\n');
    }).join('\n');
}

function genExperienceList(experience) {
    return (experience.items || []).map((item) => {
        const tagsHtml = (item.tags || []).map((t) => `<span class="experience-tag">${esc(t)}</span>`).join('');
        return [
            `<div class="experience-row">`,
            `    <div class="experience-row__index">${esc(item.index)}</div>`,
            `    <div class="experience-row__period">${esc(item.period)}</div>`,
            `    <div class="experience-row__role">`,
            `        <span class="ttl">${esc(item.title)}</span>`,
            `        <span class="co">${esc(item.company)}</span>`,
            `    </div>`,
            `    <div class="experience-row__desc">${esc(item.description)}</div>`,
            `    <div class="experience-row__tags">${tagsHtml}</div>`,
            `</div>`
        ].join('\n');
    }).join('\n');
}

// The mailto COPY button is omitted — it is dead weight without JS.
function genContactGrid(contact) {
    return (contact.links || []).map((link) => {
        const isHttp = String(link.url || '').startsWith('http');
        const targetRel = isHttp ? ' target="_blank" rel="noopener noreferrer"' : '';
        return [
            `<a class="contact-tile" href="${esc(safeUrl(link.url))}"${targetRel} aria-label="${esc(link.label)}">`,
            `    <span class="contact-tile__label">${esc(link.label)}</span>`,
            `    <span class="contact-tile__value">${esc(link.value)}</span>`,
            `    <span class="contact-tile__arrow">&rarr;</span>`,
            `</a>`
        ].join('\n');
    }).join('\n');
}

function genContactFooter(contact) {
    return (contact.footer || []).map((t) => `<span>${esc(t)}</span>`).join('\n');
}

// js/main.js generateContact appends an empty portrait frame into the title
// row (canvas mount for js/contact-cloud.js) — mirrored as an empty div.
function contactHeadExtra() {
    return `<div class="contact-portrait" aria-hidden="true"></div>`;
}

// ---- DIARY GENERATORS (mirror js/diary.js markup) --------------------------

function genDiaryHeader(page) {
    const rawTitle = page.title || 'DEV_DIARY://LOG';
    const parts = String(rawTitle).split('://');
    const titleHtml = parts.length > 1
        ? `${esc(parts[0])}<span class="stroke">://${esc(parts[1])}</span>`
        : esc(rawTitle);
    const out = [`<div class="diary-header__kicker">FIELD NOTES // DEV JOURNAL</div>`, `<h1 class="diary-header__title">${titleHtml}</h1>`];
    if (page.intro) out.push(`<p class="diary-header__intro">${esc(page.intro)}</p>`);
    return out.join('\n');
}

// Static variant of generatePlate: same structure, but the OPEN button is an
// anchor to the static entry page and the JS-only openable hooks are dropped.
function genPlate(entry, position, stem) {
    const out = [];
    const alt = position % 2 === 1 ? ' plate--alt' : '';
    out.push(`<article class="plate${alt}" data-index="${esc(entry.index || '')}">`);
    out.push(`    <div class="plate__index">${esc(entry.index || '')}</div>`);
    if (entry.date) out.push(`    <div class="plate__date">${esc(entry.date)}</div>`);
    out.push(`    <div class="plate__text">`);
    out.push(`        <div class="plate__label">TRANSMISSION ${esc(entry.index || '')}</div>`);
    out.push(`        <h2 class="plate__title">${esc(entry.title || '')}</h2>`);
    if (entry.summary) out.push(`        <p class="plate__summary">${esc(entry.summary)}</p>`);
    if (Array.isArray(entry.tags) && entry.tags.length) {
        const tagsHtml = entry.tags.map((t) => esc(t)).join('&nbsp;/&nbsp;');
        out.push(`        <div class="plate__tags"><b>&#9612;TAGS</b>&nbsp;&nbsp;${tagsHtml}</div>`);
    }
    if (entry.body) {
        out.push(`        <span class="plate__reading-time">${esc(readingTimePlate(entry.summary))}</span>`);
    }
    if (entry.body) {
        out.push(`        <a class="plate__open" href="${ENTRY_DIR_REL}/${esc(stem)}.html">[ OPEN_TRANSMISSION ${esc(entry.index || '')} &rarr; ]</a>`);
    }
    out.push(`    </div>`);
    if (entry.image) {
        out.push(`    <div class="plate__media">`);
        out.push(`        <picture>${entry.image_webp ? `<source srcset="${esc(entry.image_webp)}" type="image/webp">` : ''}<img src="${esc(entry.image)}" alt="${esc(entry.image_alt || '')}" loading="lazy" decoding="async"></picture>`);
        ['tl', 'tr', 'bl', 'br'].forEach((c) => out.push(`        <span class="plate__tick plate__tick--${c}"></span>`));
        out.push(`    </div>`);
    }
    out.push(`</article>`);
    return out.join('\n');
}

// ---- INDEX TEASER (mirror js/diary-teaser.js card markup) ------------------

function genTeaserCard(entry) {
    const tags = (Array.isArray(entry.tags) ? entry.tags : []).slice(0, 3);
    const mins = teaserMinutes(entry.summary);
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
}

function genTeaserGrid(entries) {
    const latest = entries.slice()
        .sort((a, b) =>
            String(b.date || '').localeCompare(String(a.date || '')) ||
            String(b.index || '').localeCompare(String(a.index || '')))
        .slice(0, 2);
    return latest.map(genTeaserCard).join('\n');
}

// ---- STATIC ENTRY PAGES ----------------------------------------------------

const ENTRY_SHELL_CSS = `
/* Static entry shell — tokens mirror the diary.html critical CSS.
   diary.css provides the .diary-body__* typography; these overrides
   exist because its @font-face/tokens live in page-relative URLs that
   break from diary/entries/ depth. */
@font-face {
    font-family: 'Datatype';
    src: url('../../fonts/Datatype.wdth.wght.woff2') format('woff2');
    font-weight: 100 900;
    font-stretch: 75% 125%;
    font-display: swap;
}
@font-face { font-family: 'Space Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('../../fonts/spacemono-normal-400-latin.woff2') format('woff2'); }
@font-face { font-family: 'Space Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('../../fonts/spacemono-normal-700-latin.woff2') format('woff2'); }
@font-face { font-family: 'Space Mono'; font-style: italic; font-weight: 400; font-display: swap; src: url('../../fonts/spacemono-italic-400-latin.woff2') format('woff2'); }

:root {
    --bg: #0a0a0a;
    --bg-elevated: #111110;
    --fg: #c8c2b8;
    --fg-dim: #827a70;
    --fg-bright: #e8e4df;
    --accent: #8a7f72;
    --accent-bright: #b5a898;
    --border: #2a2825;
    --border-bright: #3a3632;
    --highlight: #d4c5ab;
    --error: #8a6f5f;
    --font-mono: 'Space Mono', 'Courier New', monospace;
    --font-display: 'Datatype', 'Space Mono', monospace;
    --transition-raw: 0.1s steps(2)
}

*,
*::before,
*::after { margin: 0; padding: 0; box-sizing: border-box; }

html { scrollbar-width: thin; scrollbar-color: var(--fg-dim) var(--bg); }

body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
}

a { cursor: pointer; }

.ep-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: rgba(10, 10, 10, 0.92);
    -webkit-backdrop-filter: blur(10px);
    backdrop-filter: blur(10px);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
}
.ep-brand {
    font-family: var(--font-display);
    font-weight: 700;
    font-stretch: 100%;
    letter-spacing: 0.02em;
    color: var(--fg-bright);
    text-decoration: none;
}
.ep-brand span { color: var(--highlight); font-weight: 400; }
.ep-back { color: var(--accent-bright); text-decoration: none; font-variant-numeric: tabular-nums; }
.ep-back:hover, .ep-interactive:hover, .ep-nav-btn:hover { color: var(--highlight); }

.ep-main {
    max-width: 760px;
    margin: 0 auto;
    padding: 56px 24px 72px;
}

.ep-eyebrow {
    font-size: 11px;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 16px;
}
.ep-title {
    font-family: var(--font-display);
    font-size: clamp(30px, 6vw, 54px);
    font-weight: 800;
    font-stretch: 82%;
    line-height: 0.95;
    letter-spacing: -0.02em;
    text-transform: uppercase;
    color: var(--fg-bright);
    margin-bottom: 18px;
}
.ep-meta {
    display: flex;
    gap: 14px;
    font-size: 11px;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--fg-dim);
    font-variant-numeric: tabular-nums;
    margin-bottom: 40px;
}
.ep-image { margin: 0 0 40px; border: 1px solid var(--border); }
.ep-image img { display: block; width: 100%; height: auto; filter: grayscale(35%) contrast(1.1) brightness(0.9); }

.ep-footer {
    border-top: 1px solid var(--border);
    margin-top: 64px;
    padding-top: 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}
.ep-nav { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ep-nav-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--highlight);
    border: 1px solid var(--border-bright);
    padding: 10px 14px;
    transition: color var(--transition-raw), border-color var(--transition-raw);
}
.ep-nav-btn:hover { border-color: var(--highlight); }
.ep-nav-btn--off { color: var(--fg-dim); opacity: 0.45; }
.ep-interactive {
    align-self: flex-start;
    font-size: 11px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--highlight);
    text-decoration: none;
}
.ep-copy { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--fg-dim); }

@media (max-width: 600px) {
    .ep-header { padding: 14px 16px; }
    .ep-main { padding: 40px 16px 56px; }
}
`;

function buildEntryPage({ entry, position, stem, bodyHtml, readTime, prev, next, copyright }) {
    const canonical = absUrl(`${ENTRY_DIR_REL}/${stem}.html`);
    const ogImage = entry.image ? absUrl(entry.image) : absUrl('assets/og-image.png');
    const isoDate = yamlDateToISO(entry.date);

    const prevHtml = prev
        ? `<a class="ep-nav-btn" href="${esc(prev.stem)}.html">&lsaquo; PREV: ${esc(prev.title)}</a>`
        : `<span class="ep-nav-btn ep-nav-btn--off" aria-disabled="true">&lsaquo; PREV</span>`;
    const nextHtml = next
        ? `<a class="ep-nav-btn" href="${esc(next.stem)}.html">NEXT: ${esc(next.title)} &rsaquo;</a>`
        : `<span class="ep-nav-btn ep-nav-btn--off" aria-disabled="true">NEXT &rsaquo;</span>`;

    const imageHtml = entry.image ? [
        ``,
        `        <figure class="ep-image">`,
        `            <picture>${entry.image_webp ? `<source srcset="${esc(entryRel(entry.image_webp))}" type="image/webp">` : ''}<img src="${esc(entryRel(entry.image))}" alt="${esc(entry.image_alt || '')}" loading="lazy" decoding="async"></picture>`,
        `        </figure>`
    ].join('\n') : '';

    const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: entry.title,
        datePublished: isoDate,
        dateModified: isoDate,
        author: { '@type': 'Person', name: 'Ibrahim Faruquee', url: 'https://ibrahimf1.github.io/#person' },
        mainEntityOfPage: canonical,
        image: ogImage,
        inLanguage: 'en-US'
    }).replace(/</g, '\\u003c');

    const bodyLines = bodyHtml.split('\n').map((l) => (l ? '        ' + l : '')).join('\n');

    return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#0a0a0a">
    <meta name="color-scheme" content="dark">
    <title>${esc(entry.title)} — Dev Diary — Ibrahim Faruquee</title>
    <meta name="description" content="${esc(entry.summary)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta name="author" content="Ibrahim Faruquee">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
    <link rel="alternate" type="application/rss+xml" title="Dev Diary — Ibrahim Faruquee" href="https://ibrahimf1.github.io/rss.xml">
    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${esc(entry.title)} — Dev Diary — Ibrahim Faruquee">
    <meta property="og:description" content="${esc(entry.summary)}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:site_name" content="Ibrahim Faruquee">
    <meta property="og:locale" content="en_US">
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(entry.title)} — Dev Diary — Ibrahim Faruquee">
    <meta name="twitter:description" content="${esc(entry.summary)}">
    <meta name="twitter:image" content="${esc(ogImage)}">
    <!-- Structured data (JSON-LD): BlogPosting -->
    <script type="application/ld+json">${jsonLd}</script>
    <link rel="stylesheet" href="../../css/diary.css">
    <style>${ENTRY_SHELL_CSS}</style>
</head>

<body>
    <!-- Static, JS-free article shell; the interactive version lives at ../../diary.html#entry-${esc(entry.index)} -->
    <header class="ep-header">
        <a class="ep-brand" href="../../index.html">IBRAHIM<span>F</span></a>
        <a class="ep-back" href="../../diary.html">[&larr; DEV_DIARY://LOG]</a>
    </header>

    <main class="ep-main">
        <p class="ep-eyebrow">DEV DIARY // TRANSMISSION ${esc(entry.index)}</p>
        <h1 class="ep-title">${esc(entry.title)}</h1>
        <p class="ep-meta">
            <span>${esc(entry.date)}</span>
            <span>${esc(readTime)}</span>
        </p>${imageHtml}
        <div class="ep-body">
${bodyLines}
        </div>

        <footer class="ep-footer">
            <div class="ep-nav">
                ${prevHtml}
                ${nextHtml}
            </div>
            <a class="ep-interactive" href="../../diary.html#entry-${esc(entry.index)}">OPEN INTERACTIVE VERSION &#8599;</a>
            <p class="ep-copy">${esc(copyright)}</p>
        </footer>
    </main>
</body>

</html>
`;
}

// ---- FEEDS -----------------------------------------------------------------

function buildRss({ entries, renderedBodies, buildDate }) {
    const items = entries.map((entry) => {
        const pageUrl = absUrl(`${ENTRY_DIR_REL}/${stemOf(entry)}.html`);
        const cats = (entry.tags || []).map((t) => `      <category>${esc(t)}</category>`).join('\n');
        // Keep the rendered block markup intact (newlines inside <pre> code
        // blocks matter); only neutralize a literal "]]>" sequence.
        const content = renderedBodies.get(entry.body).replace(/]]>/g, ']]&gt;');
        return [
            `    <item>`,
            `      <title>${esc(entry.title)}</title>`,
            `      <link>${esc(pageUrl)}</link>`,
            `      <guid isPermaLink="true">${esc(pageUrl)}</guid>`,
            `      <pubDate>${yamlDateToRFC822(entry.date)}</pubDate>`,
            `      <description>${esc(entry.summary)}</description>`,
            cats,
            `      <content:encoded><![CDATA[${content}]]></content:encoded>`,
            `    </item>`
        ].filter(Boolean).join('\n');
    }).join('\n\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Dev Diary — Ibrahim Faruquee</title>
    <link>https://ibrahimf1.github.io/diary.html</link>
    <description>Development journal of Ibrahim Faruquee — field notes on full-stack builds, applied machine learning, real-time systems, and the interfaces in between.</description>
    <language>en-us</language>
    <lastBuildDate>${buildDate.toUTCString()}</lastBuildDate>
    <atom:link href="https://ibrahimf1.github.io/rss.xml" rel="self" type="application/rss+xml"/>

${items}
  </channel>
</rss>
`;
}

function buildSitemap({ entries, genDate }) {
    const newest = entries.reduce((a, b) => (String(b.date || '') > String(a.date || '') ? b : a), entries[0]);
    const entryUrls = entries.map((entry) => (
        `  <url>\n    <loc>${esc(absUrl(`${ENTRY_DIR_REL}/${stemOf(entry)}.html`))}</loc>\n    <lastmod>${yamlDateToISO(entry.date)}</lastmod>\n  </url>`
    )).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://ibrahimf1.github.io/</loc>
    <lastmod>${toISODate(genDate)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://ibrahimf1.github.io/assets/og-image.png</image:loc>
    </image:image>
  </url>
  <url>
    <loc>https://ibrahimf1.github.io/diary.html</loc>
    <lastmod>${newest ? yamlDateToISO(newest.date) : toISODate(genDate)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
${entryUrls}
</urlset>
`;
}

// ---- MAIN ------------------------------------------------------------------

const stemOf = (entry) => path.basename(String(entry.body || ''), '.md');

function main() {
    const data = loadYaml('data.yaml');
    const diaryData = loadYaml('diary/diary.yaml');

    const diary = diaryData.diary || {};
    const page = diary.page || {};
    const entries = Array.isArray(diary.entries) ? diary.entries : [];
    if (!entries.length) die('diary/diary.yaml has no entries');

    if (!data.nav) die('data.yaml: missing "nav"');
    if (!data.hero) die('data.yaml: missing "hero"');

    // ---- referenced-file validation (fail loudly before writing anything) ----
    entries.forEach((entry, i) => {
        if (!entry.body) die(`diary entry ${pad2(i + 1)} ("${entry.title || '?'}") has no body file`);
        if (!/^[^:]*\.md$/.test(entry.body)) die(`diary entry ${entry.index}: body must be a .md path, got "${entry.body}"`);
        assertFile(entry.body, `body for entry ${entry.index}`);
        if (entry.image) assertFile(entry.image, `image for entry ${entry.index}`);
        if (entry.image_webp) assertFile(entry.image_webp, `image_webp for entry ${entry.index}`);
    });
    (data.projects && data.projects.items || []).forEach((p, i) => {
        if (p.image) assertFile(p.image, `image for project ${p.index || i + 1}`);
        if (p.image_webp) assertFile(p.image_webp, `image_webp for project ${p.index || i + 1}`);
        if (p.video && p.video.poster) assertFile(p.video.poster, `video poster for project ${p.index || i + 1}`);
    });
    assertFile('assets/favicon.svg', 'entry-page favicon');
    assertFile('assets/og-image.png', 'sitemap OG image');

    // ---- render markdown bodies once (shared by entry pages + RSS) ----------
    const md = makeMarkdownParser();
    const renderedBodies = new Map(); // entry.body -> html
    const stems = new Set();
    entries.forEach((entry) => {
        const stem = stemOf(entry);
        if (stems.has(stem)) die(`duplicate body stem "${stem}" — static entry pages would collide`);
        stems.add(stem);
        renderedBodies.set(entry.body, md.render(readUtf8(entry.body)));
    });

    const written = [];
    const write = (rel, content) => {
        fs.writeFileSync(path.join(ROOT, rel), content);
        written.push([rel, Buffer.byteLength(content, 'utf8')]);
    };

    // ---- index.html ---------------------------------------------------------
    let indexHtml = readUtf8('index.html');
    const contact = data.contact || {};
    const injections = [
        ['navLinks', genNavLinks(data)],
        ['heroSocial', genHeroSocial(data.hero)],
        ['heroStats', genHeroStats(data.hero)],
        ['marqueeTrack1', genMarqueeTrack(data)],
        ['marqueeTrack2', genMarqueeTrack(data)],
        ['aboutHead', buildSectionHead({ num: data.about.number, eyebrow: data.about.eyebrow, lines: data.about.statement, goldLast: true })],
        ['aboutGrid', genAboutGrid(data.about)],
        ['projectsHead', buildSectionHead({ num: data.projects.number, eyebrow: data.projects.eyebrow, lines: [data.projects.heading.line1, data.projects.heading.line2], goldLast: true })],
        ['projectsGrid', genProjectsGrid(data.projects)],
        ['experienceHead', buildSectionHead({ num: data.experience.number, eyebrow: data.experience.eyebrow, lines: [data.experience.heading.line1, data.experience.heading.line2], goldLast: true })],
        ['experienceList', genExperienceList(data.experience)],
        ['contactHead', buildSectionHead({ num: contact.number, eyebrow: contact.eyebrow, lines: [contact.heading.line1, contact.heading.line2], goldLast: true, dither: false, titleRowExtra: contactHeadExtra() })],
        ['contactGrid', genContactGrid(contact)],
        ['contactFooter', genContactFooter(contact)],
        ['diaryTeaserGrid', genTeaserGrid(entries)]
    ];
    injections.forEach(([id, content]) => { indexHtml = inject(indexHtml, id, content); });
    write('index.html', indexHtml);

    // ---- diary.html -----------------------------------------------------------
    let diaryHtml = readUtf8('diary.html');
    diaryHtml = inject(diaryHtml, 'diaryHeader', genDiaryHeader(page));
    diaryHtml = inject(diaryHtml, 'diaryStack', entries.map((entry, i) => genPlate(entry, i, stemOf(entry))).join('\n'));
    write('diary.html', diaryHtml);

    // ---- static entry pages ---------------------------------------------------
    const copyright = (contact.footer && contact.footer[0]) || '© Ibrahim Faruquee. All rights reserved.';
    fs.mkdirSync(path.join(ROOT, ENTRY_DIR_REL), { recursive: true });
    entries.forEach((entry, i) => {
        const bodyHtml = renderedBodies.get(entry.body);
        write(
            `${ENTRY_DIR_REL}/${stemOf(entry)}.html`,
            buildEntryPage({
                entry,
                position: i,
                stem: stemOf(entry),
                bodyHtml,
                readTime: readingTimeBody(bodyHtml),
                prev: i > 0 ? { stem: stemOf(entries[i - 1]), title: entries[i - 1].title } : null,
                next: i < entries.length - 1 ? { stem: stemOf(entries[i + 1]), title: entries[i + 1].title } : null,
                copyright
            })
        );
    });

    // ---- feeds ----------------------------------------------------------------
    const now = new Date();
    write('rss.xml', buildRss({ entries, renderedBodies, buildDate: now }));
    write('sitemap.xml', buildSitemap({ entries, genDate: now }));

    // ---- summary ----------------------------------------------------------------
    console.log('prerender: OK — wrote ' + written.length + ' file(s):');
    written.forEach(([rel, bytes]) => console.log('  ' + String(bytes).padStart(7) + ' B  ' + rel));
}

main();
