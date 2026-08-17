/**
 * Contact Section — 3D ASCII Point-Cloud Portrait  (raw WebGL2, zero deps)
 *
 * Renders the profile picture (assets/profile_pic.webp, falling back to
 * assets/profile_pic.png) as a cloud of camera-facing ASCII glyphs at the
 * resolve plane. When the contact section becomes framed in the viewport,
 * a one-shot "Bayer ink reveal" animation grows each glyph in Bayer-threshold
 * order — ink saturating a dithered print — until the portrait resolves
 * fully. The camera is pinned at the resolve plane for the whole reveal (no
 * scroll-driven dolly, no scroll-driven progress).
 *
 * Design notes:
 *  – Hand-rolled WebGL2 (zero dependencies): one VAO with a unit quad +
 *    per-instance attributes via native vertexAttribDivisor, a ~15-line mat4
 *    perspective helper, and a glyph-atlas canvas uploaded via texImage2D
 *    with NEAREST filtering. The GLSL is the original shader with the former
 *    library built-ins renamed (position/uv → aPosition/aUV, modelViewMatrix/
 *    projectionMatrix → uModelView/uProjection).
 *  – The image is sampled into an offscreen canvas; only OPAQUE pixels
 *    become instances, so the transparent background of the PNG stays empty.
 *  – Success contract: once the canvas has drawn its first presented frame,
 *    `is-ready` is added to the closest `.contact-portrait` frame (CSS hides
 *    the prerendered fallback <img>). On ANY failure — Save-Data, no WebGL2,
 *    shader compile/link error, image decode failure, exception, or WebGL
 *    context loss — is-ready is not added (or is removed), the loop stops
 *    and the canvas is removed, so the fallback photo stays/becomes visible.
 *  – The reveal tween advances by real frame delta-time, so scrolling away
 *    mid-reveal pauses it cleanly and scrolling back resumes exactly where
 *    it left off. Rendering is gated to the contact viewport.
 *  – Respects prefers-reduced-motion (renders the resolved portrait
 *    statically the moment the section is reached) and prefers-reduced-data /
 *    navigator.connection.saveData (skips all heavy work).
 *  – window.contactCloud exposes setVelocity/setInteractive/setMouse for
 *    optional reactive (non-reveal) effects driven by main.js.
 */
(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       CONFIGURATION
       ═══════════════════════════════════════════════════════════ */
    var IMG_URL          = 'assets/profile_pic.webp';
    var IMG_FALLBACK_URL = 'assets/profile_pic.png';   // retried when the WebP is missing/undecodable

    var GRID_ROWS        = window.matchMedia('(max-width: 600px)').matches ? 84 : 160; // sampling resolution (image height); reduced on narrow viewports where the smaller frame would map each glyph to <1px
    var INSTANCE_SIZE    = 1;                          // grid cell size in world units
    var FOV              = 75;
    var NEAR             = 0.5;
    var FAR              = 1000;
    var TARGET_CAMERA_Z  = 180;                        // camera z at the resolve plane (also sizes it)
    var RAND_RANGE_Z     = 2 * TARGET_CAMERA_Z * 0.2;  // depth spread of the instances
    var ALPHA_THRESHOLD  = 20;                         // discard pixels below this alpha
    var EARLY_MARGIN     = '400px 0px 400px 0px';      // pre-init before contact reaches viewport
    var REVEAL_DURATION  = 1500;                       // ms — one-shot ink-reveal tween
    var TRIGGER_TOLERANCE = 0.95;                      // "fully in view" leniency (0..1)

    /* ── ASCII / look tuning ──────────────────────────────────── */
    var RAMP            = '.:-=+*#%@█';  // sparse -> dense; solid block = darkest ink
    var ATLAS_CELL      = 64;
    var ATLAS_FONT_RATIO = 1.0;           // glyph ink fill within its atlas cell
    var GLYPH_WORLD     = 1.3;            // quad scale (bigger, slightly overlapping glyphs)
    var BAYER_MIN_GATE  = 1.0;            // A3 thinning disabled (was too sparse)
    var BAYER_MAX_GATE  = 1.0;
    var FADE_NEAR       = 0.8;            // gentler depth fade — only farthest fade
    var FADE_FAR        = 1.0;

    // ASCII color contrast (lifts a dark subject into visibility). Applied in
    // the fragment shader after the atlas alpha: gamma lifts shadows, contrast
    // steepens midtones, brightness is a global offset.
    var ASCII_GAMMA      = 0.6;
    var ASCII_CONTRAST   = 2;
    var ASCII_BRIGHTNESS = 0.08;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var contactSection = document.getElementById('contact');
    if (!contactSection) return;

    /* Save-Data gate: the cloud is decorative; on metered connections keep
       the prerendered fallback <img> visible and skip every byte/GPU of work. */
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if ((window.matchMedia && window.matchMedia('(prefers-reduced-data: reduce)').matches) ||
        (conn && conn.saveData)) {
        console.log('[contact-cloud] skipped — reduced data');
        return;
    }

    /* ═══════════════════════════════════════════════════════════
       CANVAS — mounted inside the .contact-portrait frame at init time
       (see mountCanvas) so it tracks the frame 1:1 on every viewport.
       ═══════════════════════════════════════════════════════════ */
    var canvas = document.createElement('canvas');
    canvas.id = 'contact-cloud';
    canvas.setAttribute('aria-hidden', 'true');

    /* ═══════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════ */
    var gl = null, prog = null, vao = null, atlasTex = null;
    var atlasCanvas = null;        // kept so a restored context can re-upload it
    var instanceData = null;       // per-instance typed arrays — kept for restore
    var glBuffers = [];            // every buffer we created (freed on rebuild/destroy)
    var loc = {};                  // uniform locations (null = compiled out, safe)
    var attr = {};                 // attrib locations (-1 = compiled out, skipped)
    var projMatrix = new Float32Array(16);
    // Model–view is constant: the camera sits at (0,0,TARGET_CAMERA_Z) looking
    // down −Z at the origin (column-major translate).
    var mvMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -TARGET_CAMERA_Z, 1]);

    var inited = false;
    var imageLoaded = false;
    var contextLost = false;
    var shown = false;             // canvas currently presented at opacity 1
    var readyNotified = false;     // is-ready added after first drawn frame
    var portraitWorldW = 0;        // resolved portrait width in world units
    var camZoom = 1, camAspect = 2;
    var rafId = null;
    var scrollRaf = 0;
    var startTime = performance.now();
    var lastFrameTime = startTime;

    // Reveal state: linearProgress advances by real frame dt (so it pauses
    // cleanly when the render loop is gated off-screen), and curProgress is
    // the easeInOut-shaped value the shader actually consumes.
    var linearProgress = 0;
    var curProgress = 0;
    var revealStarted = false;
    var apiState = { velocity: 0, interactive: 0, mouseX: 0.5, mouseY: 0.5 };
    var uni = { uProgress: 0, uTime: 0, uVelocity: 0, uInteractive: 0, uMouseX: 0.5, uMouseY: 0.5 };

    /* ═══════════════════════════════════════════════════════════
       PERSPECTIVE HELPERS
       Places an instance at depth `targetZ` so that, viewed from camera
       z = d, it projects to the correct on-screen position with correct size.
       ═══════════════════════════════════════════════════════════ */
    function project(x, y, targetZ) {
        var h = 0.5;
        var d = TARGET_CAMERA_Z;
        var D = -targetZ + d;
        var H = h / d * D;
        var s = H / h;
        return { s: s, x: x * s, y: y * s, z: targetZ };
    }

    // Column-major perspective matrix; `zoom` shrinks the visible height
    // exactly like a classic perspective-camera zoom (f *= zoom).
    function perspective(out, fovDeg, aspect, near, far, zoom) {
        var f = (zoom || 1) / Math.tan(fovDeg * Math.PI / 360);
        var nf = 1 / (near - far);
        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    }

    /* ═══════════════════════════════════════════════════════════
       COLOR / DITHER HELPERS
       ═══════════════════════════════════════════════════════════ */
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
    function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    /* ═══════════════════════════════════════════════════════════
       SHADERS — Bayer ink reveal (the only entrance transformation).
       Same GLSL as the previous (library) version, ported to GLSL ES 3.0
       with the built-ins renamed to our own attributes/uniforms.
       ═══════════════════════════════════════════════════════════ */
    var VERT_SRC = [
        '#version 300 es',
        'precision highp float;',
        '',
        'in vec2 aPosition;   // unit-quad corner offset',
        'in vec2 aUV;',
        '',
        'uniform mat4 uModelView;',
        'uniform mat4 uProjection;',
        '',
        '// Per-instance attributes',
        'in vec3  aOffset;',
        'in float aScale;',
        'in vec3  aColor;',
        'in float aGlyph;',
        'in float aDepth01;',
        'in float aPhase;',
        'in vec3  aDir;',
        'in float aSeed;',
        'in float aBayer01;',
        '',
        'uniform float uGlyphSize;',
        'uniform float uRampCount;',
        'uniform float uProgress;   // 0 hidden .. 1 fully revealed',
        'uniform float uTime;',
        'uniform vec2  uMouse;',
        'uniform float uVelocity;',
        'uniform float uInteractive;',
        '',
        'out vec2  vGlyphUV;',
        'out vec3  vColor;',
        'out float vDepth;',
        '',
        'void main() {',
        '    vec3  wpos = aOffset;',
        '    float ws   = aScale;',
        '',
        '    // Bayer ink bleed: each glyph scales in over a narrow ±0.03 window',
        '    // centred on its Bayer threshold (ink saturating a dithered print).',
        '    ws *= smoothstep(aBayer01 - 0.03, aBayer01 + 0.03, uProgress);',
        '',
        '    // Billboard: anchor the quad at the instance offset in view space,',
        '    // then add the corner in the camera plane so it always faces camera.',
        '    vec4 mv = uModelView * vec4(wpos, 1.0);',
        '    mv.xy += aPosition * ws * uGlyphSize;',
        '',
        '    vColor = aColor;',
        '    vDepth = aDepth01;',
        '',
        '    float cellW = 1.0 / uRampCount;',
        '    vGlyphUV = vec2((aUV.x + aGlyph) * cellW, aUV.y);',
        '',
        '    gl_Position = uProjection * mv;',
        '}'
    ].join('\n');

    var FRAG_SRC = [
        '#version 300 es',
        'precision highp float;',
        '',
        'uniform sampler2D uAtlas;',
        'uniform float uFadeNear;',
        'uniform float uFadeFar;',
        'uniform float uGamma;',
        'uniform float uContrast;',
        'uniform float uBrightness;',
        '',
        'in vec2  vGlyphUV;',
        'in vec3  vColor;',
        'in float vDepth;',
        '',
        'out vec4 fragColor;',
        '',
        'void main() {',
        '    float glyphA = texture(uAtlas, vGlyphUV).a;',
        '    if (glyphA < 0.02) discard;',
        '',
        '    // Depth atmosphere: near instances opaque, far ones fade out (alpha only).',
        '    float d = clamp(vDepth, 0.0, 1.0);',
        '    float depthFade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);',
        '',
        '    // Contrast curve: gamma lifts shadows, contrast steepens, brightness offsets.',
        '    vec3 c = pow(clamp(vColor, 0.0, 1.0), vec3(uGamma));',
        '    c = (c - 0.5) * uContrast + 0.5 + uBrightness;',
        '    fragColor = vec4(clamp(c, 0.0, 1.0), glyphA * depthFade);',
        '}'
    ].join('\n');

    /* ═══════════════════════════════════════════════════════════
       GL OBJECTS — every builder is re-runnable so a restored WebGL
       context can rebuild the program/texture/VAO from the kept data.
       ═══════════════════════════════════════════════════════════ */
    function compileShader(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[contact-cloud] shader compile error:', gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function buildProgram() {
        var vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
        var fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
        if (!vs || !fs) return false;
        if (prog) gl.deleteProgram(prog);
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('[contact-cloud] program link error:', gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            prog = null;
            return false;
        }
        ['uModelView', 'uProjection', 'uGlyphSize', 'uRampCount', 'uProgress',
         'uTime', 'uMouse', 'uVelocity', 'uInteractive', 'uAtlas',
         'uFadeNear', 'uFadeFar', 'uGamma', 'uContrast', 'uBrightness'
        ].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
        ['aPosition', 'aUV', 'aOffset', 'aScale', 'aColor', 'aGlyph', 'aDepth01',
         'aPhase', 'aDir', 'aSeed', 'aBayer01'
        ].forEach(function (n) { attr[n] = gl.getAttribLocation(prog, n); });
        return true;
    }

    function uploadAtlasTexture() {
        if (!atlasCanvas) return;
        if (atlasTex) gl.deleteTexture(atlasTex);
        atlasTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        // FLIP_Y keeps the canvas' top-left origin mapping upright on the
        // quad, so asymmetric glyphs ('.', '%', …) aren't vertically flipped.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);  // crisp ditherpunk edges
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);  // no mipmaps → no cell bleed
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // Unit quad (corner offsets + uv), standard indexed-plane triangulation.
    var QUAD_POS = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
    var QUAD_UV  = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    var QUAD_IDX = new Uint16Array([0, 2, 1, 2, 3, 1]);

    function buildInstanceBuffers() {
        if (!instanceData || !prog) return;
        if (vao) gl.deleteVertexArray(vao);
        glBuffers.forEach(function (b) { gl.deleteBuffer(b); });
        glBuffers = [];
        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        function attrib(name, data, size, divisor) {
            var a = attr[name];
            if (a === undefined || a < 0) return;  // compiled out by the driver — skip
            var buf = gl.createBuffer();
            glBuffers.push(buf);
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, size, gl.FLOAT, false, 0, 0);
            if (divisor) gl.vertexAttribDivisor(a, divisor);
        }

        attrib('aPosition', QUAD_POS, 2, 0);
        attrib('aUV', QUAD_UV, 2, 0);
        attrib('aOffset', instanceData.aOffset, 3, 1);
        attrib('aScale', instanceData.aScale, 1, 1);
        attrib('aColor', instanceData.aColor, 3, 1);
        attrib('aGlyph', instanceData.aGlyph, 1, 1);
        attrib('aDepth01', instanceData.aDepth01, 1, 1);
        attrib('aPhase', instanceData.aPhase, 1, 1);
        attrib('aDir', instanceData.aDir, 3, 1);
        attrib('aSeed', instanceData.aSeed, 1, 1);
        attrib('aBayer01', instanceData.aBayer01, 1, 1);

        var ib = gl.createBuffer();
        glBuffers.push(ib);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, QUAD_IDX, gl.STATIC_DRAW);
        gl.bindVertexArray(null);
    }

    function initGLState() {
        gl.useProgram(prog);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false);          // transparent billboards: depth never written
        gl.disable(gl.CULL_FACE);
        gl.uniform1f(loc.uRampCount, RAMP.length);
        gl.uniform1f(loc.uGlyphSize, GLYPH_WORLD);
        gl.uniform1f(loc.uFadeNear, FADE_NEAR);
        gl.uniform1f(loc.uFadeFar, FADE_FAR);
        gl.uniform1f(loc.uGamma, ASCII_GAMMA);
        gl.uniform1f(loc.uContrast, ASCII_CONTRAST);
        gl.uniform1f(loc.uBrightness, ASCII_BRIGHTNESS);
        gl.uniform1i(loc.uAtlas, 0);
    }

    /* ═══════════════════════════════════════════════════════════
       READY / FAILURE CONTRACT
       is-ready on the closest .contact-portrait hides the fallback <img>.
       Any failure removes it, stops the loop and the canvas entirely.
       ═══════════════════════════════════════════════════════════ */
    function setReady(on) {
        var frame = (canvas.closest && canvas.closest('.contact-portrait')) ||
                    document.querySelector('#contactHead .contact-portrait');
        if (!frame) return;
        if (on) { frame.classList.add('is-ready'); readyNotified = true; }
        else { frame.classList.remove('is-ready'); }
    }

    function destroy() {
        stop();
        if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
        setReady(false);
        readyNotified = false;
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll);
        if (gl) {
            glBuffers.forEach(function (b) { gl.deleteBuffer(b); });
            glBuffers = [];
            if (vao) gl.deleteVertexArray(vao);
            if (atlasTex) gl.deleteTexture(atlasTex);
            if (prog) gl.deleteProgram(prog);
        }
        vao = null; atlasTex = null; prog = null; gl = null;
        instanceData = null;
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    function fail(msg) {
        console.warn('[contact-cloud] ' + msg + ' — disabled, fallback photo remains');
        try { destroy(); } catch (e) { /* already torn down */ }
    }

    function canDraw() {
        return !!(gl && prog && vao && instanceData && imageLoaded && !contextLost);
    }

    /* ═══════════════════════════════════════════════════════════
       GLYPH ATLAS — render the luminance ramp in Space Mono into a
       horizontal canvas strip. Stored as an alpha mask (solid white glyphs
       on transparent ground); per-instance COLOR comes from the photo.
       ═══════════════════════════════════════════════════════════ */
    function buildAtlas(cb) {
        var draw = function () {
            try {
                var n = RAMP.length;
                var can = document.createElement('canvas');
                can.width = ATLAS_CELL * n;
                can.height = ATLAS_CELL;
                var ctx = can.getContext('2d');
                if (!ctx) { fail('atlas 2D context unavailable'); return; }
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '700 ' + Math.floor(ATLAS_CELL * ATLAS_FONT_RATIO) + 'px "Space Mono", monospace';
                for (var i = 0; i < n; i++) {
                    ctx.fillText(RAMP.charAt(i), i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2);
                }
                atlasCanvas = can;
                cb();
            } catch (e) {
                fail('atlas build failed: ' + e.message);
            }
        };
        if (document.fonts && document.fonts.load) {
            document.fonts.load('700 ' + Math.floor(ATLAS_CELL * ATLAS_FONT_RATIO) + 'px "Space Mono"').then(draw, draw);
        } else {
            draw();
        }
    }

    /* ═══════════════════════════════════════════════════════════
       INITIALIZATION
       ═══════════════════════════════════════════════════════════ */
    function init() {
        if (inited) return;
        inited = true;

        try {
            gl = canvas.getContext('webgl2', {
                alpha: true, antialias: false, depth: true,
                stencil: false, premultipliedAlpha: false
            });
            if (!gl) { fail('WebGL2 unavailable'); return; }

            canvas.addEventListener('webglcontextlost', onContextLost, false);
            canvas.addEventListener('webglcontextrestored', onContextRestored, false);
            window.addEventListener('resize', onResize, { passive: true });
            window.addEventListener('scroll', onScroll, { passive: true });

            // Mount the canvas into the portrait frame before any sizing happens.
            mountCanvas();
            onResize();
            onScroll();
            attachTrigger();

            // Atlas first (needs the font), then GL objects, then the image.
            buildAtlas(function () {
                if (!gl || !atlasCanvas) return;   // destroyed while fonts loaded
                if (!buildProgram()) { fail('shader compilation failed'); return; }
                uploadAtlasTexture();
                initGLState();
                onResize();
                loadImage();
            });
        } catch (e) {
            fail('init failed: ' + e.message);
        }
    }

    // Prefer the smaller WebP; on failure retry the original PNG before
    // surfacing an error, so broken WebP support only costs bytes.
    function loadImage() {
        var triedFallback = false;
        var img = new Image();
        img.onload = function () {
            try { buildMesh(img); }
            catch (e) { fail('mesh build failed: ' + e.message); }
        };
        img.onerror = function () {
            if (triedFallback) { fail('profile image failed to load'); return; }
            triedFallback = true;
            img.src = IMG_FALLBACK_URL;
        };
        img.src = IMG_URL;
    }

    /* ═══════════════════════════════════════════════════════════
       BUILD INSTANCED BILLBOARDS FROM IMAGE
       Only opaque pixels become instances; the Bayer gate thins survivors;
       each becomes a camera-facing ASCII glyph carrying its original color.
       ═══════════════════════════════════════════════════════════ */
    function buildMesh(img) {
        var imgW = img.naturalWidth || img.width;
        var imgH = img.naturalHeight || img.height;
        if (!imgW || !imgH) { fail('profile image undecodable'); return; }

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

        var aOffset = [];   // x,y,z triples
        var aScale = [];
        var aColor = [];    // r,g,b triples
        var aGlyph = [];
        var aDepth = [];
        var aPhase = [];
        var aDir = [];      // dx,dy,dz triples
        var aSeed = [];
        var aBayer = [];    // bayer threshold 0..1 (reveal order)

        for (var i = 0; i < nRow; i++) {
            for (var j = 0; j < nCol; j++) {
                var idx = (i * nCol + j) * 4;
                if (data[idx + 3] <= ALPHA_THRESHOLD) continue;

                var r = data[idx] / 255;
                var g = data[idx + 1] / 255;
                var b = data[idx + 2] / 255;
                var L = luminance01(r, g, b);

                // Bayer occupancy gate (min==max here: thinning disabled).
                var gate = BAYER_MIN_GATE + (BAYER_MAX_GATE - BAYER_MIN_GATE) * L;
                var bayer = bayerThreshold(j, i);
                if (bayer > gate) continue;

                var z = (Math.random() - 0.5) * RAND_RANGE_Z * sz;
                var p = project(
                    (j - nCol / 2 + 0.5) * sz,
                    (nRow / 2 - i + 0.5) * sz,   // flip: image row 0 = top
                    z
                );

                // depth01: 0 nearest the camera, 1 farthest (relative to spread).
                var depth01 = 0.5 - z / spreadZ;

                // Glyph chosen by luminance, INVERTED so dark areas get the
                // densest glyphs (classic ASCII); color stays the photo RGB.
                var glyph = Math.floor((1.0 - L) * rampLen);
                if (glyph > rampLen - 1) glyph = rampLen - 1;
                if (glyph < 0) glyph = 0;

                // Random unit direction (optional motion) + phase + seed.
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
                aBayer.push(bayer);
            }
        }

        var count = aScale.length;
        if (count === 0) { fail('no glyph instances extracted'); return; }

        instanceData = {
            count: count,
            aOffset: new Float32Array(aOffset),
            aScale: new Float32Array(aScale),
            aColor: new Float32Array(aColor),
            aGlyph: new Float32Array(aGlyph),
            aDepth01: new Float32Array(aDepth),
            aPhase: new Float32Array(aPhase),
            aDir: new Float32Array(aDir),
            aSeed: new Float32Array(aSeed),
            aBayer01: new Float32Array(aBayer)
        };

        buildInstanceBuffers();
        layoutPortrait();
        imageLoaded = true;

        // Re-evaluate visibility now that there's something to draw (matters
        // for the reduced-motion static frame and for landing on #contact).
        updateVisibility();
    }

    /* ═══════════════════════════════════════════════════════════
       WEBGL CONTEXT LOSS
       Lost → stop loop + drop is-ready (fallback photo returns).
       Restored → rebuild every GL object, resume, re-add is-ready.
       ═══════════════════════════════════════════════════════════ */
    function onContextLost(e) {
        e.preventDefault();   // allows webglcontextrestored to fire
        contextLost = true;
        stop();
        setReady(false);
        readyNotified = false;
    }

    function onContextRestored() {
        if (!gl) return;      // destroyed outright — nothing to restore into
        contextLost = false;
        try {
            if (!buildProgram()) { fail('context restore: shader rebuild failed'); return; }
            uploadAtlasTexture();
            initGLState();
            buildInstanceBuffers();
            onResize();       // re-sets viewport + projection uniforms
        } catch (e) {
            fail('context restore failed: ' + e.message);
            return;
        }
        if (imageLoaded) { setReady(true); }
        updateVisibility();   // resume the loop / repaint the static frame
    }

    /* ═══════════════════════════════════════════════════════════
       LAYOUT — canvas mounted in the frame, camera zoom covers it
       ═══════════════════════════════════════════════════════════ */
    function mountCanvas() {
        var frame = document.querySelector('#contactHead .contact-portrait');
        if (frame && canvas.parentNode !== frame) frame.appendChild(canvas);
        return frame;
    }

    function layoutPortrait() {
        if (!gl) return;
        var frame = mountCanvas();
        var fw = canvas.clientWidth || (frame && frame.clientWidth) || window.innerWidth;
        var fh = canvas.clientHeight || (frame && frame.clientHeight) || window.innerHeight;

        // Cover the frame via camera zoom (no mesh scaling -> resolve stays
        // crisp). Zoom shrinks the visible world height linearly, so making a
        // world span W fill the frame needs zoom = visH/W (height) and
        // zoom = visH*aspect/W (width); the max covers the frame.
        var portraitWorldH = GRID_ROWS * INSTANCE_SIZE;
        var pw = portraitWorldW || portraitWorldH;
        var visH = 2 * TARGET_CAMERA_Z * Math.tan((FOV / 2) * Math.PI / 180);
        camAspect = (fw / fh) || 1;
        camZoom = Math.max(visH / portraitWorldH, (visH * camAspect) / pw);
        perspective(projMatrix, FOV, camAspect, NEAR, FAR, camZoom);
        // No lens shift: the projection stays centred on-axis -> crisp,
        // depth-aligned resolve (any offset/scale would smear parallax).
    }

    /* ═══════════════════════════════════════════════════════════
       RESIZE
       ═══════════════════════════════════════════════════════════ */
    function onResize() {
        if (!gl) return;
        mountCanvas();
        // Size the drawing buffer to the canvas (the frame), not the window:
        // the canvas is the render target and must match the frame 1:1.
        var w = canvas.clientWidth || window.innerWidth;
        var h = canvas.clientHeight || window.innerHeight;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
        layoutPortrait();   // sets aspect + zoom + projection
        if (reduceMotion) updateVisibility();
    }

    /* ═══════════════════════════════════════════════════════════
       SCROLL → LAYOUT + RENDER GATING
       No progress is derived from scroll — the reveal is a one-shot
       IntersectionObserver-triggered tween. Scroll only gates the render
       loop to the contact viewport; work is batched into a single rAF.
       ═══════════════════════════════════════════════════════════ */
    function onScroll() {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(function () {
            scrollRaf = 0;
            layoutPortrait();
            updateVisibility();
        });
    }

    function contactIsInView() {
        var rect = contactSection.getBoundingClientRect();
        var vh = window.innerHeight;
        return rect.bottom > 0 && rect.top < vh;
    }

    function updateVisibility() {
        if (!gl) return;
        var inView = contactIsInView();
        if (reduceMotion) {
            // Static resolved frame: shown only while contact is on-screen.
            shown = !!(inView && imageLoaded);
            canvas.style.opacity = shown ? '1' : '0';
            if (shown) renderOnce();
            return;
        }
        if (inView) {
            if (!rafId) start();
            // The cloud becomes visible only once the reveal has begun (or
            // completed); before that the canvas stays at its CSS opacity:0
            // so the empty resolve plane never flashes over upper sections.
            if (revealStarted) { shown = true; canvas.style.opacity = '1'; }
        } else {
            if (rafId) stop();
            // Hide the canvas the moment contact leaves the viewport so the
            // last rendered frame doesn't bleed through over upper sections.
            shown = false;
            canvas.style.opacity = '0';
        }
    }

    /* ═══════════════════════════════════════════════════════════
       REVEAL TRIGGER — one-shot when the portrait frame is in view.
       The portrait lives in the small .contact-portrait frame, so we watch
       THAT element (a tall mobile section can never "fill the viewport"
       reliably). Falls back to the section + adaptive threshold.
       ═══════════════════════════════════════════════════════════ */
    function computeTriggerThreshold() {
        var sh = contactSection.offsetHeight || window.innerHeight;
        var vh = window.innerHeight || 1;
        var target = sh <= vh ? TRIGGER_TOLERANCE : (vh / sh) * TRIGGER_TOLERANCE;
        return Math.max(0.5, Math.min(TRIGGER_TOLERANCE, target));
    }

    function attachTrigger() {
        if (reduceMotion) {
            // Reduced-motion: no reveal tween — updateVisibility (called from
            // scroll/resize/buildMesh) renders the resolved static portrait.
            return;
        }

        var frame = document.querySelector('#contactHead .contact-portrait');
        var target = frame || contactSection;
        var threshold = frame ? 0.4 : computeTriggerThreshold();

        if (!('IntersectionObserver' in window)) {
            startReveal();
            return;
        }

        var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting && !revealStarted) {
                    startReveal();
                    obs.disconnect();
                }
            });
        }, { threshold: threshold });
        obs.observe(target);

        // Safety net: if the target is already past the threshold on init,
        // the observer may not re-fire — kick the reveal off manually.
        if (!revealStarted) {
            var rect = target.getBoundingClientRect();
            var vh = window.innerHeight;
            var visibleTop = Math.max(0, rect.top);
            var visibleBottom = Math.min(vh, rect.bottom);
            var visibleH = Math.max(0, visibleBottom - visibleTop);
            if (rect.height > 0 && (visibleH / rect.height) >= threshold) {
                startReveal();
                obs.disconnect();
            }
        }
    }

    function startReveal() {
        if (revealStarted) return;
        revealStarted = true;
        shown = true;
        canvas.style.opacity = '1';
        if (!rafId) start();
    }

    /* ═══════════════════════════════════════════════════════════
       RENDER LOOP
       ═══════════════════════════════════════════════════════════ */
    function start() {
        if (!gl) return;
        if (reduceMotion) { renderOnce(); return; }
        if (rafId) return;
        startTime = performance.now();
        lastFrameTime = startTime;
        var loop = function () {
            rafId = requestAnimationFrame(loop);
            if (!canDraw()) return;

            var now = performance.now();
            var dt = now - lastFrameTime;
            lastFrameTime = now;

            // Advance the reveal by real elapsed frame time (not wall clock),
            // so pausing the loop off-screen freezes progress instead of
            // letting it skip ahead on resume.
            if (revealStarted && linearProgress < 1) {
                linearProgress = clamp01(linearProgress + dt / REVEAL_DURATION);
                curProgress = easeInOut(linearProgress);
            }

            uni.uTime = (now - startTime) * 0.001;
            uni.uProgress += (curProgress - uni.uProgress) * 0.18;
            uni.uVelocity += (apiState.velocity - uni.uVelocity) * 0.1;
            uni.uInteractive += (apiState.interactive - uni.uInteractive) * 0.1;
            uni.uMouseX += (apiState.mouseX - uni.uMouseX) * 0.06;
            uni.uMouseY += (apiState.mouseY - uni.uMouseY) * 0.06;

            layoutPortrait();
            drawScene();
        };
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function drawScene() {
        if (!canDraw()) return;
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);   // depth never written → stays at 1.0
        gl.uniformMatrix4fv(loc.uProjection, false, projMatrix);
        gl.uniformMatrix4fv(loc.uModelView, false, mvMatrix);
        gl.uniform1f(loc.uProgress, uni.uProgress);
        gl.uniform1f(loc.uTime, uni.uTime);
        gl.uniform1f(loc.uVelocity, uni.uVelocity);
        gl.uniform1f(loc.uInteractive, uni.uInteractive);
        gl.uniform2f(loc.uMouse, uni.uMouseX, uni.uMouseY);
        gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, instanceData.count);
        gl.bindVertexArray(null);
        // Success contract: first drawn AND presented frame → hide the
        // fallback photo via .is-ready on the portrait frame.
        if (shown && !readyNotified) setReady(true);
    }

    function renderOnce() {
        if (!canDraw()) return;
        uni.uTime = (performance.now() - startTime) * 0.001;
        uni.uProgress = 1;   // reduced-motion always shows the resolved portrait
        layoutPortrait();
        drawScene();
    }

    /* ═══════════════════════════════════════════════════════════
       PUBLIC API — optional reactive (non-reveal) inputs for main.js.
       ═══════════════════════════════════════════════════════════ */
    window.contactCloud = {
        // Scroll velocity 0..1 for reactive blow-apart (optional).
        setVelocity: function (v) {
            apiState.velocity = clamp01(Math.abs(v));
        },
        // Interactive boost 0..1 (e.g. link hover) (optional).
        setInteractive: function (x) {
            apiState.interactive = clamp01(x);
        },
        // Pointer position 0..1 each axis (optional parallax + proximity).
        setMouse: function (x, y) {
            apiState.mouseX = clamp01(x);
            apiState.mouseY = clamp01(y);
        },
        isReady: function () {
            return !!(gl && prog && imageLoaded);
        }
    };

    /* ═══════════════════════════════════════════════════════════
       BOOTSTRAP — init when the contact section is approached.
       ═══════════════════════════════════════════════════════════ */
    if ('IntersectionObserver' in window) {
        var early = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    early.disconnect();
                    init();
                }
            });
        }, { rootMargin: EARLY_MARGIN });
        early.observe(contactSection);
    } else {
        init();
    }

    console.log('[contact-cloud] ASCII point-cloud portrait ready (raw WebGL2)');
})();
