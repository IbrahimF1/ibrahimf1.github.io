/**
 * Contact Section — 3D ASCII Point-Cloud Portrait
 *
 * Renders assets/profile_pic.png (transparent) as a cloud of camera-facing
 * ASCII glyphs scattered along the camera axis. As the user scrolls into the
 * contact section the camera retreats out of the cloud and the portrait
 * resolves into a crisp field of monospace characters — a scroll-driven
 * "assembly" effect behind the contact panel.
 *
 * Design notes:
 *  – Adapted from the classic three.js instanced-image technique. The image is
 *    sampled into an offscreen canvas; only OPAQUE pixels become instances, so
 *    the transparent background of the PNG stays empty (the site dither shows
 *    through behind the silhouette).
 *  – PHASE 1 (this revision): cubes are replaced by camera-facing ASCII
 *    billboards. Each instance picks a glyph from a luminance ramp rendered in
 *    the site's "Space Mono" face, while its COLOR is the original photo RGB
 *    (the palette is intentionally untouched). A Bayer occupancy gate (ported
 *    from favicon.js) thins the grid into negative-space halftone, and a
 *    depth-weighted alpha gives the scattered cloud atmosphere.
 *  – The whole-page scroll mapping of the original is rebound to the contact
 *    section's own scroll progress (the finale of the page).
 *  – Three.js is lazy-loaded from a CDN only when the contact section is
 *    approached, so users who never reach contact pay no cost.
 *  – Rendering is gated to the contact viewport and paused otherwise.
 *  – Respects prefers-reduced-motion (renders the resolved portrait statically).
 *  – window.contactCloud exposes setProgress/setVelocity/setInteractive/
 *    setMouse so main.js can drive the cloud in later phases (mirrors the
 *    window.bayerBg pattern). Until then a self-contained scroll path drives it.
 */
(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       CONFIGURATION
       ═══════════════════════════════════════════════════════════ */
    var IMG_URL         = 'assets/profile_pic.png';
    var THREE_CDN       = 'https://cdn.jsdelivr.net/npm/three@0.130.0/build/three.min.js';

    var GRID_ROWS       = 180;                        // sampling resolution (image height)
    var INSTANCE_SIZE   = 1;                          // grid cell size in world units
    var FOV             = 75;
    var TARGET_CAMERA_Z = 180;                        // camera z at which the image resolves (also sizes it)
    var INIT_CAMERA_Z   = TARGET_CAMERA_Z / 5;        // camera z while inside the cloud
    var RAND_RANGE_Z    = 2 * TARGET_CAMERA_Z * 0.2; // depth spread of the instances
    var ALPHA_THRESHOLD = 20;                         // discard pixels below this alpha
    var CAMERA_LERP     = 0.08;                       // smoothing for scroll-driven camera
    var EARLY_MARGIN    = '300px 0px 300px 0px';      // pre-load when contact is near

    /* ── Phase 1 ASCII / look tuning ───────────────────────────
       RAMP          – luminance ramp rendered in Space Mono (index 0 = sparsest)
       ATLAS_CELL    – per-glyph atlas cell size (px); atlas is a horizontal strip
       GLYPH_WORLD   – quad edge length as a fraction of the grid cell (leaves
                       negative space so glyphs read as characters, not a solid block)
       BAYER_MIN/MAX – occupancy gate range (luminance-modulated). A pixel is kept
                       only when bayerThreshold(j,i) <= gate. Keeps features dense,
                       thins shadows to negative-space dither.
       FADE_NEAR/FAR – depth-alpha curve (0..1, relative to the depth spread).
                       Near instances opaque, far ones fade out. Alpha only.
       ────────────────────────────────────────────────────────── */
    var RAMP            = '.:-=+*#%@█';  // sparse -> dense; solid block = darkest ink
    var ATLAS_CELL      = 64;
    var ATLAS_FONT_RATIO = 1.0;          // glyph ink fill within its atlas cell
    var GLYPH_WORLD     = 1.3;            // quad scale (bigger, slightly overlapping glyphs)
    var BAYER_MIN_GATE  = 1.0;            // A3 thinning disabled (was too sparse)
    var BAYER_MAX_GATE  = 1.0;
    var FADE_NEAR       = 0.8;            // gentler depth fade — only farthest fade
    var FADE_FAR        = 1.0;

    // ASCII color contrast (lifts a dark subject into visibility). Applied in
    // the fragment shader after the atlas alpha: gamma lifts shadows, contrast
    // steepens midtones, brightness is a global offset.
    var ASCII_GAMMA      = 0.6;          // <1 lifts shadows (raised → dimmer shadows)
    var ASCII_CONTRAST   = 2;           // >1 steepens midtones
    var ASCII_BRIGHTNESS = 0.08;           // global lift (lowered)

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var contactSection = document.getElementById('contact');
    if (!contactSection) return;

    /* ═══════════════════════════════════════════════════════════
       CANVAS
       ═══════════════════════════════════════════════════════════ */
    var canvas = document.createElement('canvas');
    canvas.id = 'contact-cloud';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    var renderer, scene, camera, mesh, material, uni;
    var inited = false;
    var imageLoaded = false;
    var portraitWorldW = 0;   // resolved portrait width in world units (nCol * INSTANCE_SIZE)
    var rafId = null;
    var startTime = performance.now();
    var targetZ = reduceMotion ? TARGET_CAMERA_Z : INIT_CAMERA_Z;

    // Shader-facing state (lerped toward these each frame)
    var curProgress = 0;
    var externalProgress = false;
    var apiState = { velocity: 0, interactive: 0, mouseX: 0.5, mouseY: 0.5 };

    /* ═══════════════════════════════════════════════════════════
       PERSPECTIVE HELPER
       Places an instance at depth `targetZ` so that, viewed from camera z = d,
       it projects to the correct on-screen position with correct size.
       (Carried over from the reference implementation.)
       ═══════════════════════════════════════════════════════════ */
    function project(x, y, targetZ) {
        var h = 0.5;
        var d = TARGET_CAMERA_Z;
        var D = -targetZ + d;
        var H = h / d * D;
        var s = H / h;
        return { s: s, x: x * s, y: y * s, z: targetZ };
    }

    /* ═══════════════════════════════════════════════════════════
       COLOR / DITHER HELPERS  (ported from favicon.js)
       ═══════════════════════════════════════════════════════════ */
    // WCAG 2.x relative luminance for 0..1 RGB.
    function luminance01(r, g, b) {
        var ch = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    }

    var BAYER_4X4 = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];
    // Ordered-dither threshold (0..1) for integer pixel (x, y). Tiles seamlessly.
    function bayerThreshold(x, y) {
        var bx = ((x % 4) + 4) % 4;
        var by = ((y % 4) + 4) % 4;
        return (BAYER_4X4[by][bx] + 0.5) / 16;
    }

    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

    /* ═══════════════════════════════════════════════════════════
       LAZY THREE.JS LOADER
       ═══════════════════════════════════════════════════════════ */
    function loadThree(cb) {
        if (window.THREE) { cb(); return; }
        var s = document.createElement('script');
        s.src = THREE_CDN;
        s.onload = function () { if (window.THREE) cb(); };
        s.onerror = function () { console.warn('[contact-cloud] Three.js failed to load'); };
        document.head.appendChild(s);
    }

    /* ═══════════════════════════════════════════════════════════
       GLYPH ATLAS — render the luminance ramp in Space Mono into a
       horizontal canvas strip. Stored as an alpha mask (solid white glyphs on
       transparent ground); per-instance COLOR comes from the photo.
       ═══════════════════════════════════════════════════════════ */
    function buildAtlas(cb) {
        var draw = function () {
            var n = RAMP.length;
            var can = document.createElement('canvas');
            can.width = ATLAS_CELL * n;
            can.height = ATLAS_CELL;
            var ctx = can.getContext('2d');
            ctx.clearRect(0, 0, can.width, can.height);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '700 ' + Math.floor(ATLAS_CELL * ATLAS_FONT_RATIO) + 'px "Space Mono", monospace';
            for (var i = 0; i < n; i++) {
                ctx.fillText(RAMP.charAt(i), i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2);
            }
            var tex = new THREE.CanvasTexture(can);
            tex.magFilter = THREE.NearestFilter;     // crisp ditherpunk edges
            tex.minFilter = THREE.NearestFilter;     // no mipmaps → no cell bleed
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            cb(tex);
        };
        // Ensure Space Mono is available before rasterising the ramp.
        if (document.fonts && document.fonts.load) {
            document.fonts.load('700 ' + Math.floor(ATLAS_CELL * ATLAS_FONT_RATIO) + 'px "Space Mono"').then(draw, draw);
        } else {
            draw();
        }
    }

    /* ═══════════════════════════════════════════════════════════
       SHADERS  (RawShaderMaterial — declares everything explicitly,
       matches three.js' instanced-billboards example pattern)
       ═══════════════════════════════════════════════════════════ */
    var VERT_SRC = [
        'precision highp float;',
        '',
        'attribute vec3 position;',
        'attribute vec2 uv;',
        '',
        'uniform mat4 modelViewMatrix;',
        'uniform mat4 projectionMatrix;',
        '',
        '// Per-instance attributes',
        'attribute vec3  aOffset;',
        'attribute float aScale;',
        'attribute vec3  aColor;',
        'attribute float aGlyph;',
        'attribute float aDepth01;',
        'attribute float aPhase;',
        'attribute vec3  aDir;',
        'attribute float aSeed;',
        '',
        'uniform float uGlyphSize;',
        'uniform float uRampCount;',
        'uniform float uProgress;   // 0 scattered .. 1 resolved (Phase 2 motion)',
        'uniform float uTime;',
        'uniform vec2  uMouse;',
        'uniform float uVelocity;',
        'uniform float uInteractive;',
        '',
        'varying vec2  vGlyphUV;',
        'varying vec3  vColor;',
        'varying float vDepth;',
        '',
        'void main() {',
        '    // Billboard: anchor the quad at the instance offset in view space,',
        '    // then add the corner in the camera plane so it always faces camera.',
        '    vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);',
        '    mv.xy += position.xy * aScale * uGlyphSize;',
        '',
        '    vColor = aColor;',
        '    vDepth = aDepth01;',
        '',
        '    float cellW = 1.0 / uRampCount;',
        '    vGlyphUV = vec2((uv.x + aGlyph) * cellW, uv.y);',
        '',
        '    gl_Position = projectionMatrix * mv;',
        '}'
    ].join('\n');

    var FRAG_SRC = [
        'precision highp float;',
        '',
        'uniform sampler2D uAtlas;',
        'uniform float uFadeNear;',
        'uniform float uFadeFar;',
        'uniform float uGamma;',
        'uniform float uContrast;',
        'uniform float uBrightness;',
        '',
        'varying vec2  vGlyphUV;',
        'varying vec3  vColor;',
        'varying float vDepth;',
        '',
        'void main() {',
        '    float glyphA = texture2D(uAtlas, vGlyphUV).a;',
        '    if (glyphA < 0.02) discard;',
        '',
        '    // Depth atmosphere: near instances opaque, far ones fade out (alpha only).',
        '    float d = clamp(vDepth, 0.0, 1.0);',
        '    float depthFade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);',
        '',
        '    // Contrast curve: gamma lifts shadows, contrast steepens, brightness offsets.',
        '    vec3 c = pow(clamp(vColor, 0.0, 1.0), vec3(uGamma));',
        '    c = (c - 0.5) * uContrast + 0.5 + uBrightness;',
        '    gl_FragColor = vec4(clamp(c, 0.0, 1.0), glyphA * depthFade);',
        '}'
    ].join('\n');

    function createMaterial(tex) {
        var m = new THREE.RawShaderMaterial({
            uniforms: {
                uAtlas:       { value: tex },
                uRampCount:   { value: RAMP.length },
                uGlyphSize:   { value: GLYPH_WORLD },
                uProgress:    { value: 0 },
                uTime:        { value: 0 },
                uMouse:       { value: new THREE.Vector2(0.5, 0.5) },
                uVelocity:    { value: 0 },
                uInteractive: { value: 0 },
                uFadeNear:    { value: FADE_NEAR },
                uFadeFar:     { value: FADE_FAR },
                uGamma:       { value: ASCII_GAMMA },
                uContrast:    { value: ASCII_CONTRAST },
                uBrightness:  { value: ASCII_BRIGHTNESS }
            },
            vertexShader: VERT_SRC,
            fragmentShader: FRAG_SRC,
            transparent: true,
            depthWrite: false,
            depthTest: true
        });
        return m;
    }

    /* ═══════════════════════════════════════════════════════════
       INITIALIZATION
       ═══════════════════════════════════════════════════════════ */
    function init() {
        if (inited) return;
        inited = true;

        try {
            renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        } catch (e) {
            console.warn('[contact-cloud] WebGL unavailable — disabled');
            return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(FOV, 2, 0.5, 1000);
        camera.position.set(0, 0, targetZ);

        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });

        // Atlas first (needs the font), then material, then the image-driven mesh.
        buildAtlas(function (tex) {
            material = createMaterial(tex);
            uni = material.uniforms;

            var img = new Image();
            img.onload = function () { buildMesh(img); };
            img.onerror = function () { console.warn('[contact-cloud] profile image failed to load'); };
            img.src = IMG_URL;
        });

        onResize();
        onScroll();
    }

    /* ═══════════════════════════════════════════════════════════
       BUILD INSTANCED BILLBOARD MESH FROM IMAGE
       Only opaque pixels become instances; A3 Bayer-thins the survivors;
       each becomes a camera-facing ASCII glyph carrying its original color.
       ═══════════════════════════════════════════════════════════ */
    function buildMesh(img) {
        var imgW = img.naturalWidth || img.width;
        var imgH = img.naturalHeight || img.height;
        if (!imgW || !imgH) { imageLoaded = true; return; }

        var imgAspect = imgW / imgH;
        var nRow = GRID_ROWS;
        var nCol = Math.max(1, Math.round(nRow * imgAspect));
        portraitWorldW = nCol * INSTANCE_SIZE;

        // Sample the image down to the grid resolution.
        var can = document.createElement('canvas');
        can.width = nCol;
        can.height = nRow;
        var ctx = can.getContext('2d');
        ctx.drawImage(img, 0, 0, imgW, imgH, 0, 0, nCol, nRow);
        var data = ctx.getImageData(0, 0, nCol, nRow).data;

        var rampLen = RAMP.length;
        var sz = INSTANCE_SIZE;
        var spreadZ = RAND_RANGE_Z * sz;          // full depth span (for depth01)

        // First pass: collect surviving instances (alpha + Bayer gate) into
        // typed arrays directly. Dynamic arrays used for staging.
        var aOffset = [];   // x,y,z triples
        var aScale = [];
        var aColor = [];    // r,g,b triples
        var aGlyph = [];
        var aDepth = [];
        var aPhase = [];
        var aDir = [];      // dx,dy,dz triples
        var aSeed = [];

        for (var i = 0; i < nRow; i++) {
            for (var j = 0; j < nCol; j++) {
                var idx = (i * nCol + j) * 4;
                if (data[idx + 3] <= ALPHA_THRESHOLD) continue;

                var r = data[idx] / 255;
                var g = data[idx + 1] / 255;
                var b = data[idx + 2] / 255;
                var L = luminance01(r, g, b);

                // A3 — luminance-modulated Bayer occupancy gate.
                var gate = BAYER_MIN_GATE + (BAYER_MAX_GATE - BAYER_MIN_GATE) * L;
                if (bayerThreshold(j, i) > gate) continue;

                var z = THREE.MathUtils.randFloatSpread(RAND_RANGE_Z) * sz;
                var p = project(
                    (j - nCol / 2 + 0.5) * sz,
                    (nRow / 2 - i + 0.5) * sz,   // flip: image row 0 = top
                    z
                );

                // depth01: 0 nearest the camera, 1 farthest (relative to spread).
                var depth01 = 0.5 - z / spreadZ;

                // Glyph chosen by luminance, INVERTED so dark areas get the densest
                // glyphs (classic ASCII): a dark subject renders as solid ink, not
                // sparse dots. Color is still the original photo RGB.
                var glyph = Math.floor((1.0 - L) * rampLen);
                if (glyph > rampLen - 1) glyph = rampLen - 1;
                if (glyph < 0) glyph = 0;

                // Random unit direction (for Phase 2 motion) + phase + seed.
                var dx = Math.random() * 2 - 1;
                var dy = Math.random() * 2 - 1;
                var dz = Math.random() * 2 - 1;
                var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                aOffset.push(p.x, p.y, p.z);
                aScale.push(p.s);
                aColor.push(r, g, b);
                aGlyph.push(glyph);
                aDepth.push(depth01);
                aPhase.push(Math.random());
                aDir.push(dx / dl, dy / dl, dz / dl);
                aSeed.push(Math.random());
            }
        }

        var count = aScale.length;
        if (count === 0) { imageLoaded = true; return; }

        // Instanced billboard quad geometry built on a unit plane.
        var plane = new THREE.PlaneGeometry(1, 1);
        var geom = new THREE.InstancedBufferGeometry();
        geom.index = plane.index;
        geom.setAttribute('position', plane.attributes.position);
        geom.setAttribute('uv', plane.attributes.uv);
        geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(aOffset), 3));
        geom.setAttribute('aScale',  new THREE.InstancedBufferAttribute(new Float32Array(aScale), 1));
        geom.setAttribute('aColor',  new THREE.InstancedBufferAttribute(new Float32Array(aColor), 3));
        geom.setAttribute('aGlyph',  new THREE.InstancedBufferAttribute(new Float32Array(aGlyph), 1));
        geom.setAttribute('aDepth01', new THREE.InstancedBufferAttribute(new Float32Array(aDepth), 1));
        geom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(aPhase), 1));
        geom.setAttribute('aDir',    new THREE.InstancedBufferAttribute(new Float32Array(aDir), 3));
        geom.setAttribute('aSeed',   new THREE.InstancedBufferAttribute(new Float32Array(aSeed), 1));
        geom.instanceCount = count;

        // Avoid frustum-cull warnings; the cloud spans the camera axis anyway.
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

        mesh = new THREE.Mesh(geom, material);
        mesh.frustumCulled = false;
        scene.add(mesh);

        layoutPortrait();
        imageLoaded = true;

        if (reduceMotion) renderOnce();
    }

    /* ═══════════════════════════════════════════════════════════
       LAYOUT PORTRAIT — camera lens shift (off-axis frustum)
       The cloud MUST stay centred on the camera axis for the portrait to
       resolve crisp: any mesh offset or scale introduces depth-dependent
       parallax that smears the image (instances in a column no longer align).
       So the camera stays on the axis and we instead SHEAR the projection
       matrix — a lens shift — which offsets the whole framed view by a
       uniform, depth-independent amount.

       Composition: the contact block and the portrait SHARE the centre.
       The block is flex-centred (its natural centre sits at viewport 0.5),
       so we shift the whole pair left by (halfW − overlap/2) — exactly the
       amount that centres the combined footprint of block + cloud. The
       portrait's left edge then tucks a small overlap behind the block's
       right edge (the block "goes over" the cloud) right at the midline.
       ═══════════════════════════════════════════════════════════ */
    function layoutPortrait() {
        if (!camera) return;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var aspect = vh ? vw / vh : 1;

        var centerFrac = 0.5;   // desired portrait centre, screen-x (0=left … 1=right)
        var centerYFrac = 0.5;  // desired portrait centre, screen-y (0=top … 1=bottom)

        var block = document.querySelector('.contact-block--left');
        var rect = block ? block.getBoundingClientRect() : null;

        if (vw >= 1024 && rect) {
            var blockW = rect.width / vw;

            // Resolved on-screen half-width of the portrait (fraction of
            // viewport). visibleWorldHeight at the resolve plane is
            // 2 * TARGET_CAMERA_Z * tan(FOV/2); the visible world width is
            // that times the aspect ratio.
            var visibleH = 2 * TARGET_CAMERA_Z * Math.tan((FOV / 2) * Math.PI / 180);
            var portraitWFrac = portraitWorldW ? portraitWorldW / (visibleH * aspect) : 0.36;
            var halfW = portraitWFrac / 2;

            // Overlap: how far the block's right edge covers the cloud's left
            // edge (fraction of viewport).
            var overlap = 0.06;

            // Centre the GROUP (block + cloud). The block's natural centre is
            // at 0.5, so shifting the pair left by (halfW − overlap/2) puts the
            // midpoint of [block-left … cloud-right] exactly on the midline.
            var shiftFrac = halfW - overlap / 2;
            var blockRight = (0.5 + blockW / 2) - shiftFrac;

            // Park the portrait so its left edge sits `overlap` behind the
            // block's right edge.
            centerFrac = blockRight + halfW - overlap;
            // Keep the whole portrait on-screen.
            if (centerFrac + halfW > 0.985) centerFrac = 0.985 - halfW;
            if (centerFrac - halfW < 0.015) centerFrac = 0.015 + halfW;

            centerYFrac = (rect.top + rect.height / 2) / vh;

            // Shift the block left to centre the pair. `left` is safe here:
            // the entry animation drives transform/opacity (GSAP), never `left`.
            block.style.left = (-shiftFrac * vw) + 'px';
        } else if (block) {
            // Clear the desktop offset on mobile / when disabling the pair layout.
            block.style.left = '';
        }

        camera.updateProjectionMatrix();
        var e = camera.projectionMatrix.elements;
        e[8] = 1 - 2 * centerFrac;     // horizontal lens shift
        e[9] = 2 * centerYFrac - 1;    // vertical lens shift
    }

    /* ═══════════════════════════════════════════════════════════
       RESIZE
       ═══════════════════════════════════════════════════════════ */
    function onResize() {
        if (!renderer) return;
        var w = window.innerWidth;
        var h = window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        layoutPortrait();
        if (reduceMotion) renderOnce();
    }

    /* ═══════════════════════════════════════════════════════════
       SCROLL → CAMERA + VISIBILITY
       progress: 0 when contact is just entering from below,
                 1 once it is ~85% in view (resolved).
       ═══════════════════════════════════════════════════════════ */
    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    function onScroll() {
        layoutPortrait();

        var rect = contactSection.getBoundingClientRect();
        var vh = window.innerHeight;
        var enterTop = vh;
        var resolveTop = vh * 0.15;
        var p = (enterTop - rect.top) / (enterTop - resolveTop);
        if (p < 0) p = 0; else if (p > 1) p = 1;

        // Self-contained driver (active until main.js calls setProgress).
        if (!reduceMotion && !externalProgress) {
            targetZ = INIT_CAMERA_Z + (TARGET_CAMERA_Z - INIT_CAMERA_Z) * easeInOut(p);
            curProgress = p;
        }

        // Fade the cloud in as it assembles; fully visible once resolved.
        canvas.style.opacity = Math.min(1, p * 1.4);

        // Gate the render loop to when the cloud is actually on screen.
        if (p > 0.001) {
            if (!rafId) start();
        } else if (rafId) {
            stop();
        }
    }

    /* ═══════════════════════════════════════════════════════════
       RENDER LOOP
       ═══════════════════════════════════════════════════════════ */
    function start() {
        if (reduceMotion) { renderOnce(); return; }
        if (rafId) return;
        startTime = performance.now();
        var loop = function () {
            rafId = requestAnimationFrame(loop);
            if (!imageLoaded) return;

            camera.position.z += (targetZ - camera.position.z) * CAMERA_LERP;

            if (uni) {
                uni.uTime.value = (performance.now() - startTime) * 0.001;
                uni.uProgress.value += (curProgress - uni.uProgress.value) * 0.1;
                uni.uVelocity.value += (apiState.velocity - uni.uVelocity.value) * 0.1;
                uni.uInteractive.value += (apiState.interactive - uni.uInteractive.value) * 0.1;
                uni.uMouse.value.x += (apiState.mouseX - uni.uMouse.value.x) * 0.06;
                uni.uMouse.value.y += (apiState.mouseY - uni.uMouse.value.y) * 0.06;
            }

            renderer.render(scene, camera);
        };
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function renderOnce() {
        if (renderer && scene && camera && imageLoaded && uni) {
            camera.position.z = targetZ;
            uni.uTime.value = (performance.now() - startTime) * 0.001;
            uni.uProgress.value = curProgress;
            renderer.render(scene, camera);
        }
    }

    /* ═══════════════════════════════════════════════════════════
       PUBLIC API — lets main.js drive the cloud (mirrors window.bayerBg).
       Until main.js calls setProgress, the self-contained scroll path drives it.
       ═══════════════════════════════════════════════════════════ */
    window.contactCloud = {
        // Assembly progress 0..1. Once called, overrides the scroll-driven path.
        setProgress: function (p) {
            p = clamp01(p);
            externalProgress = true;
            curProgress = p;
            targetZ = INIT_CAMERA_Z + (TARGET_CAMERA_Z - INIT_CAMERA_Z) * easeInOut(p);
        },
        // Scroll velocity 0..1 for reactive blow-apart (Phase 2).
        setVelocity: function (v) {
            apiState.velocity = clamp01(Math.abs(v));
        },
        // Interactive boost 0..1 (e.g. link hover) (Phase 3).
        setInteractive: function (x) {
            apiState.interactive = clamp01(x);
        },
        // Pointer position 0..1 each axis (Phase 2/3 parallax + proximity).
        setMouse: function (x, y) {
            apiState.mouseX = clamp01(x);
            apiState.mouseY = clamp01(y);
        },
        isReady: function () {
            return !!(renderer && scene && imageLoaded);
        }
    };

    /* ═══════════════════════════════════════════════════════════
       BOOTSTRAP — init when the contact section is approached
       ═══════════════════════════════════════════════════════════ */
    if ('IntersectionObserver' in window) {
        var early = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    early.disconnect();
                    loadThree(init);
                }
            });
        }, { rootMargin: EARLY_MARGIN });
        early.observe(contactSection);
    } else {
        loadThree(init);
    }

    console.log('[contact-cloud] ASCII point-cloud portrait ready');
})();
