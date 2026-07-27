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

  /* ---------------- scroll chapters: one continuous transformation ------- */
  /* The chapter track does not animate itself. It reports a single 0..1
     progress value, which drives BOTH the persistent WebGL scene
     (window.GTScene.progress) and the CSS fallback slab
     (--chapter-progress). No scroll hijacking: the page scrolls normally and
     we only read its position. */
  var trackEl = null;
  var chapterEls = [];
  var indexEls = [];
  var scrollRaf = null;
  var lastProgress = -1;

  window.GTScene = window.GTScene || { progress: 0 };

  function updateProgress() {
    scrollRaf = null;
    if (!trackEl) return;
    var rect = trackEl.getBoundingClientRect();
    var vh = window.innerHeight || 1;
    // 0 when the track's top reaches the viewport bottom, 1 when its bottom
    // passes the viewport top.
    var span = rect.height + vh;
    var travelled = vh - rect.top;
    var p = Math.max(0, Math.min(1, travelled / span));
    // Ease the two ends so the first and last chapters hold briefly.
    p = Math.max(0, Math.min(1, (p - 0.12) / 0.76));

    if (Math.abs(p - lastProgress) > 0.001) {
      lastProgress = p;
      window.GTScene.progress = p;
      root.style.setProperty("--chapter-progress", p.toFixed(4));
    }

    var active = Math.min(chapterEls.length - 1, Math.round(p * (chapterEls.length - 1)));
    for (var i = 0; i < chapterEls.length; i++) {
      var on = i === active;
      chapterEls[i].classList.toggle("is-active", on);
      if (indexEls[i]) indexEls[i].classList.toggle("is-active", on);
    }
  }

  function onScroll() {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(updateProgress);
  }

  function wireChapters(scope) {
    var track = scope.querySelector(".entry-track");
    if (!track || track.dataset.gtTrack) return;
    track.dataset.gtTrack = "1";
    trackEl = track;
    chapterEls = Array.prototype.slice.call(track.querySelectorAll("[data-chapter]"));
    indexEls = Array.prototype.slice.call(track.querySelectorAll(".entry-index li"));

    if (reducedMotion()) {
      // Static substitution: show every chapter, hold the scene on chapter one.
      chapterEls.forEach(function (c) { c.classList.add("is-active"); });
      window.GTScene.progress = 0;
      root.style.setProperty("--chapter-progress", "0");
      return;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateProgress();
  }

  /* ------------------------------------------------ utility strip clock */
  var clockTimer = null;

  function tickClock() {
    var live = document.querySelector("[data-entry-clock]");
    if (!live) return;
    var d = new Date();
    var next =
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0");
    // Only write when the value actually changes. This element lives inside
    // #app, which is watched by a MutationObserver — writing on every pass
    // would re-enter enhance() and spin the main thread.
    if (live.textContent !== next) live.textContent = next;
  }

  function wireClock(scope) {
    var el = scope.querySelector("[data-entry-clock]");
    if (!el) {
      if (clockTimer) {
        window.clearInterval(clockTimer);
        clockTimer = null;
      }
      return;
    }
    if (el.dataset.gtClock) return;
    el.dataset.gtClock = "1";
    tickClock();
    if (!clockTimer) clockTimer = window.setInterval(tickClock, 1000);
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
    try {
      enhanceUnsafe(scope);
    } catch (err) {
      console.warn("[gt] entry enhancement skipped:", err && err.message);
    }
  }

  function enhanceUnsafe(scope) {
    var auth = scope.querySelector(".auth-page") || (scope.classList && scope.classList.contains("auth-page") ? scope : null);
    if (auth) {
      revealEntry(auth);
      wireParallax(auth);
      wireChapters(auth);
      wireClock(auth);
    }
  }

  function boot() {
    // Registered before anything else: whatever happens below, the overlay is
    // guaranteed to release. It is a progress hint, never a gate.
    window.setTimeout(function () {
      finished = true;
    }, LOADER_MAX_MS - 200);
    window.setTimeout(dismiss, LOADER_MAX_MS);

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
