/* Portfolio enhancements. Content and navigation remain complete without JS. */
(() => {
  "use strict";

  window.__portfolioEnhanced = true;

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = reduceMotion.matches;

  /* Nav state ------------------------------------------------------------ */

  const nav = document.querySelector(".site-nav");
  const sentinel = document.querySelector(".scroll-sentinel");

  if (nav && sentinel && "IntersectionObserver" in window) {
    const navObserver = new IntersectionObserver(
      ([entry]) => {
        nav.classList.toggle("is-scrolled", !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    navObserver.observe(sentinel);
  }

  /* Scroll reveals -------------------------------------------------------- */

  const revealTargets = Array.from(document.querySelectorAll("[data-reveal]"));

  if (revealTargets.length) {
    if ("IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.08, rootMargin: "9999px 0px -6% 0px" }
      );

      revealTargets.forEach((target) => revealObserver.observe(target));
    } else {
      revealTargets.forEach((target) => target.classList.add("is-visible"));
    }
  }

  /* Hero film ----------------------------------------------------------- */

  const heroFilm = document.querySelector(".hero-film");
  const heroMedia = document.querySelector(".hero-media");
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  let heroInView = true;
  let heroFilmReady = document.readyState === "complete";

  const syncHeroFilm = () => {
    if (!heroFilm) return;
    if (!prefersReducedMotion && !saveData && heroInView && heroFilmReady) {
      heroFilm.preload = "auto";
      const attempt = heroFilm.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(() => {});
      }
    } else {
      heroFilm.pause();
    }
  };

  if (heroFilm) {
    heroFilm.addEventListener("playing", () => {
      heroFilm.classList.add("is-playing");
    });

    if (heroMedia && "IntersectionObserver" in window) {
      const heroFilmObserver = new IntersectionObserver(
        ([entry]) => {
          heroInView = entry.isIntersecting;
          syncHeroFilm();
        },
        { threshold: 0.05 }
      );
      heroFilmObserver.observe(heroMedia);
    }

    /* Start the film after the page has painted its first view, so the
       poster and the copy are never waiting on it. */
    window.addEventListener(
      "load",
      () => {
        heroFilmReady = true;
        syncHeroFilm();
      },
      { once: true }
    );

    /* Some browsers hold back autoplay until the visitor has interacted.
       One gesture is enough to start the film. */
    const startOnGesture = () => {
      syncHeroFilm();
    };
    window.addEventListener("pointerdown", startOnGesture, { once: true, passive: true });
    window.addEventListener("keydown", startOnGesture, { once: true });

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncHeroFilm();
    });

    syncHeroFilm();
  }

  reduceMotion.addEventListener("change", (event) => {
    prefersReducedMotion = event.matches;
    syncHeroFilm();
  });

  /* Marquee --------------------------------------------------------------- */

  /* The band is moved here rather than by its CSS animation, so the ticker can
     lose speed and regain it instead of switching play-state. Velocity is
     damped toward a target on the frame clock: the offset is one running
     number that never resets, so hovering repeatedly can only slow the band
     or speed it up, never send it back to the start. The keyframes stay as
     the no-JS fallback. */

  const marquee = document.querySelector(".marquee");
  const marqueeTrack = document.querySelector(".marquee-track");

  if (marquee && marqueeTrack) {
    const SPEED_TAU = 0.18; // seconds to close 63% of a speed change
    const CYCLE = 46; // seconds per band length, matching the keyframes
    const STOP_AT = 0.4; // px/s below which the ticker is stopped

    let period = 0;
    let baseSpeed = 0;
    let offset = 0;
    let velocity = 0;
    let target = 0;
    let last = 0;
    let frame = 0;

    const measure = () => {
      /* The track holds its content twice, so the band repeats every half of
         its width. A plain 50% wrap lands a gap short, because the trailing
         gap after the last pair is not part of the track, so the period comes
         from where the repeat actually starts. */
      const kids = marqueeTrack.children;
      const repeat = kids.length % 2 === 0 ? kids[kids.length / 2] : null;
      period =
        (repeat
          ? repeat.offsetLeft - kids[0].offsetLeft
          : marqueeTrack.getBoundingClientRect().width / 2) || 1;
      baseSpeed = period / CYCLE;
    };

    const draw = () => {
      marqueeTrack.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const step = (now) => {
      /* A hidden tab stops the frame clock; the clamp keeps a resumed tab from
         jumping the band forward by the length of the pause. */
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      velocity += (target - velocity) * (1 - Math.exp(-dt / SPEED_TAU));
      if (!target && velocity < STOP_AT) velocity = 0;

      if (!velocity && !target) {
        frame = 0;
        last = 0;
        return;
      }

      offset = (offset + velocity * dt) % period;
      draw();
      frame = requestAnimationFrame(step);
    };

    const wake = () => {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (reduceMotion.matches) return;
      target = baseSpeed;
      wake();
    };

    const stop = () => {
      target = 0;
      if (velocity) wake();
    };

    marquee.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") stop();
    });

    marquee.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") start();
    });

    const remeasure = () => {
      if (reduceMotion.matches) return;
      const running = target > 0;
      measure();
      offset %= period;
      if (running) target = baseSpeed;
      draw();
    };

    if ("ResizeObserver" in window) {
      new ResizeObserver(remeasure).observe(marqueeTrack);
    } else {
      window.addEventListener("resize", remeasure);
    }

    reduceMotion.addEventListener("change", () => {
      if (reduceMotion.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        velocity = 0;
        target = 0;
        last = 0;
        marqueeTrack.style.transform = "";
        return;
      }
      measure();
      draw();
      start();
    });

    if (!reduceMotion.matches) {
      measure();
      /* Begin at full speed so taking the band over from the CSS animation is
         invisible; a hover before the first frame then decelerates from it. */
      velocity = baseSpeed;
      target = baseSpeed;
      draw();
      wake();
    }
  }

  /* Mobile menu ----------------------------------------------------------- */

  const menu = document.querySelector("#mobile-menu");
  const menuToggle = document.querySelector(".menu-toggle");
  const menuClose = document.querySelector(".menu-close");
  const wideViewport = window.matchMedia("(min-width: 881px)");

  const closeMenu = (restoreFocus = true) => {
    if (!menu || !menu.open) return;
    menu.close();
    if (restoreFocus && menuToggle) menuToggle.focus();
  };

  const openMenu = () => {
    if (!menu || menu.open || typeof menu.showModal !== "function") return;
    menu.showModal();
    root.classList.add("menu-open");
    if (menuToggle) menuToggle.setAttribute("aria-expanded", "true");
    if (menuClose) menuClose.focus();
  };

  if (menu && menuToggle && menuClose) {
    menuToggle.addEventListener("click", openMenu);
    menuClose.addEventListener("click", () => closeMenu());

    menu.addEventListener("close", () => {
      root.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.focus();
    });

    menu.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu(false);
      });
    });

    wideViewport.addEventListener("change", (event) => {
      if (event.matches) closeMenu(false);
    });
  }
})();
