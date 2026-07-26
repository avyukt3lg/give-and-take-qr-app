/* ==========================================================================
   Give And Take — UI refresh runtime (preloader + entry motion)
   Progressive enhancement only. If anything here fails, the app still runs.
   ========================================================================== */
(function () {
  "use strict";

  var loaderEl = null;
  var pctEl = null;
  var barEl = null;
  var shown = 0;
  var target = 8;
  var finished = false;
  var raf = null;

  var signals = { app: false, load: false, webgl: false };

  function reducedMotion() {
    return (
      document.documentElement.classList.contains("reduced-motion") ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    );
  }

  /* ---- preloader progress -------------------------------------------- */
  function tick() {
    // Ease the shown value toward target; target grows as signals arrive.
    var base = 12;
    if (signals.app) base += 34;
    if (signals.webgl) base += 34;
    if (signals.load) base += 20;
    target = Math.min(base, finished ? 100 : 96);
    shown += (target - shown) * 0.12 + 0.25;
    if (shown > 100) shown = 100;
    if (pctEl) pctEl.textContent = Math.floor(shown);
    if (barEl) barEl.style.width = shown + "%";
    if (finished && shown > 99.4) {
      dismiss();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function maybeFinish() {
    // App mounted + page load are required; webgl is best-effort.
    if (signals.app && signals.load) finished = true;
  }

  function dismiss() {
    if (raf) cancelAnimationFrame(raf);
    if (!loaderEl) return;
    loaderEl.classList.add("gt-done");
    document.documentElement.style.overflow = "";
    window.setTimeout(function () {
      if (loaderEl && loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl);
    }, 900);
  }

  window.GTLoader = {
    ready: function (name) {
      if (signals.hasOwnProperty(name)) signals[name] = true;
      maybeFinish();
    }
  };

  /* ---- detect the real app mounting ---------------------------------- */
  function appMounted(root) {
    return !!root.querySelector(
      ".auth-page, .app-shell, .player-assist-shell, .table-display-shell"
    );
  }

  function wireEntry(root) {
    var auth = root.querySelector(".auth-page");
    if (!auth || auth.dataset.gtWired) return;
    auth.dataset.gtWired = "1";
    if (reducedMotion()) return;

    var targets = [];
    var visual = auth.querySelector(".auth-visual");
    if (visual) {
      [".kicker", "h1", "p", ".auth-proof", ".privacy-line"].forEach(function (sel) {
        visual.querySelectorAll(sel).forEach(function (n) { targets.push(n); });
      });
    }
    targets.forEach(function (n, i) {
      n.classList.add("gt-reveal");
      window.setTimeout(function () { n.classList.add("gt-in"); }, 120 + i * 90);
    });

    // Magnetic pull on primary buttons within the entry.
    auth.querySelectorAll(".button").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.transform =
          "translate(" + (e.clientX - r.left - r.width / 2) * 0.18 + "px," +
          (e.clientY - r.top - r.height / 2) * 0.28 + "px)";
      });
      btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });
  }

  function boot() {
    loaderEl = document.getElementById("gt-loader");
    if (loaderEl) {
      pctEl = loaderEl.querySelector(".gt-pct");
      barEl = loaderEl.querySelector(".gt-bar i");
      document.documentElement.style.overflow = "hidden";
      raf = requestAnimationFrame(tick);
    }

    var appRoot = document.getElementById("app");
    if (appRoot) {
      if (appMounted(appRoot)) { signals.app = true; wireEntry(appRoot); maybeFinish(); }
      var mo = new MutationObserver(function () {
        if (appMounted(appRoot)) { signals.app = true; maybeFinish(); }
        wireEntry(appRoot);
      });
      mo.observe(appRoot, { childList: true, subtree: true });
    }

    if (document.readyState === "complete") signals.load = true;
    window.addEventListener("load", function () { signals.load = true; maybeFinish(); });

    // Hard safety net: never trap the user behind the loader.
    window.setTimeout(function () { finished = true; }, 3000);
    window.setTimeout(function () { dismiss(); }, 5500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
