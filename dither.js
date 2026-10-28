/* Portfolio: a three.js Bayer-dither paper field.
   Decorative enhancement only. The page is complete without it. */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const wideViewport = window.matchMedia("(min-width: 900px)");
  const connection =
    navigator.connection ||
    navigator.mozConnection ||
    navigator.webkitConnection ||
    null;

  const paperSections = Array.from(
    document.querySelectorAll(".hero, .work, .experience")
  );

  if (!paperSections.length || !("IntersectionObserver" in window)) return;
  if (reduceMotion.matches || !finePointer.matches || !wideViewport.matches) return;
  if (connection && connection.saveData) return;
  if (!supportsWebGL2()) return;

  const canvas = document.createElement("canvas");
  canvas.className = "dither-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);

  const state = {
    booted: false,
    running: false,
    raf: 0,
    last: 0,
    elapsed: 0,
    pointerX: 0.5,
    pointerY: 0.58,
    targetX: 0.5,
    targetY: 0.58,
    pointerStrength: 0,
    targetStrength: 0,
    velocity: 0,
    targetVelocity: 0,
    visible: new Set(),
  };

  let renderer = null;
  let uniforms = null;
  let scene = null;
  let camera = null;

  /* Visibility ---------------------------------------------------------- */

  const setRunning = (next) => {
    if (state.running === next) return;
    state.running = next;
    if (next) {
      state.last = performance.now();
      state.raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(state.raf);
      state.raf = 0;
    }
  };

  const shouldRun = () =>
    state.booted &&
    !document.hidden &&
    !reduceMotion.matches &&
    finePointer.matches &&
    wideViewport.matches &&
    state.visible.size > 0;

  const sync = () => setRunning(shouldRun());

  const visibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) state.visible.add(entry.target);
      else state.visible.delete(entry.target);
    });
    sync();
  });

  paperSections.forEach((section) => visibilityObserver.observe(section));

  document.addEventListener("visibilitychange", sync);

  /* Pointer and scroll -------------------------------------------------- */

  window.addEventListener(
    "pointermove",
    (event) => {
      if (!state.booted) return;
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      state.targetX = event.clientX / window.innerWidth;
      state.targetY = 1 - event.clientY / window.innerHeight;
      state.targetStrength = 1;
    },
    { passive: true }
  );

  const releasePointer = () => {
    state.targetStrength = 0;
  };

  document.documentElement.addEventListener("pointerleave", releasePointer);
  window.addEventListener("blur", releasePointer);

  let lastScrollY = window.scrollY || 0;
  let lastScrollT = performance.now();

  window.addEventListener(
    "scroll",
    () => {
      if (!state.booted) return;
      const now = performance.now();
      const dt = Math.max(12, now - lastScrollT);
      const delta = Math.abs((window.scrollY || 0) - lastScrollY);
      lastScrollY = window.scrollY || 0;
      lastScrollT = now;
      const speed = delta / dt / 18;
      state.targetVelocity = Math.min(1, Math.max(state.targetVelocity, speed));
    },
    { passive: true }
  );

  /* Renderer ------------------------------------------------------------ */

  const boot = async () => {
    if (state.booted || !document.body) return;
    if (reduceMotion.matches || !finePointer.matches || !wideViewport.matches) {
      canvas.remove();
      return;
    }

    let THREE;
    try {
      THREE = await import("./vendor/three-dither.min.js");
    } catch (error) {
      canvas.remove();
      return;
    }

    if (!THREE || typeof THREE.WebGLRenderer !== "function") {
      canvas.remove();
      return;
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: "low-power",
      });
    } catch (error) {
      canvas.remove();
      return;
    }

    renderer.setPixelRatio(resolveDpr());
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.58) },
      uPointerStrength: { value: 0 },
      uVelocity: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    resize();
    state.booted = true;
    renderer.render(scene, camera);
    canvas.classList.add("is-ready");
    sync();
  };

  const resize = () => {
    if (!renderer || !uniforms) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = resolveDpr();

    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    uniforms.uResolution.value.set(width * dpr, height * dpr);
    uniforms.uDpr.value = dpr;
  };

  let resizeFrame = 0;
  window.addEventListener(
    "resize",
    () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        resize();
        if (!wideViewport.matches) {
          state.targetStrength = 0;
          state.pointerStrength = 0;
          canvas.classList.remove("is-ready");
        } else if (state.booted && !reduceMotion.matches) {
          canvas.classList.add("is-ready");
        }
        sync();
      });
    },
    { passive: true }
  );

  /* Frame --------------------------------------------------------------- */

  function frame(now) {
    if (!state.running) return;

    const dt = Math.min((now - state.last) / 1000, 0.05) || 0.016;
    state.last = now;
    state.elapsed += dt;

    const pointerEase = 1 - Math.exp(-dt * 4.2);
    state.pointerX += (state.targetX - state.pointerX) * pointerEase;
    state.pointerY += (state.targetY - state.pointerY) * pointerEase;
    state.pointerStrength +=
      (state.targetStrength - state.pointerStrength) * (1 - Math.exp(-dt * 2.2));

    state.targetVelocity *= Math.exp(-dt * 3.2);
    state.velocity += (state.targetVelocity - state.velocity) * (1 - Math.exp(-dt * 5));

    uniforms.uTime.value = state.elapsed;
    uniforms.uScroll.value = window.scrollY || 0;
    uniforms.uPointer.value.set(state.pointerX, state.pointerY);
    uniforms.uPointerStrength.value = state.pointerStrength;
    uniforms.uVelocity.value = state.velocity;

    renderer.render(scene, camera);
    state.raf = requestAnimationFrame(frame);
  }

  /* Preference changes -------------------------------------------------- */

  reduceMotion.addEventListener("change", (event) => {
    if (event.matches) {
      setRunning(false);
      canvas.classList.remove("is-ready");
    } else {
      canvas.classList.add("is-ready");
      sync();
    }
  });

  wideViewport.addEventListener("change", () => {
    if (wideViewport.matches) {
      resize();
      canvas.classList.add("is-ready");
      sync();
    } else {
      setRunning(false);
      canvas.classList.remove("is-ready");
    }
  });

  finePointer.addEventListener("change", sync);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    setRunning(false);
    visibilityObserver.disconnect();
    canvas.remove();
  });

  /* Boot on idle -------------------------------------------------------- */

  const schedule = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(boot, { timeout: 1800 });
    } else {
      window.setTimeout(boot, 900);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });

  /* Helpers ------------------------------------------------------------- */

  function resolveDpr() {
    return Math.min(window.devicePixelRatio || 1, 1.5);
  }

  function supportsWebGL2() {
    try {
      const probe = document.createElement("canvas");
      const context = probe.getContext("webgl2");
      if (!context) return false;
      const lose = context.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
      return true;
    } catch (error) {
      return false;
    }
  }

  /* Shaders ------------------------------------------------------------- */

  const VERTEX_SHADER = `
    void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision highp float;

    uniform vec2  uResolution;
    uniform float uDpr;
    uniform float uTime;
    uniform float uScroll;
    uniform vec2  uPointer;
    uniform float uPointerStrength;
    uniform float uVelocity;

    #define CELL 4.0

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float sum = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 3; i++) {
        sum += amp * valueNoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        amp *= 0.5;
      }
      return sum / 0.875;
    }

    float bayer2(vec2 a) {
      a = floor(a);
      return fract(a.x * 0.5 + a.y * a.y * 0.75);
    }

    #define bayer4(a) (bayer2(0.5 * (a)) * 0.25 + bayer2(a))
    #define bayer8(a) (bayer4(0.5 * (a)) * 0.25 + bayer2(a))

    void main() {
      vec2 cssPx = gl_FragCoord.xy / uDpr;
      vec2 view = uResolution / uDpr;

      // The dot screen belongs to the document, not the window.
      vec2 paperPx = cssPx + vec2(0.0, uScroll);
      vec2 uv = paperPx / view;
      float aspect = view.x / view.y;

      vec2 cell = floor(paperPx / CELL);
      vec2 cellUv = fract(paperPx / CELL);

      vec2 p = vec2(uv.x * aspect, uv.y);
      float t = uTime * 0.012;

      // A slow, printed weather front.
      float warp = fbm(vec2(p.x * 1.7 + t * 1.2, p.y * 1.7 - t * 0.8));
      float grain = fbm(p * 2.15 + vec2(warp * 0.8 - t * 0.35, warp * 0.55 + t * 0.22));
      float presence = smoothstep(0.47, 0.72, grain);
      presence *= 0.85 + 0.15 * sin(uTime * 0.07 + grain * 6.2831);

      // A dithered cloud around the pointer, not a glow.
      vec2 pointerPx = uPointer * view;
      float minSide = min(view.x, view.y);
      float radius = minSide * 0.36;
      float bloom = smoothstep(radius, 0.0, distance(cssPx, pointerPx));
      bloom *= uPointerStrength;
      float cloud = fbm(p * 4.4 + vec2(uTime * 0.03, -uTime * 0.021));
      bloom *= 0.42 + 0.58 * cloud;

      // Scroll adds a faint tremor to the threshold.
      float ripple = uVelocity * 0.055 * sin(p.y * 22.0 + p.x * 7.0 + uTime * 1.4);

      float density = clamp(0.02 + presence * 0.45 + bloom * 0.95 + ripple, 0.0, 0.94);
      float dotOn = step(bayer8(cell), density);

      float dotRadius = 0.26 + 0.14 * bloom;
      float dot = 1.0 - smoothstep(dotRadius - 0.08, dotRadius, length(cellUv - 0.5));

      float alpha = dotOn * dot * (0.028 + presence * 0.085 + bloom * 0.24);
      alpha *= 0.88 + 0.12 * valueNoise(cell * 0.37 + 11.0);

      vec3 ink = vec3(0.345, 0.294, 0.231);
      vec3 accent = vec3(0.906, 0.314, 0.165);
      vec3 color = mix(ink, accent, clamp(bloom * 0.95 + ripple * 2.0, 0.0, 1.0));

      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;
})();
