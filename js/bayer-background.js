/**
 * Bayer Diamond Dithering — WebGL2 Full-Screen Animated Background
 *
 * Extracted from bayer-dithering-webgl-demo (Diamond mode) and adapted into a
 * zero-dependency, self-contained WebGL 2 background renderer.
 *
 * The shader outputs an OPAQUE canvas that includes the portfolio's base
 * background colour (#0a0a0a) so no alpha-compositing is needed — this
 * guarantees the pattern is visible on every browser.
 *
 * Visual features:
 *  – 8×8 Bayer ordered-dithering with diamond-shaped pixel masks
 *  – Animated fBm (fractal Brownian motion) noise drives the dither threshold
 *  – Smooth mouse-tracking glow that subtly shifts the pattern
 *  – Continuously shifting two-tone warm gradient across the dithered colour
 *  – Soft radial vignette keeps centre content readable
 *  – Respects prefers-reduced-motion
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     CONFIGURATION
     ═══════════════════════════════════════════════════════════ */
  var PIXEL_SIZE      = 4;                        // CSS-px per diamond cell
  var COLOR_PRIMARY   = [0.77, 0.63, 0.38];      // warm amber  ≈ #c4a060
  var COLOR_SECONDARY = [0.48, 0.42, 0.31];      // dark warm   ≈ #7a6a50
  var BG_COLOR        = [0.039, 0.039, 0.039];   // #0a0a0a body bg
  var DITHER_OPACITY  = 0.22;                     // blend ratio of dither colour onto bg
  var MOUSE_LERP      = 0.04;                     // smoothing factor for cursor tracking
  var DPR_CAP         = 2;                        // max device-pixel-ratio for perf
  var ANIM_SPEED      = 0.05;                     // fBm time multiplier

  /* ═══════════════════════════════════════════════════════════
     CANVAS CREATION
     ═══════════════════════════════════════════════════════════ */
  var canvas = document.createElement('canvas');
  canvas.id = 'bayer-bg';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';

  // Insert as the very first child so it paints behind everything
  if (document.body.firstChild) {
    document.body.insertBefore(canvas, document.body.firstChild);
  } else {
    document.body.appendChild(canvas);
  }

  /* ═══════════════════════════════════════════════════════════
     WEBGL 2 CONTEXT  (opaque — no alpha channel needed)
     ═══════════════════════════════════════════════════════════ */
  var gl = canvas.getContext('webgl2', {
    alpha: false,            // opaque canvas — composited as a solid layer
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
  });

  if (!gl) {
    console.warn('[bayer-bg] WebGL2 not available — background disabled');
    return;
  }

  /* ═══════════════════════════════════════════════════════════
     SHADER SOURCES
     ═══════════════════════════════════════════════════════════ */

  // Vertex — fullscreen triangle via gl_VertexID (no attribute buffers)
  var VERT_SRC = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
  ].join('\n');

  // Fragment — Bayer-8 ordered dithering + diamond mask + fBm + mouse glow
  var FRAG_SRC = [
    '#version 300 es',
    'precision highp float;',
    '',
    'uniform vec2  uResolution;',
    'uniform float uTime;',
    'uniform vec2  uMouse;',
    'uniform float uPixelSize;',
    'uniform vec3  uColor1;',
    'uniform vec3  uColor2;',
    'uniform vec3  uBgColor;',
    'uniform float uDitherOpacity;',
    'uniform float uAnimSpeed;',
    '',
    'out vec4 fragColor;',
    '',
    '/* ── Bayer matrix helpers ─────────────────────────────── */',
    'float Bayer2(vec2 a) {',
    '  a = floor(a);',
    '  return fract(a.x / 2.0 + a.y * a.y * 0.75);',
    '}',
    '',
    '#define Bayer4(a) (Bayer2(0.5 * (a)) * 0.25 + Bayer2(a))',
    '#define Bayer8(a) (Bayer4(0.5 * (a)) * 0.25 + Bayer2(a))',
    '',
    '/* ── 1-D hash ────────────────────────────────────────── */',
    'float hash11(float n) { return fract(sin(n) * 43758.5453); }',
    '',
    '/* ── 3-D value noise ─────────────────────────────────── */',
    'float vnoise(vec3 p) {',
    '  vec3 ip = floor(p);',
    '  vec3 fp = fract(p);',
    '',
    '  float n000 = hash11(dot(ip + vec3(0,0,0), vec3(1,57,113)));',
    '  float n100 = hash11(dot(ip + vec3(1,0,0), vec3(1,57,113)));',
    '  float n010 = hash11(dot(ip + vec3(0,1,0), vec3(1,57,113)));',
    '  float n110 = hash11(dot(ip + vec3(1,1,0), vec3(1,57,113)));',
    '  float n001 = hash11(dot(ip + vec3(0,0,1), vec3(1,57,113)));',
    '  float n101 = hash11(dot(ip + vec3(1,0,1), vec3(1,57,113)));',
    '  float n011 = hash11(dot(ip + vec3(0,1,1), vec3(1,57,113)));',
    '  float n111 = hash11(dot(ip + vec3(1,1,1), vec3(1,57,113)));',
    '',
    '  vec3 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);',
    '',
    '  float x00 = mix(n000, n100, w.x);',
    '  float x10 = mix(n010, n110, w.x);',
    '  float x01 = mix(n001, n101, w.x);',
    '  float x11 = mix(n011, n111, w.x);',
    '',
    '  return mix(mix(x00, x10, w.y), mix(x01, x11, w.y), w.z) * 2.0 - 1.0;',
    '}',
    '',
    '/* ── Fractal Brownian motion (5 octaves) ─────────────── */',
    'float fbm(vec2 uv, float t) {',
    '  vec3 p   = vec3(uv * 4.0, t);',
    '  float amp  = 1.0;',
    '  float freq = 1.0;',
    '  float sum  = 1.0;',
    '',
    '  for (int i = 0; i < 5; ++i) {',
    '    sum  += amp * vnoise(p * freq);',
    '    freq *= 1.25;',
    '  }',
    '  return sum * 0.5 + 0.5;',
    '}',
    '',
    '/* ── Diamond pixel mask ──────────────────────────────── */',
    'float maskDiamond(vec2 p, float cov) {',
    '  float r = sqrt(cov) * 0.564;',
    '  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);',
    '}',
    '',
    '/* ── Main ────────────────────────────────────────────── */',
    'void main() {',
    '  float ps = uPixelSize;',
    '',
    '  // Centre-origin fragment coordinates',
    '  vec2 fc = gl_FragCoord.xy - uResolution * 0.5;',
    '  float aspect = uResolution.x / uResolution.y;',
    '',
    '  // UV inside the current pixel cell (for diamond mask)',
    '  vec2 pixelUV = fract(fc / ps);',
    '',
    '  // World position of the current 8x8 Bayer cell',
    '  float cellSize = 8.0 * ps;',
    '  vec2 cellCoord = floor(fc / cellSize) * cellSize;',
    '',
    '  // Normalised UV for noise sampling (aspect-corrected)',
    '  vec2 uv = cellCoord / uResolution * vec2(aspect, 1.0);',
    '',
    '  /* ── Mouse glow ──────────────────────────────────── */',
    '  vec2  mUV   = (uMouse - 0.5) * vec2(aspect, 1.0);',
    '  float mDist = length(uv - mUV);',
    '  float mGlow = exp(-mDist * 2.5) * 0.30;',
    '',
    '  /* ── Animated fBm feed ───────────────────────────── */',
    '  float feed = fbm(uv + uMouse * 0.04, uTime * uAnimSpeed);',
    '  feed = feed * 0.5 - 0.65 + mGlow;',
    '',
    '  // Slight vertical gradient so pattern is denser near the bottom',
    '  feed += uv.y * 0.12;',
    '',
    '  /* ── Bayer ordered dithering ─────────────────────── */',
    '  float bayer = Bayer8(gl_FragCoord.xy / ps) - 0.5;',
    '  float bw    = step(0.5, feed + bayer);',
    '',
    '  /* ── Diamond mask ────────────────────────────────── */',
    '  float M = maskDiamond(pixelUV, bw);',
    '',
    '  /* ── Gradient colour (shifts over time) ──────────── */',
    '  float gt  = uv.x * 0.3 + uv.y * 0.3 + sin(uTime * 0.03) * 0.5 + 0.5;',
    '  vec3  col = mix(uColor1, uColor2, gt);',
    '',
    '  /* ── Vignette (keeps centre readable) ────────────── */',
    '  vec2  vUv = gl_FragCoord.xy / uResolution;',
    '  float vig = 1.0 - length((vUv - 0.5) * 1.4);',
    '  vig = smoothstep(0.0, 0.7, vig);',
    '',
    '  /* ── Composite onto background (opaque output) ──── */',
    '  float alpha = M * uDitherOpacity * vig;',
    '  vec3  finalCol = mix(uBgColor, col, alpha);',
    '',
    '  fragColor = vec4(finalCol, 1.0);',
    '}',
  ].join('\n');

  /* ═══════════════════════════════════════════════════════════
     COMPILE & LINK
     ═══════════════════════════════════════════════════════════ */
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[bayer-bg] shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) {
    console.error('[bayer-bg] Shader compilation failed — background disabled');
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[bayer-bg] program link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // Shaders can be freed after linking
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  /* ═══════════════════════════════════════════════════════════
     UNIFORMS
     ═══════════════════════════════════════════════════════════ */
  var loc = {};
  ['uResolution', 'uTime', 'uMouse', 'uPixelSize',
   'uColor1', 'uColor2', 'uBgColor', 'uDitherOpacity', 'uAnimSpeed'
  ].forEach(function (name) {
    loc[name] = gl.getUniformLocation(prog, name);
  });

  // Static uniforms (set once)
  gl.uniform3f(loc.uColor1, COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  gl.uniform3f(loc.uColor2, COLOR_SECONDARY[0], COLOR_SECONDARY[1], COLOR_SECONDARY[2]);
  gl.uniform3f(loc.uBgColor, BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);
  gl.uniform1f(loc.uDitherOpacity, DITHER_OPACITY);

  /* ═══════════════════════════════════════════════════════════
     VAO  (empty — vertex positions come from gl_VertexID)
     ═══════════════════════════════════════════════════════════ */
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  /* ═══════════════════════════════════════════════════════════
     RESIZE HANDLER  (DPR-aware)
     ═══════════════════════════════════════════════════════════ */
  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(loc.uResolution, canvas.width, canvas.height);
    gl.uniform1f(loc.uPixelSize, PIXEL_SIZE * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ═══════════════════════════════════════════════════════════
     MOUSE / TOUCH TRACKING  (smooth lerp)
     ═══════════════════════════════════════════════════════════ */
  var rawMX = 0.5, rawMY = 0.5;
  var smoothMX = 0.5, smoothMY = 0.5;

  window.addEventListener('mousemove', function (e) {
    rawMX = e.clientX / window.innerWidth;
    rawMY = 1.0 - e.clientY / window.innerHeight; // flip Y for GL
  });

  window.addEventListener('touchmove', function (e) {
    if (e.touches.length > 0) {
      rawMX = e.touches[0].clientX / window.innerWidth;
      rawMY = 1.0 - e.touches[0].clientY / window.innerHeight;
    }
  }, { passive: true });

  /* ═══════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════ */
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var animSpeed = reducedMotion.matches ? 0.005 : ANIM_SPEED;

  reducedMotion.addEventListener('change', function (e) {
    animSpeed = e.matches ? 0.005 : ANIM_SPEED;
  });

  /* ═══════════════════════════════════════════════════════════
     RENDER LOOP
     ═══════════════════════════════════════════════════════════ */
  // Opaque clear colour matching the portfolio body background
  gl.clearColor(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], 1.0);

  var t0 = performance.now();

  (function frame() {
    // Smooth mouse position
    smoothMX += (rawMX - smoothMX) * MOUSE_LERP;
    smoothMY += (rawMY - smoothMY) * MOUSE_LERP;

    var elapsed = (performance.now() - t0) * 0.001;

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(loc.uTime, elapsed);
    gl.uniform2f(loc.uMouse, smoothMX, smoothMY);
    gl.uniform1f(loc.uAnimSpeed, animSpeed);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  })();

  console.log('[bayer-bg] ✓ WebGL2 Bayer diamond dithering initialized');
})();
