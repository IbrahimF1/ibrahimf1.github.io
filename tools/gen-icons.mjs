#!/usr/bin/env node
/* ============================================================
   GEN-ICONS — zero-dependency PWA icon generator
   ------------------------------------------------------------
   Usage:
       node tools/gen-icons.mjs

   Renders the 16x16 pixel-art glyph from assets/favicon.svg
   (parsed READ-ONLY — the SVG is never modified) into the PNG
   sizes the webmanifest and apple-touch link need:

       assets/icon-180.png           apple-touch icon
       assets/icon-192.png           manifest "any"
       assets/icon-512.png           manifest "any"
       assets/icon-512-maskable.png  ~80% art inside the safe zone,
                                     background fills the full canvas

   The PNG encoder is manual (IHDR/IDAT/IEND chunks + node:zlib
   deflate + hand-rolled CRC32) — no npm deps. If favicon.svg ever
   stops being a clean 16x16 rect grid, a built-in border + "IF"
   fallback glyph is rendered instead. Node >= 18 (ESM).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const GRID = 16;
const FALLBACK_BG = [0x0a, 0x0a, 0x0a];
const FALLBACK_FG = [0xd4, 0xc5, 0xab];

function die(msg) {
    console.error('gen-icons: FAIL — ' + msg);
    process.exit(1);
}

// ---- GLYPH SOURCE (assets/favicon.svg, READ-ONLY) ---------------------------

function hexToRgb(hex, what) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) die(what + ' is not a #rrggbb hex color: "' + hex + '"');
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

// Extracts the 16x16 1-bit pattern + colors from favicon.svg. Dies into
// the caller's fallback path when the SVG is not a clean integer rect grid.
function glyphFromSvg() {
    const svg = fs.readFileSync(path.join(ROOT, 'assets/favicon.svg'), 'utf8');
    if (!/viewBox="0 0 16 16"/.test(svg)) return null;

    const bgRect = /<rect\b([^>]*)\/>/.exec(svg);
    if (!bgRect) return null;
    const attr = (tag, name) => { const m = new RegExp(name + '="([^"]*)"').exec(tag); return m ? m[1] : null; };
    const bgFill = attr(bgRect[1], 'fill');
    if (attr(bgRect[1], 'width') !== '16' || attr(bgRect[1], 'height') !== '16') return null;

    const group = /<g\b([^>]*)>([\s\S]*?)<\/g>/.exec(svg);
    if (!group) return null;
    const fgFill = attr(group[1], 'fill');

    const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
    let lit = 0;
    for (const m of group[2].matchAll(/<rect\b([^>]*)\/>/g)) {
        const tag = m[1];
        const x = parseInt(attr(tag, 'x') || '0', 10);
        const y = parseInt(attr(tag, 'y') || '0', 10);
        const w = parseInt(attr(tag, 'width') || '', 10);
        const h = parseInt(attr(tag, 'height') || '', 10);
        if (!Number.isInteger(x) || !Number.isInteger(y) || w !== 1 || h !== 1 ||
            x < 0 || y < 0 || x >= GRID || y >= GRID) return null; // not a clean grid
        grid[y][x] = true;
        lit++;
    }
    if (!lit) return null;
    return { grid, bg: hexToRgb(bgFill, 'favicon.svg background fill'), fg: hexToRgb(fgFill, 'favicon.svg glyph fill') };
}

// Fallback art: 1px square border + blocky "IF" initials on the 16x16 grid.
function fallbackGlyph() {
    const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
    for (let i = 0; i < GRID; i++) grid[0][i] = grid[GRID - 1][i] = grid[i][0] = grid[i][GRID - 1] = true;
    // "I" — serifed vertical stroke, x 2..4, y 5..10
    [2, 3, 4].forEach((x) => { grid[5][x] = grid[10][x] = true; });
    for (let y = 5; y <= 10; y++) grid[y][3] = true;
    // "F" — vertical stroke x 8..9 plus two horizontals, y 5..10
    for (let y = 5; y <= 10; y++) { grid[y][8] = true; grid[y][9] = true; }
    for (let x = 8; x <= 12; x++) grid[5][x] = true;  // top arm
    for (let x = 8; x <= 11; x++) grid[8][x] = true;  // mid arm
    console.log('gen-icons: favicon.svg is not a clean rect grid — using built-in IF fallback glyph');
    return { grid, bg: FALLBACK_BG, fg: FALLBACK_FG };
}

// ---- MINIMAL PNG ENCODER (RGBA8, filter 0, zlib IDAT) -----------------------

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

function encodePng(width, height, pixel) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: truecolor + alpha
    const raw = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        const row = y * (1 + width * 4);
        raw[row] = 0; // filter type: none
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = pixel(x, y);
            const o = row + 1 + x * 4;
            raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// ---- RENDER -----------------------------------------------------------------

// Nearest-neighbour upscale of the 16x16 grid onto a size x size canvas.
// artScale < 1 shrinks the glyph (maskable safe zone) — the background
// always fills the entire canvas so no transparency leaks through
// platform mask clipping.
function renderIcon({ grid, bg, fg }, size, artScale) {
    const scale = Math.max(1, Math.floor((size * artScale) / GRID));
    const off = Math.floor((size - scale * GRID) / 2);
    return encodePng(size, size, (x, y) => {
        const gx = Math.floor((x - off) / scale);
        const gy = Math.floor((y - off) / scale);
        const on = gx >= 0 && gx < GRID && gy >= 0 && gy < GRID && grid[gy][gx];
        const rgb = on ? fg : bg;
        return [rgb[0], rgb[1], rgb[2], 0xff];
    });
}

function main() {
    const glyph = glyphFromSvg() || fallbackGlyph();
    const outputs = [
        ['assets/icon-180.png', 180, 1],
        ['assets/icon-192.png', 192, 1],
        ['assets/icon-512.png', 512, 1],
        ['assets/icon-512-maskable.png', 512, 0.8]
    ];
    outputs.forEach(([rel, size, artScale]) => {
        const png = renderIcon(glyph, size, artScale);
        fs.writeFileSync(path.join(ROOT, rel), png);
        console.log('gen-icons: OK — wrote ' + rel + ' (' + size + 'x' + size + ', ' + png.length + ' B)');
    });
}

main();
