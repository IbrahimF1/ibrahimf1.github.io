/**
 * Contact Section — 3D Point-Cloud Portrait
 *
 * Renders assets/profile_pic.png (transparent) as a cloud of instanced boxes
 * scattered along the camera axis. As the user scrolls into the contact section
 * the camera retreats out of the cloud and the portrait resolves into a crisp
 * image — a scroll-driven "assembly" effect behind the contact panel.
 *
 * Design notes:
 *  – Adapted from the classic three.js instanced-image technique. The image is
 *    sampled into an offscreen canvas; only OPAQUE pixels become boxes, so the
 *    transparent background of the PNG stays empty (the site dither shows
 *    through behind the silhouette).
 *  – The whole-page scroll mapping of the original is rebound to the contact
 *    section's own scroll progress (the finale of the page).
 *  – Three.js is lazy-loaded from a CDN only when the contact section is
 *    approached, so users who never reach contact pay no cost.
 *  – Rendering is gated to the contact viewport and paused otherwise.
 *  – Respects prefers-reduced-motion (renders the resolved portrait statically).
 */
(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       CONFIGURATION
       ═══════════════════════════════════════════════════════════ */
    var IMG_URL         = 'assets/profile_pic.png';
    var THREE_CDN       = 'https://cdn.jsdelivr.net/npm/three@0.130.0/build/three.min.js';

    var GRID_ROWS       = 256;                       // sampling resolution (image height)
    var INSTANCE_SIZE   = 1;                          // box edge length in world units
    var FOV             = 75;
    var TARGET_CAMERA_Z = 240;                        // camera z at which the image resolves (also sizes it)
    var INIT_CAMERA_Z   = TARGET_CAMERA_Z / 5;        // camera z while inside the cloud
    var RAND_RANGE_Z    = 2 * TARGET_CAMERA_Z * 0.99; // depth spread of the boxes
    var ALPHA_THRESHOLD = 20;                         // discard pixels below this alpha
    var CAMERA_LERP     = 0.08;                       // smoothing for scroll-driven camera
    var EARLY_MARGIN    = '300px 0px 300px 0px';      // pre-load when contact is near

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

    var renderer, scene, camera, mesh;
    var lastImgAspect = 1;
    var inited = false;
    var imageLoaded = false;
    var rafId = null;
    var targetZ = reduceMotion ? TARGET_CAMERA_Z : INIT_CAMERA_Z;

    /* ═══════════════════════════════════════════════════════════
       PERSPECTIVE HELPER
       Places a box at depth `targetZ` so that, viewed from camera z = d,
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

        var img = new Image();
        img.onload = function () { buildMesh(img); };
        img.onerror = function () { console.warn('[contact-cloud] profile image failed to load'); };
        img.src = IMG_URL;

        window.addEventListener('resize', onResize, { passive: true });
        onResize();

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ═══════════════════════════════════════════════════════════
       BUILD INSTANCED MESH FROM IMAGE
       Only opaque pixels become instances; transparent areas are skipped.
       ═══════════════════════════════════════════════════════════ */
    function buildMesh(img) {
        var imgW = img.naturalWidth || img.width;
        var imgH = img.naturalHeight || img.height;
        if (!imgW || !imgH) { imageLoaded = true; return; }

        var imgAspect = imgW / imgH;
        lastImgAspect = imgAspect;

        var nRow = GRID_ROWS;
        var nCol = Math.max(1, Math.round(nRow * imgAspect));

        // Sample the image down to the grid resolution.
        var can = document.createElement('canvas');
        can.width = nCol;
        can.height = nRow;
        var ctx = can.getContext('2d');
        ctx.drawImage(img, 0, 0, imgW, imgH, 0, 0, nCol, nRow);
        var data = ctx.getImageData(0, 0, nCol, nRow).data;

        // Collect opaque pixels with their target world-space x/y.
        var visible = [];
        var sz = INSTANCE_SIZE;
        for (var i = 0; i < nRow; i++) {
            for (var j = 0; j < nCol; j++) {
                var idx = (i * nCol + j) * 4;
                if (data[idx + 3] > ALPHA_THRESHOLD) {
                    visible.push({
                        r: data[idx] / 255,
                        g: data[idx + 1] / 255,
                        b: data[idx + 2] / 255,
                        x: (j - nCol / 2 + 0.5) * sz,
                        y: (nRow / 2 - i + 0.5) * sz   // flip: image row 0 = top
                    });
                }
            }
        }

        if (visible.length === 0) { imageLoaded = true; return; }

        var geom = new THREE.BoxGeometry(sz, sz, sz).translate(0, 0, -0.5 * sz);
        var mat = new THREE.MeshBasicMaterial();
        mesh = new THREE.InstancedMesh(geom, mat, visible.length);

        var color = new THREE.Color();
        var m = new THREE.Matrix4();
        var scaleM = new THREE.Matrix4();

        for (var k = 0; k < visible.length; k++) {
            var v = visible[k];
            var z = THREE.MathUtils.randFloatSpread(RAND_RANGE_Z) * sz;
            var p = project(v.x, v.y, z);
            m.makeTranslation(p.x, p.y, p.z);
            scaleM.makeScale(p.s, p.s, p.s);
            m.multiply(scaleM);                          // T * S  → scale then translate
            mesh.setMatrixAt(k, m);
            mesh.setColorAt(k, color.setRGB(v.r, v.g, v.b));
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
       parallax that smears the image (boxes in a column no longer align).
       So the camera stays on the axis and we instead SHEAR the projection
       matrix — a lens shift — which offsets the whole framed view by a
       uniform, depth-independent amount. Result: a sharp portrait framed
       beside the contact block, with the camera never leaving the cloud.

       Mesh is left at the origin at scale 1 (the reference calibration).
       Portrait size is set by TARGET_CAMERA_Z (distance = apparent size).
       ═══════════════════════════════════════════════════════════ */
    function layoutPortrait() {
        if (!camera) return;
        var vw = window.innerWidth;
        var vh = window.innerHeight;

        var centerFrac = 0.5;   // desired portrait centre, screen-x (0=left … 1=right)
        var centerYFrac = 0.5;  // desired portrait centre, screen-y (0=top … 1=bottom)

        var block = document.querySelector('.contact-block--left');
        var rect = block ? block.getBoundingClientRect() : null;

        if (vw >= 1024 && rect) {
            var blockRight = rect.right / vw;
            var pad = 0.04;
            var regionStart = blockRight + pad;
            var regionEnd = 1 - pad;
            var regionW = Math.max(0, regionEnd - regionStart);
            if (regionW >= 0.18) {
                // Centre the portrait in the free space to the right of the block.
                centerFrac = regionStart + regionW / 2;
                if (centerFrac > 0.8) centerFrac = 0.8;
            }
            centerYFrac = (rect.top + rect.height / 2) / vh;
        }

        // Rebuild the base projection (picks up the current aspect), then
        // shear it. elements[8] is the z→clip_x term (horizontal shift),
        // elements[9] is z→clip_y (vertical shift).
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
        // Keep the portrait placed beside the block as layout settles.
        layoutPortrait();

        var rect = contactSection.getBoundingClientRect();
        var vh = window.innerHeight;
        var enterTop = vh;
        var resolveTop = vh * 0.15;
        var p = (enterTop - rect.top) / (enterTop - resolveTop);
        if (p < 0) p = 0; else if (p > 1) p = 1;

        if (!reduceMotion) {
            targetZ = INIT_CAMERA_Z + (TARGET_CAMERA_Z - INIT_CAMERA_Z) * easeInOut(p);
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
        var loop = function () {
            rafId = requestAnimationFrame(loop);
            if (imageLoaded) {
                camera.position.z += (targetZ - camera.position.z) * CAMERA_LERP;
                renderer.render(scene, camera);
            }
        };
        rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function renderOnce() {
        if (renderer && scene && camera && imageLoaded) {
            camera.position.z = targetZ;
            renderer.render(scene, camera);
        }
    }

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

    console.log('[contact-cloud] point-cloud portrait ready');
})();
