/* ==========================================================================
   Give And Take — "The Digital Table" motion runtime
   --------------------------------------------------------------------------
   Progressive enhancement only. Every effect here is optional: if this file
   throws, is blocked, or is disabled the app still renders and works.

   Rules enforced here:
     • the boot overlay never lives longer than ~800ms;
     • no scroll hijacking — everything is observer or pointer driven;
     • all non-essential motion is skipped when reduced motion is requested
       (OS setting or the in-app Reduced motion switch).
   ========================================================================== */
(function () {
  "use strict";

  var LOADER_MAX_MS = 800;

  var root = document.documentElement;
  var loaderEl = null;
  var pctEl = null;
  var barEl = null;
  var shown = 0;
  var finished = false;
  var raf = null;
  var dismissed = false;

  var signals = { app: false, load: false, webgl: false };

  function reducedMotion() {
    return (
      root.classList.contains("reduced-motion") ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
  }

  /* ------------------------------------------------------- boot overlay */
  function tick() {
    var base = 14;
    if (signals.app) base += 38;
    if (signals.webgl) base += 26;
    if (signals.load) base += 22;
    var target = Math.min(base, finished ? 100 : 94);
    shown += (target - shown) * 0.28 + 1.2;
    if (shown > 100) shown = 100;
    if (pctEl) pctEl.textContent = Math.floor(shown);
    if (barEl) barEl.style.width = shown + "%";
    if (finished && shown > 98.5) {
      dismiss();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function maybeFinish() {
    if (signals.app && signals.load) finished = true;
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (raf) cancelAnimationFrame(raf);
    root.style.overflow = "";
    if (!loaderEl) return;
    loaderEl.classList.add("gt-done");
    window.setTimeout(function () {
      if (loaderEl && loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl);
    }, 500);
  }

  window.GTLoader = {
    ready: function (name) {
      if (Object.prototype.hasOwnProperty.call(signals, name)) signals[name] = true;
      maybeFinish();
    }
  };

  /* -------------------------------------------------- entry choreography */
  function appMounted(node) {
    return !!node.querySelector(".auth-page, .app-shell, .player-assist-shell, .table-display-shell");
  }

  function revealEntry(auth) {
    if (auth.dataset.gtRevealed) return;
    auth.dataset.gtRevealed = "1";
    if (reducedMotion()) return;
    var targets = [];
    var visual = auth.querySelector(".auth-visual");
    if (visual) {
      [".kicker", "h1", "p:not(.kicker):not(.privacy-line)", ".table-map", ".auth-proof", ".privacy-line"].forEach(
        function (sel) {
          visual.querySelectorAll(sel).forEach(function (n) {
            if (targets.indexOf(n) === -1) targets.push(n);
          });
        }
      );
    }
    targets.forEach(function (node, i) {
      node.classList.add("gt-reveal");
      window.setTimeout(function () {
        node.classList.add("gt-in");
      }, 90 + i * 80);
    });
  }

  /* Damped pointer parallax on the board plate. Restrained on purpose: the
     plate must never move far enough to feel unstable next to the form. */
  var boardPlate = null;
  var pointerTarget = { x: 0, y: 0 };
  var pointerCurrent = { x: 0, y: 0 };
  var parallaxRaf = null;

  function parallaxLoop() {
    parallaxRaf = null;
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * 0.08;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * 0.08;
    if (boardPlate) {
      var img = boardPlate.querySelector("img");
      if (img) {
        img.style.setProperty("--px", (pointerCurrent.x * 6).toFixed(2) + "px");
        img.style.setProperty("--py", (pointerCurrent.y * 6).toFixed(2) + "px");
        img.style.setProperty("--rx", (pointerCurrent.x * 2.4).toFixed(2) + "deg");
        img.style.setProperty("--ry", (-pointerCurrent.y * 2).toFixed(2) + "deg");
      }
    }
    if (Math.abs(pointerTarget.x - pointerCurrent.x) > 0.001 || Math.abs(pointerTarget.y - pointerCurrent.y) > 0.001) {
      parallaxRaf = requestAnimationFrame(parallaxLoop);
    }
  }

  function wireParallax(scope) {
    boardPlate = scope.querySelector('[data-parallax="board"]');
    if (!boardPlate || boardPlate.dataset.gtParallax) return;
    boardPlate.dataset.gtParallax = "1";
    if (reducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    window.addEventListener(
      "pointermove",
      function (e) {
        pointerTarget.x = e.clientX / window.innerWidth - 0.5;
        pointerTarget.y = e.clientY / window.innerHeight - 0.5;
        if (!parallaxRaf) parallaxRaf = requestAnimationFrame(parallaxLoop);
      },
      { passive: true }
    );
  }

  /* -------------------------------------------- scroll chapters (no hijack) */
  var chapterObserver = null;
  var figureObserver = null;
  var trackedFigures = [];
  var scrollRaf = null;

  function updateFigures() {
    scrollRaf = null;
    var vh = window.innerHeight || 1;
    trackedFigures.forEach(function (fig) {
      var rect = fig.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;
      var progress = (rect.top + rect.height / 2 - vh / 2) / vh; // -1 .. 1
      var img = fig.querySelector("img");
      if (img) img.style.setProperty("--shift", (progress * -26).toFixed(1) + "px");
    });
  }

  function onScroll() {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(updateFigures);
  }

  function wireChapters(scope) {
    var chapters = scope.querySelectorAll("[data-chapter]");
    if (!chapters.length) return;
    if (reducedMotion() || !("IntersectionObserver" in window)) {
      chapters.forEach(function (c) {
        c.classList.add("gt-chapter-in");
      });
      return;
    }
    if (!chapterObserver) {
      chapterObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("gt-chapter-in");
              chapterObserver.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -18% 0px", threshold: 0.18 }
      );
    }
    chapters.forEach(function (c) {
      if (!c.dataset.gtChapter) {
        c.dataset.gtChapter = "1";
        chapterObserver.observe(c);
      }
    });

    trackedFigures = Array.prototype.slice.call(scope.querySelectorAll('[data-parallax="chapter"]'));
    if (trackedFigures.length && !figureObserver) {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll, { passive: true });
      figureObserver = true;
    }
    updateFigures();
  }

  /* --------------------------------------------------- copy-code feedback */
  document.addEventListener(
    "click",
    function (event) {
      var trigger = event.target.closest && event.target.closest('[data-action="copy-session-code"]');
      if (!trigger) return;
      trigger.classList.add("gt-copied");
      var previous = trigger.getAttribute("data-gt-label") || trigger.textContent;
      trigger.setAttribute("data-gt-label", previous);
      trigger.textContent = "Copied";
      window.setTimeout(function () {
        trigger.classList.remove("gt-copied");
        if (document.body.contains(trigger)) trigger.textContent = previous;
      }, 1400);
    },
    true
  );

  /* ------------------------------------------------------------- bootstrap */
  function enhance(scope) {
    var auth = scope.querySelector(".auth-page") || (scope.classList && scope.classList.contains("auth-page") ? scope : null);
    if (auth) {
      revealEntry(auth);
      wireParallax(auth);
      wireChapters(auth);
    }
  }

  function boot() {
    loaderEl = document.getElementById("gt-loader");
    if (loaderEl) {
      pctEl = loaderEl.querySelector(".gt-pct");
      barEl = loaderEl.querySelector(".gt-bar i");
      root.style.overflow = "hidden";
      raf = requestAnimationFrame(tick);
    }

    var appRoot = document.getElementById("app");
    if (appRoot) {
      if (appMounted(appRoot)) {
        signals.app = true;
        maybeFinish();
      }
      enhance(appRoot);
      var observer = new MutationObserver(function () {
        if (appMounted(appRoot)) {
          signals.app = true;
          maybeFinish();
        }
        enhance(appRoot);
      });
      observer.observe(appRoot, { childList: true, subtree: true });
    }

    if (document.readyState === "complete") signals.load = true;
    window.addEventListener("load", function () {
      signals.load = true;
      maybeFinish();
    });

    // Hard cap: the overlay is never an artificial wait. If the game config is
    // still loading the app's own boot card takes over — a real loading state.
    window.setTimeout(function () {
      finished = true;
    }, LOADER_MAX_MS - 200);
    window.setTimeout(dismiss, LOADER_MAX_MS);

    // Safety net: if the WebGL module never reports in (blocked CDN, no GPU,
    // module parse error) fall back to the static gradient background.
    window.setTimeout(function () {
      if (!signals.webgl) root.classList.add("no-webgl");
    }, 2500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
