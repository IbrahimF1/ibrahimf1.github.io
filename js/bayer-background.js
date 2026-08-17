/**
 * Bayer Diamond Dithering — WebGL2 Full-Screen Animated Background
 *
 * Visual features:
 *  – 8×8 Bayer ordered-dithering with diamond-shaped pixel masks
 *  – Domain-warped fBm noise for organic pattern morphing
 *  – Single global colour/density/scale/flow profile (consistent across sections)
 *  – Scroll velocity response for reactive pattern behaviour
 *  – Interactive element synchronization (hover states, card focus)
 *  – Mouse-tracking glow that subtly shifts the pattern
 *  – Soft radial vignette keeps centre content readable
 *  – Respects prefers-reduced-motion
 *
 * Public API (window.bayerBg):
 *  – setInteractive(state)    — boost glow from interactive elements (0–1)
 *  – setScrollVelocity(v)     — feed scroll velocity for pattern response
 *  – setSection / setSectionProgress — legacy no-ops (kept for main.js compat)
 */
(function () {
  'use strict';

  /* Respect Save-Data / reduced-data: the animated WebGL background is a
     decorative enhancement, not content. Skipping it on metered connections
     avoids a steady GPU + compositing cost (and the site still looks correct —
     section veils fall back to the solid page background where the dither
     window sat). */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) {
    console.log('[bayer-bg] skipped — prefers-reduced-data');
    return;
  }

  /* ═══════════════════════════════════════════════════════════
     CONFIGURATION
     ═══════════════════════════════════════════════════════════ */
  var PIXEL_SIZE      = 4;
  var BG_COLOR        = [0.039, 0.039, 0.039];   // #0a0a0a body bg
  var MOUSE_LERP      = 0.04;
  // Capped at 1: the dither pattern is drawn in 4px device-pixel chunks, so a
  // 2x backing store doubles fragment work while the chunk grid gains no
  // detail. uPixelSize scales with dpr, so the pattern size in CSS pixels is
  // PIXEL_SIZE either way (~75% fragment reduction on DPR-2 screens).
  var DPR_CAP         = 1;
  var ANIM_SPEED      = 0.05;
  var VELOCITY_LERP   = 0.03;   // smoothing for scroll velocity
  var VELOCITY_DECAY  = 0.92;   // velocity decay per frame

  /* Adaptive render throttle: the dither pattern is slow, so while the page is
     idle we cap the WebGL redraw rate to save GPU/battery. Any scroll, pointer,
     or interactive-element activity immediately restores full rAF speed. */
  var IDLE_FPS         = 30;    // redraw cap while idle
  var ACTIVE_WINDOW_MS = 1200;  // full-speed window after any interaction

  /* ── Global dither profile ───────────────────────────────
     A single, scroll-invariant set of visual parameters applied
     to every section. Colors are [r, g, b] in 0–1 range.
     density  – multiplier for dither threshold offset (pattern fill)
     scale    – noise frequency multiplier (pattern granularity)
     speed    – fBm animation speed multiplier
     flowX/Y  – directional drift of the noise field
     opacity  – base dither opacity
     warm     – colour A (primary warm tone)
     cool     – colour B (secondary cooler tone)
     ────────────────────────────────────────────────────────── */
  var PROFILE = {
    warm:    [0.77, 0.63, 0.38],   // #c4a060
    cool:    [0.48, 0.42, 0.31],   // #7a6a50
    density: 0.50,
    scale:   1.0,
    speed:   1.0,
    flowX:   0.0,
    flowY:   0.15,
    opacity: 0.22
  };

  /* ═══════════════════════════════════════════════════════════
     CANVAS CREATION
     ═══════════════════════════════════════════════════════════ */
  var canvas = document.createElement('canvas');
  canvas.id = 'bayer-bg';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';

  if (document.body.firstChild) {
    document.body.insertBefore(canvas, document.body.firstChild);
  } else {
    document.body.appendChild(canvas);
  }

  /* ═══════════════════════════════════════════════════════════
     WEBGL 2 CONTEXT
     ═══════════════════════════════════════════════════════════ */
  var gl = canvas.getContext('webgl2', {
    alpha: false,
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

  var VERT_SRC = [
    '#version 300 es',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
  ].join('\n');

  // Fragment — section-aware Bayer dithering with domain warping
  var FRAG_SRC = [
    '#version 300 es',
    'precision highp float;',
    '',
    'uniform vec2  uResolution;',
    'uniform float uTime;',
    'uniform vec2  uMouse;',
    'uniform float uPixelSize;',
    'uniform vec3  uBgColor;',
    '',
    '// Section-driven uniforms (smoothly interpolated on CPU side)',
    'uniform vec3  uColorA;',          // primary warm tone (blended)
    'uniform vec3  uColorB;',          // secondary cool tone (blended)
    'uniform float uDitherOpacity;',   // base opacity (blended)
    'uniform float uDensity;',         // pattern density (blended)
    'uniform float uNoiseScale;',      // noise frequency (blended)
    'uniform float uFlowSpeed;',       // animation speed (blended)
    'uniform vec2  uFlowDir;',         // flow direction (blended)
    '',
    '// Dynamic response uniforms',
    'uniform float uScrollVelocity;',  // scroll speed for reactive morphing
    'uniform float uInteractive;',     // interactive element glow boost
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
    'float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
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
    '/* ── 2-D value noise for domain warping ──────────────── */',
    'float vnoise2D(vec2 p) {',
    '  vec2 ip = floor(p);',
    '  vec2 fp = fract(p);',
    '  float a = hash12(ip);',
    '  float b = hash12(ip + vec2(1.0, 0.0));',
    '  float c = hash12(ip + vec2(0.0, 1.0));',
    '  float d = hash12(ip + vec2(1.0, 1.0));',
    '  vec2 w = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);',
    '  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y) * 2.0 - 1.0;',
    '}',
    '',
    '/* ── Fractal Brownian motion (5 octaves) with flow ───── */',
    '/* Per-octave amp decay (0.5) + lacunarity 2.0, normalized by the amp',
    '   sum so the output is a true [0,1] range that uDensity can modulate',
    '   (the old constant-amp/1.25 version saturated far outside [0,1]). */',
    'float fbm(vec2 uv, float t, float speed) {',
    '  vec3 p   = vec3(uv * 4.0, t * speed);',
    '  float amp  = 1.0;',
    '  float freq = 1.0;',
    '  float sum  = 0.0;',
    '  float norm = 0.0;',
    '',
    '  for (int i = 0; i < 5; ++i) {',
    '    sum  += amp * vnoise(p * freq);',
    '    norm += amp;',
    '    amp  *= 0.5;',
    '    freq *= 2.0;',
    '  }',
    '  return sum / norm * 0.5 + 0.5;',
    '}',
    '',
    '/* ── Domain-warped fBm for organic morphing ──────────── */',
    'float warpedFbm(vec2 uv, float t, float speed, float morphAmt) {',
    '  // First noise layer determines warp offset',
    '  float warpX = vnoise2D(uv * 2.0 + t * speed * 0.3) * morphAmt;',
    '  float warpY = vnoise2D(uv * 2.0 + vec2(5.2, 1.3) + t * speed * 0.25) * morphAmt;',
    '',
    '  vec2 warpedUV = uv + vec2(warpX, warpY);',
    '',
    '  // Second warp pass for more organic distortion',
    '  float warp2X = vnoise2D(warpedUV * 3.0 + t * speed * 0.15) * morphAmt * 0.5;',
    '  float warp2Y = vnoise2D(warpedUV * 3.0 + vec2(8.7, 3.1) + t * speed * 0.12) * morphAmt * 0.5;',
    '',
    '  warpedUV += vec2(warp2X, warp2Y);',
    '',
    '  return fbm(warpedUV, t, speed);',
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
    '  // Apply flow direction drift — noise field moves over time',
    '  vec2 flowOffset = uFlowDir * uTime * uFlowSpeed * 0.15;',
    '  vec2 flowUV = uv + flowOffset;',
    '',
    '  // Apply noise scale for section-dependent granularity',
    '  vec2 scaledUV = flowUV * uNoiseScale;',
    '',
    '  /* ── Mouse glow ──────────────────────────────────── */',
    '  vec2  mUV   = (uMouse - 0.5) * vec2(aspect, 1.0);',
    '  float mDist = length(uv - mUV);',
    '  float mGlow = exp(-mDist * 2.5) * 0.30;',
    '',
    '  // Interactive element boost — amplifies glow near active elements',
    '  float interGlow = exp(-mDist * 3.5) * uInteractive * 0.20;',
    '',
    '  /* ── Organic morphing via domain warping ─────────── */',
    '  // Morph intensity increases with scroll velocity',
    '  float morphAmt = 0.12 + abs(uScrollVelocity) * 0.8;',
    '',
    '  float feed = warpedFbm(scaledUV + uMouse * 0.04, uTime * uFlowSpeed, 1.0, morphAmt);',
    '',
    '  // Density-driven threshold offset. feed is now normalized [0,1], so it',
    '  // maps 1:1 onto coverage (the old *0.5 pre-scale compensated for the',
    '  // saturating fBm and would halve the density swing here).',
    '  feed = feed - (1.0 - uDensity) + mGlow + interGlow;',
    '',
    '  // Slight vertical gradient so pattern is denser near the bottom',
    '  feed += uv.y * 0.12;',
    '',
    '  // Scroll velocity ripple — pattern briefly intensifies with fast scrolling',
    '  feed += abs(uScrollVelocity) * 0.15 * sin(uv.x * 6.0 + uTime * 2.0);',
    '',
    '  /* ── Bayer ordered dithering ─────────────────────── */',
    '  float bayer = Bayer8(gl_FragCoord.xy / ps) - 0.5;',
    '  float bw    = step(0.5, feed + bayer);',
    '',
    '  /* ── Diamond mask ────────────────────────────────── */',
    '  float M = maskDiamond(pixelUV, bw);',
    '',
    '  /* ── Gradient colour (shifts over time) ─────────── */',
    '  float gt  = uv.x * 0.3 + uv.y * 0.3 + sin(uTime * 0.03) * 0.5 + 0.5;',
    '  vec3  col = mix(uColorA, uColorB, gt);',

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
     COMPILE & LINK (re-runnable)
     initGL() builds the program, its uniform locations and the VAO as one
     unit, so the webglcontextrestored handler can recreate every GL object
     a lost context invalidated — GL resources never survive context loss.
     ═══════════════════════════════════════════════════════════ */
  var prog = null;
  var loc = {};
  var vao = null;

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

  function initGL() {
    var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) {
      console.error('[bayer-bg] Shader compilation failed — background disabled');
      return false;
    }
    if (prog) gl.deleteProgram(prog);
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[bayer-bg] program link error:', gl.getProgramInfoLog(prog));
      prog = null;
      return false;
    }
    gl.useProgram(prog);

    [
      'uResolution', 'uTime', 'uMouse', 'uPixelSize', 'uBgColor',
      'uColorA', 'uColorB', 'uDitherOpacity', 'uDensity',
      'uNoiseScale', 'uFlowSpeed', 'uFlowDir',
      'uScrollVelocity', 'uInteractive'
    ].forEach(function (name) {
      loc[name] = gl.getUniformLocation(prog, name);
    });

    // Static uniform
    gl.uniform3f(loc.uBgColor, BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);

    // Empty VAO — the vertex shader is gl_VertexID-driven (no attributes).
    if (vao) gl.deleteVertexArray(vao);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    // Clear color is context state — reset it here so a restored context
    // (which resets ALL GL state) keeps clearing to the page background.
    gl.clearColor(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], 1.0);
    return true;
  }

  if (!initGL()) return;

  /* ═══════════════════════════════════════════════════════════
     CONTEXT LOSS
     Lost → preventDefault (so a restore can fire) and stop the rAF loop.
     Restored → rebuild program/uniform locations/VAO, re-upload the
     size-dependent uniforms via resize(), and resume — staying paused
     while the tab is hidden (visibilitychange re-arms start()).
     ═══════════════════════════════════════════════════════════ */
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    stop();   // drawing into a dead context is wasted work
  }, false);

  canvas.addEventListener('webglcontextrestored', function () {
    if (!initGL()) return;
    resize();
    // Reduced-motion has no loop; resize() → renderStatic() repaints it.
    if (!document.hidden && !(reducedMotion && reducedMotion.matches)) start();
  }, false);

  /* ═══════════════════════════════════════════════════════════
     REDUCED MOTION (runtime-togglable)
     ═══════════════════════════════════════════════════════════ */
  var reducedMotion = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  var baseAnimSpeed = (reducedMotion && reducedMotion.matches) ? 0.005 : ANIM_SPEED;

  // Toggling RM mid-session takes effect immediately: on → stop the loop and
  // paint one static frame; off → resume (unless the tab is hidden).
  if (reducedMotion && reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', function (e) {
      baseAnimSpeed = e.matches ? 0.005 : ANIM_SPEED;
      if (e.matches) {
        stop();
        renderStatic();
      } else if (!document.hidden) {
        start();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════
     RESIZE HANDLER
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
    // In reduced-motion mode there is no animation loop to repaint after a
    // backing-store realloc, so redraw the static frame explicitly.
    if (reducedMotion && reducedMotion.matches) renderStatic();
  }
  // Debounce resize: canvas backing-store realloc + uniform reset only after
  // the user stops dragging the window, not on every intermediate frame.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();

  /* ═══════════════════════════════════════════════════════════
     MOUSE / TOUCH TRACKING
     ═══════════════════════════════════════════════════════════ */
  var rawMX = 0.5, rawMY = 0.5;
  var smoothMX = 0.5, smoothMY = 0.5;

  // Tracks the last time the user interacted (pointer/scroll/hover) so the
  // render loop can throttle to IDLE_FPS when the page is quiet.
  var lastInteractionAt = performance.now();
  function markActive() { lastInteractionAt = performance.now(); }

  window.addEventListener('mousemove', function (e) {
    markActive();
    rawMX = e.clientX / window.innerWidth;
    rawMY = 1.0 - e.clientY / window.innerHeight;
  });

  window.addEventListener('touchmove', function (e) {
    markActive();
    if (e.touches.length > 0) {
      rawMX = e.touches[0].clientX / window.innerWidth;
      rawMY = 1.0 - e.touches[0].clientY / window.innerHeight;
    }
  }, { passive: true });

  /* ═══════════════════════════════════════════════════════════
     DYNAMIC INPUT SMOOTHING
     ═══════════════════════════════════════════════════════════ */

  // External input targets (set via public API)
  var extInteractive    = 0.0;
  var extScrollVelocity = 0.0;

  // Smoothed dynamic values (driven by scroll velocity & interactive state)
  var smoothInteractive    = 0.0;
  var smoothScrollVelocity = 0.0;

  /**
   * Smooth the dynamic inputs (scroll velocity & interactive glow)
   * toward their external targets. Profile values are constant, so
   * only these two reactive channels need per-frame smoothing.
   */
  function updateDynamicInputs(dt) {
    var k = VELOCITY_LERP * dt * 60;
    smoothInteractive    += (extInteractive    - smoothInteractive)    * k;
    smoothScrollVelocity += (extScrollVelocity - smoothScrollVelocity) * k;
    extScrollVelocity *= VELOCITY_DECAY;
  }

  /* ═══════════════════════════════════════════════════════════
     SCROLL VELOCITY TRACKING
     ═══════════════════════════════════════════════════════════ */
  var lastScrollY = window.scrollY || 0;
  var scrollVelocity = 0;

  function trackScrollVelocity() {
    var currentScrollY = window.scrollY || 0;
    var delta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;

    // Normalise by viewport height for a consistent 0–1ish range
    var vh = window.innerHeight || 1;
    scrollVelocity = delta / vh;

    // Feed to external target (will be smoothed in updateDynamicInputs)
    extScrollVelocity = Math.max(extScrollVelocity, Math.min(Math.abs(scrollVelocity) * 5.0, 1.0));
  }

  window.addEventListener('scroll', trackScrollVelocity, { passive: true });

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — allows main.js to push interactive state
     ═══════════════════════════════════════════════════════════ */
  window.bayerBg = {
    /**
     * Force the active section index (0–4).
     * No-op: the dither profile is now global and scroll-invariant.
     * Kept for backward compatibility with main.js.
     */
    setSection: function (index) {
      // intentionally empty — single global profile, nothing to switch
    },

    /**
     * Set interactive glow boost (0–1).
     * Call with 1 on element hover/focus, 0 on leave/blur.
     */
    setInteractive: function (state) {
      extInteractive = Math.max(0, Math.min(1, state));
      if (state > 0) markActive();
    },

    /**
     * Feed scroll velocity for reactive pattern morphing.
     * main.js can push GSAP's scroll velocity here.
     */
    setScrollVelocity: function (v) {
      extScrollVelocity = Math.max(0, Math.min(1, Math.abs(v)));
    },

    /**
     * Set fine-grained section progress (continuous 0–4).
     * No-op: the dither profile is now global and scroll-invariant.
     * Kept for backward compatibility with main.js.
     */
    setSectionProgress: function (progress) {
      // intentionally empty — single global profile, nothing to blend
    }
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER LOOP
     ═══════════════════════════════════════════════════════════ */
  var t0 = performance.now();
  var lastFrameTime = t0;
  var lastDraw = t0;
  var idleInterval = 1000 / IDLE_FPS;

  // Pause the render loop while the tab is hidden — browsers throttle rAF to
  // ~1Hz in background anyway, so this avoids burning GPU/battery on a canvas
  // nobody is looking at.
  var rafId = null;
  function frame() {
    var now = performance.now();
    var dt = Math.min((now - lastFrameTime) * 0.001, 0.1); // cap at 100ms
    lastFrameTime = now;

    // Smooth mouse position
    smoothMX += (rawMX - smoothMX) * MOUSE_LERP;
    smoothMY += (rawMY - smoothMY) * MOUSE_LERP;

    var elapsed = (now - t0) * 0.001;

    // Smooth dynamic inputs (scroll velocity & interactive glow)
    updateDynamicInputs(dt);

    // Adaptive throttle: render every frame while recently active (scroll,
    // pointer, hover), else cap to IDLE_FPS to spare the GPU on a slow pattern.
    var active = (now - lastInteractionAt) < ACTIVE_WINDOW_MS ||
                 smoothScrollVelocity > 0.001 || smoothInteractive > 0.001;
    if (active || (now - lastDraw) >= idleInterval) {
      lastDraw = now;
      paint(elapsed);
    }
    rafId = requestAnimationFrame(frame);
  }
  // Single full draw from the current smoothed state — shared by the animated
  // frame loop and the reduced-motion static frame.
  function paint(elapsed) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(loc.uTime, elapsed);
    gl.uniform2f(loc.uMouse, smoothMX, smoothMY);
    gl.uniform3f(loc.uColorA, PROFILE.warm[0], PROFILE.warm[1], PROFILE.warm[2]);
    gl.uniform3f(loc.uColorB, PROFILE.cool[0], PROFILE.cool[1], PROFILE.cool[2]);
    gl.uniform1f(loc.uDitherOpacity, PROFILE.opacity);
    gl.uniform1f(loc.uDensity, PROFILE.density);
    gl.uniform1f(loc.uNoiseScale, PROFILE.scale);
    gl.uniform1f(loc.uFlowSpeed, PROFILE.speed * baseAnimSpeed);
    gl.uniform2f(loc.uFlowDir, PROFILE.flowX, PROFILE.flowY);
    gl.uniform1f(loc.uScrollVelocity, smoothScrollVelocity);
    gl.uniform1f(loc.uInteractive, smoothInteractive);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function renderStatic() {
    updateDynamicInputs(0.016);
    paint((performance.now() - t0) * 0.001);
  }

  function start() { if (rafId == null) { lastFrameTime = performance.now(); rafId = requestAnimationFrame(frame); } }
  function stop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

  // Reduced-motion: render a single static frame (no continuous loop) so the
  // background fully respects the motion preference and uses no idle GPU.
  // visibilitychange is registered unconditionally so an RM toggle at runtime
  // still suspends/resumes the loop correctly.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!(reducedMotion && reducedMotion.matches)) start();
  });

  if (reducedMotion && reducedMotion.matches) {
    renderStatic();
  } else {
    start();
  }

  console.log('[bayer-bg] ✓ WebGL2 Bayer diamond dithering initialized');
})();
