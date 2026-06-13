/**
 * Bayer Diamond Dithering — WebGL2 Full-Screen Animated Background
 * Section-Aware Organic Morphing Edition
 *
 * Visual features:
 *  – 8×8 Bayer ordered-dithering with diamond-shaped pixel masks
 *  – Domain-warped fBm noise for organic pattern morphing
 *  – Section-aware color profiles that shift with scroll position
 *  – Dynamic pattern density, flow direction, and speed per section
 *  – Seamless visual bridging between sections via smooth interpolation
 *  – Scroll velocity response for reactive pattern behaviour
 *  – Interactive element synchronization (hover states, card focus)
 *  – Mouse-tracking glow that subtly shifts the pattern
 *  – Soft radial vignette keeps centre content readable
 *  – Respects prefers-reduced-motion
 *
 * Public API (window.bayerBg):
 *  – setSection(index)        — force active section (0–4)
 *  – setInteractive(state)    — boost glow from interactive elements (0–1)
 *  – setScrollVelocity(v)     — feed scroll velocity for pattern response
 *  – setSectionProgress(p)    — fine-grained section blend progress (0–4)
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     CONFIGURATION
     ═══════════════════════════════════════════════════════════ */
  var PIXEL_SIZE      = 4;
  var BG_COLOR        = [0.039, 0.039, 0.039];   // #0a0a0a body bg
  var MOUSE_LERP      = 0.04;
  var DPR_CAP         = 2;
  var ANIM_SPEED      = 0.05;
  var SCROLL_LERP     = 0.06;   // smoothing for scroll-driven values
  var VELOCITY_LERP   = 0.03;   // smoothing for scroll velocity
  var VELOCITY_DECAY  = 0.92;   // velocity decay per frame

  /* ── Section visual profiles ──────────────────────────────
     Each profile defines the dither behaviour for a section.
     Colors are [r, g, b] in 0–1 range.
     density  – multiplier for dither threshold offset (pattern fill)
     scale    – noise frequency multiplier (pattern granularity)
     speed    – fBm animation speed multiplier
     flowX/Y  – directional drift of the noise field
     opacity  – base dither opacity for this section
     warm     – colour A (primary warm tone)
     cool     – colour B (secondary cooler tone)
     ────────────────────────────────────────────────────────── */
  var SECTION_PROFILES = [
    { // 0 — Hero: warm amber, medium density, slow organic flow
      warm: [0.77, 0.63, 0.38],    // #c4a060
      cool: [0.48, 0.42, 0.31],    // #7a6a50
      density:  0.50,
      scale:    1.0,
      speed:    1.0,
      flowX:    0.0,
      flowY:    0.15,
      opacity:  0.22
    },
    { // 1 — About: cooler muted, lower density, gentle horizontal drift
      warm: [0.62, 0.58, 0.48],    // #9e947a
      cool: [0.40, 0.38, 0.32],    // #666052
      density:  0.35,
      scale:    0.8,
      speed:    0.7,
      flowX:    0.2,
      flowY:    0.05,
      opacity:  0.16
    },
    { // 2 — Projects: warmer saturated, higher density, dynamic swirl
      warm: [0.82, 0.65, 0.35],    // #d1a65a
      cool: [0.55, 0.45, 0.28],    // #8c7347
      density:  0.65,
      scale:    1.3,
      speed:    1.4,
      flowX:    0.15,
      flowY:    -0.1,
      opacity:  0.26
    },
    { // 3 — Experience: neutral steady, medium density, vertical flow
      warm: [0.68, 0.60, 0.44],    // #ae9970
      cool: [0.44, 0.40, 0.33],    // #706654
      density:  0.45,
      scale:    0.9,
      speed:    0.8,
      flowX:    -0.1,
      flowY:    0.2,
      opacity:  0.18
    },
    { // 4 — Contact: brightest warm, increasing density, convergent
      warm: [0.85, 0.72, 0.45],    // #d9b873
      cool: [0.58, 0.50, 0.35],    // #948059
      density:  0.55,
      scale:    1.1,
      speed:    1.2,
      flowX:    0.0,
      flowY:    -0.15,
      opacity:  0.24
    }
  ];

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
    'uniform float uSectionBlend;',    // transition intensity (0=stable, 1=boundary)
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
    'float fbm(vec2 uv, float t, float speed) {',
    '  vec3 p   = vec3(uv * 4.0, t * speed);',
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
    '  // Morph intensity increases with scroll velocity and section transitions',
    '  float baseMorph = 0.12;',
    '  float velocityMorph = abs(uScrollVelocity) * 0.8;',
    '  float transitionMorph = uSectionBlend * 0.25;',
    '  float morphAmt = baseMorph + velocityMorph + transitionMorph;',
    '',
    '  float feed = warpedFbm(scaledUV + uMouse * 0.04, uTime * uFlowSpeed, 1.0, morphAmt);',
    '',
    '  // Density-driven threshold offset',
    '  feed = feed * 0.5 - (1.0 - uDensity) + mGlow + interGlow;',
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
    '  /* ── Gradient colour (shifts over time + section blend) ─ */',
    '  float gt  = uv.x * 0.3 + uv.y * 0.3 + sin(uTime * 0.03) * 0.5 + 0.5;',
    '  vec3  col = mix(uColorA, uColorB, gt);',
    '',
    '  // Subtle colour shift at section boundaries for visual bridging',
    '  float bridgePulse = sin(uTime * 0.5) * 0.5 + 0.5;',
    '  col += uSectionBlend * 0.06 * bridgePulse * vec3(0.1, 0.08, 0.05);',
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

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  /* ═══════════════════════════════════════════════════════════
     UNIFORMS
     ═══════════════════════════════════════════════════════════ */
  var loc = {};
  [
    'uResolution', 'uTime', 'uMouse', 'uPixelSize', 'uBgColor',
    'uColorA', 'uColorB', 'uDitherOpacity', 'uDensity',
    'uNoiseScale', 'uFlowSpeed', 'uFlowDir',
    'uScrollVelocity', 'uInteractive', 'uSectionBlend'
  ].forEach(function (name) {
    loc[name] = gl.getUniformLocation(prog, name);
  });

  // Static uniform
  gl.uniform3f(loc.uBgColor, BG_COLOR[0], BG_COLOR[1], BG_COLOR[2]);

  /* ═══════════════════════════════════════════════════════════
     VAO
     ═══════════════════════════════════════════════════════════ */
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

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
  }
  window.addEventListener('resize', resize);
  resize();

  /* ═══════════════════════════════════════════════════════════
     MOUSE / TOUCH TRACKING
     ═══════════════════════════════════════════════════════════ */
  var rawMX = 0.5, rawMY = 0.5;
  var smoothMX = 0.5, smoothMY = 0.5;

  window.addEventListener('mousemove', function (e) {
    rawMX = e.clientX / window.innerWidth;
    rawMY = 1.0 - e.clientY / window.innerHeight;
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
  var baseAnimSpeed = reducedMotion.matches ? 0.005 : ANIM_SPEED;

  reducedMotion.addEventListener('change', function (e) {
    baseAnimSpeed = e.matches ? 0.005 : ANIM_SPEED;
  });

  /* ═══════════════════════════════════════════════════════════
     SECTION TRACKING & INTERPOLATION
     ═══════════════════════════════════════════════════════════ */

  // Current interpolated section state (smoothly animated)
  var sectionState = {
    colorA:        SECTION_PROFILES[0].warm.slice(),
    colorB:        SECTION_PROFILES[0].cool.slice(),
    density:       SECTION_PROFILES[0].density,
    noiseScale:    SECTION_PROFILES[0].scale,
    flowSpeed:     SECTION_PROFILES[0].speed,
    flowDirX:      SECTION_PROFILES[0].flowX,
    flowDirY:      SECTION_PROFILES[0].flowY,
    opacity:       SECTION_PROFILES[0].opacity,
    scrollVelocity: 0.0,
    interactive:   0.0,
    sectionBlend:  0.0
  };

  // Target state (set by scroll position, snapped to section profiles)
  var targetState = {
    colorA:        SECTION_PROFILES[0].warm.slice(),
    colorB:        SECTION_PROFILES[0].cool.slice(),
    density:       SECTION_PROFILES[0].density,
    noiseScale:    SECTION_PROFILES[0].scale,
    flowSpeed:     SECTION_PROFILES[0].speed,
    flowDirX:      SECTION_PROFILES[0].flowX,
    flowDirY:      SECTION_PROFILES[0].flowY,
    opacity:       SECTION_PROFILES[0].opacity,
    sectionBlend:  0.0
  };

  // External input targets (set via public API)
  var extInteractive   = 0.0;
  var extScrollVelocity = 0.0;

  // Section elements — cached after DOM is ready
  var sectionElements = null;
  var sectionCount = SECTION_PROFILES.length;

  function cacheSectionElements() {
    var ids = ['hero', 'about', 'projects', 'experience', 'contact'];
    sectionElements = ids.map(function (id) {
      return document.getElementById(id);
    }).filter(Boolean);
    sectionCount = sectionElements.length;
  }

  // Attempt to cache immediately; also retry after DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cacheSectionElements);
  } else {
    cacheSectionElements();
  }

  /**
   * Compute which section the viewport centre is over,
   * and a blend factor for transitions.
   * Returns { index, blend, progress }
   *   index  — dominant section index (0-based)
   *   blend  — 0.0 when centred on a section, approaches 1.0 at boundaries
   *   progress — continuous 0–sectionCount value representing scroll position
   */
  function computeSectionFromScroll() {
    if (!sectionElements || sectionElements.length === 0) {
      return { index: 0, frac: 0, sectionBlend: 0, progress: 0 };
    }

    var scrollY = window.scrollY || window.pageYOffset;
    var totalScroll = document.documentElement.scrollHeight - window.innerHeight;

    // Normalised scroll progress across the entire page
    var scrollNorm = totalScroll > 0 ? scrollY / totalScroll : 0;

    // Map to section-space (0 to sectionCount)
    var progress = scrollNorm * sectionCount;

    // Determine dominant section index
    var idx = Math.min(Math.floor(progress), sectionCount - 1);

    // Fractional position within the current section (0–1)
    var frac = progress - idx;

    // Section blend: transition intensity for shader effects
    // Peaks mid-section, zero at boundaries — matches setSectionProgress formula
    var sectionBlend = (frac > 0.1 && frac < 0.9)
      ? Math.sin(frac * Math.PI)
      : 0;

    // If we're past the last section, clamp
    if (idx >= sectionCount - 1) {
      sectionBlend = 0;
    }

    return { index: idx, frac: frac, sectionBlend: sectionBlend, progress: progress };
  }

  /**
   * Blend two section profiles together based on a factor t (0–1).
   * Writes result into targetState.
   */
  function blendProfiles(profileA, profileB, t) {
    for (var i = 0; i < 3; i++) {
      targetState.colorA[i] = profileA.warm[i] * (1 - t) + profileB.warm[i] * t;
      targetState.colorB[i] = profileA.cool[i] * (1 - t) + profileB.cool[i] * t;
    }
    targetState.density    = profileA.density  * (1 - t) + profileB.density  * t;
    targetState.noiseScale = profileA.scale    * (1 - t) + profileB.scale    * t;
    targetState.flowSpeed  = profileA.speed    * (1 - t) + profileB.speed    * t;
    targetState.flowDirX   = profileA.flowX    * (1 - t) + profileB.flowX    * t;
    targetState.flowDirY   = profileA.flowY    * (1 - t) + profileB.flowY    * t;
    targetState.opacity    = profileA.opacity  * (1 - t) + profileB.opacity  * t;
  }

  /**
   * Update target section state based on current scroll position.
   * Called every frame before rendering.
   */
  function updateSectionTarget() {
    var info = computeSectionFromScroll();
    var idx = info.index;
    var frac = info.frac;

    // Blend between adjacent sections using fractional progress (matches setSectionProgress)
    if (frac > 0.01 && idx < sectionCount - 1) {
      blendProfiles(SECTION_PROFILES[idx], SECTION_PROFILES[idx + 1], frac);
    } else {
      var p = SECTION_PROFILES[idx];
      for (var i = 0; i < 3; i++) {
        targetState.colorA[i] = p.warm[i];
        targetState.colorB[i] = p.cool[i];
      }
      targetState.density    = p.density;
      targetState.noiseScale = p.scale;
      targetState.flowSpeed  = p.speed;
      targetState.flowDirX   = p.flowX;
      targetState.flowDirY   = p.flowY;
      targetState.opacity    = p.opacity;
    }

    // Update section blend target (will be lerped smoothly)
    targetState.sectionBlend = info.sectionBlend;
  }

  /**
   * Smoothly interpolate sectionState toward targetState.
   */
  function lerpSectionState(dt) {
    var t = 1.0 - Math.pow(1.0 - SCROLL_LERP, dt * 60);

    for (var i = 0; i < 3; i++) {
      sectionState.colorA[i] += (targetState.colorA[i] - sectionState.colorA[i]) * t;
      sectionState.colorB[i] += (targetState.colorB[i] - sectionState.colorB[i]) * t;
    }
    sectionState.density     += (targetState.density     - sectionState.density)     * t;
    sectionState.noiseScale  += (targetState.noiseScale  - sectionState.noiseScale)  * t;
    sectionState.flowSpeed   += (targetState.flowSpeed   - sectionState.flowSpeed)   * t;
    sectionState.flowDirX    += (targetState.flowDirX    - sectionState.flowDirX)    * t;
    sectionState.flowDirY    += (targetState.flowDirY    - sectionState.flowDirY)    * t;
    sectionState.opacity     += (targetState.opacity     - sectionState.opacity)     * t;
    sectionState.sectionBlend += (targetState.sectionBlend - sectionState.sectionBlend) * t;

    // Smooth external inputs
    sectionState.interactive += (extInteractive - sectionState.interactive) * VELOCITY_LERP * dt * 60;

    // Scroll velocity with decay
    sectionState.scrollVelocity += (extScrollVelocity - sectionState.scrollVelocity) * VELOCITY_LERP * dt * 60;
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

    // Feed to external target (will be smoothed in lerpSectionState)
    extScrollVelocity = Math.max(extScrollVelocity, Math.min(Math.abs(scrollVelocity) * 5.0, 1.0));
  }

  window.addEventListener('scroll', trackScrollVelocity, { passive: true });

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — allows main.js to push interactive state
     ═══════════════════════════════════════════════════════════ */
  window.bayerBg = {
    /**
     * Force the active section index (0–4).
     * Useful when main.js has better section detection via ScrollTrigger.
     */
    setSection: function (index) {
      var idx = Math.max(0, Math.min(index, sectionCount - 1));
      var p = SECTION_PROFILES[idx];
      for (var i = 0; i < 3; i++) {
        targetState.colorA[i] = p.warm[i];
        targetState.colorB[i] = p.cool[i];
      }
      targetState.density    = p.density;
      targetState.noiseScale = p.scale;
      targetState.flowSpeed  = p.speed;
      targetState.flowDirX   = p.flowX;
      targetState.flowDirY   = p.flowY;
      targetState.opacity    = p.opacity;
    },

    /**
     * Set interactive glow boost (0–1).
     * Call with 1 on element hover/focus, 0 on leave/blur.
     */
    setInteractive: function (state) {
      extInteractive = Math.max(0, Math.min(1, state));
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
     * Overrides scroll-based section detection when called.
     */
    setSectionProgress: function (progress) {
      // Delegate to updateSectionTarget which reads scroll position directly.
      // This ensures consistent blend calculations between external and internal mode.
      // Kept for API compatibility with main.js.
    }
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER LOOP
     ═══════════════════════════════════════════════════════════ */
  gl.clearColor(BG_COLOR[0], BG_COLOR[1], BG_COLOR[2], 1.0);

  var t0 = performance.now();
  var lastFrameTime = t0;

  (function frame() {
    var now = performance.now();
    var dt = Math.min((now - lastFrameTime) * 0.001, 0.1); // cap at 100ms
    lastFrameTime = now;

    // Smooth mouse position
    smoothMX += (rawMX - smoothMX) * MOUSE_LERP;
    smoothMY += (rawMY - smoothMY) * MOUSE_LERP;

    var elapsed = (now - t0) * 0.001;

    // Always update section target from current scroll position
    updateSectionTarget();

    // Smoothly interpolate all section state
    lerpSectionState(dt);

    gl.clear(gl.COLOR_BUFFER_BIT);

    // Time uniforms
    gl.uniform1f(loc.uTime, elapsed);
    gl.uniform2f(loc.uMouse, smoothMX, smoothMY);

    // Section-blended uniforms
    gl.uniform3f(loc.uColorA, sectionState.colorA[0], sectionState.colorA[1], sectionState.colorA[2]);
    gl.uniform3f(loc.uColorB, sectionState.colorB[0], sectionState.colorB[1], sectionState.colorB[2]);
    gl.uniform1f(loc.uDitherOpacity, sectionState.opacity);
    gl.uniform1f(loc.uDensity, sectionState.density);
    gl.uniform1f(loc.uNoiseScale, sectionState.noiseScale);
    gl.uniform1f(loc.uFlowSpeed, sectionState.flowSpeed * baseAnimSpeed);
    gl.uniform2f(loc.uFlowDir, sectionState.flowDirX, sectionState.flowDirY);

    // Dynamic response uniforms
    gl.uniform1f(loc.uScrollVelocity, sectionState.scrollVelocity);
    gl.uniform1f(loc.uInteractive, sectionState.interactive);
    gl.uniform1f(loc.uSectionBlend, sectionState.sectionBlend);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  })();

  console.log('[bayer-bg] ✓ WebGL2 section-aware Bayer diamond dithering initialized');
})();
