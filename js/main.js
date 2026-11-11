/* =========================================================================
   AQUVA — site behaviour (no dependencies)
   ========================================================================= */
(function () {
  "use strict";

  var doc = document.documentElement;
  var I18N = window.AQUVA_I18N || {};
  var LANGS = ["hr", "en", "it", "de"];
  var DEFAULT_LANG = "hr";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var store = {
    get: function (k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set: function (k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} }
  };

  /* ---------------------------------------------------------------------
     I18N
     --------------------------------------------------------------------- */
  var currentLang = DEFAULT_LANG;

  function t(key) {
    var dict = I18N[currentLang] || {};
    if (dict[key] != null) return dict[key];
    var fallback = I18N[DEFAULT_LANG] || {};
    return fallback[key] != null ? fallback[key] : null;
  }

  function resolveLang() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get("lang"); } catch (e) {}
    if (fromUrl && LANGS.indexOf(fromUrl) > -1) return fromUrl;
    var saved = store.get("aquva-lang");
    return saved && LANGS.indexOf(saved) > -1 ? saved : DEFAULT_LANG;
  }

  function setMeta(selector, attr, value) {
    var el = $(selector);
    if (el && value) el.setAttribute(attr, value);
  }

  function applyLang(lang, persist) {
    if (LANGS.indexOf(lang) < 0) lang = DEFAULT_LANG;
    currentLang = lang;
    doc.lang = lang;

    $$("[data-i18n]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v != null) el.textContent = v;
    });
    $$("[data-i18n-attr]").forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        var v = t((p[1] || "").trim());
        if (p[0] && v != null) el.setAttribute(p[0].trim(), v);
      });
    });

    document.title = t("meta.title");
    setMeta('meta[name="description"]', "content", t("meta.description"));
    setMeta('meta[property="og:title"]', "content", t("meta.title"));
    setMeta('meta[property="og:description"]', "content", t("meta.description"));
    setMeta('meta[property="og:locale"]', "content", t("meta.ogLocale"));

    $$(".lang__btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
    syncBurgerLabel();
    splitWords();
    if (persist) store.set("aquva-lang", lang);
    doc.classList.remove("i18n-pending");
    requestTick();
  }

  $$(".lang__btn").forEach(function (b) {
    b.addEventListener("click", function () {
      applyLang(b.getAttribute("data-lang"), true);
      // Keep the URL clean once a choice is made explicitly
      if (location.search.indexOf("lang=") > -1 && history.replaceState) {
        history.replaceState(null, "", location.pathname + location.hash);
      }
    });
  });

  /* ---------------------------------------------------------------------
     Philosophy text — word-by-word reveal on scroll
     --------------------------------------------------------------------- */
  var wordBlocks = [];
  function splitWords() {
    wordBlocks = $$("[data-words]").map(function (el) {
      var text = el.textContent.trim();
      el.textContent = "";
      var words = text.split(/\s+/).map(function (w, i, arr) {
        var s = document.createElement("span");
        s.className = "w";
        s.textContent = w;
        el.appendChild(s);
        if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
        return s;
      });
      return { el: el, words: words, lit: -1 };
    });
  }

  /* ---------------------------------------------------------------------
     Loader → hero entrance
     --------------------------------------------------------------------- */
  function revealHero() {
    requestAnimationFrame(function () { doc.classList.add("ready"); });
  }

  function runIntro() {
    var loader = $("#loader");
    if (!doc.classList.contains("intro-playing") || !loader) { revealHero(); return; }

    var MIN = 2350, MAX = 5000, start = performance.now(), done = false;
    function finish() {
      if (done) return; done = true;
      doc.classList.add("intro-done");
      store.set("aquva-intro", "1", true);
      setTimeout(revealHero, 260);
      setTimeout(function () {
        doc.classList.remove("intro-playing");
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 1000);
    }
    function whenLoaded() {
      var wait = Math.max(0, MIN - (performance.now() - start));
      setTimeout(finish, wait);
    }
    if (document.readyState === "complete") whenLoaded();
    else window.addEventListener("load", whenLoaded, { once: true });
    setTimeout(finish, MAX); // never hold the visitor longer than this
  }

  /* ---------------------------------------------------------------------
     Header: scrolled state, hide on scroll down, active section
     --------------------------------------------------------------------- */
  var header = $("#header");
  var lastY = window.scrollY;

  function updateHeader(y) {
    header.classList.toggle("is-scrolled", y > 12);
    var goingDown = y > lastY + 4, goingUp = y < lastY - 4;
    if (!doc.classList.contains("menu-open")) {
      if (goingDown && y > 420) header.classList.add("is-hidden");
      else if (goingUp || y < 420) header.classList.remove("is-hidden");
    }
    lastY = y;
  }

  var navLinks = $$(".nav__link");
  if ("IntersectionObserver" in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("main section[id]").forEach(function (s) { sectionObserver.observe(s); });
  }

  /* ---------------------------------------------------------------------
     Mobile menu
     --------------------------------------------------------------------- */
  var burger = $("#burger"), menu = $("#menu"), menuTimer;

  function syncBurgerLabel() {
    if (!burger) return;
    var open = doc.classList.contains("menu-open");
    var label = t(open ? "a11y.menuClose" : "a11y.menuOpen");
    if (label) burger.setAttribute("aria-label", label);
  }

  function openMenu() {
    clearTimeout(menuTimer);
    menu.hidden = false;
    void menu.offsetWidth; // commit the closed state before animating
    doc.classList.add("menu-open");
    header.classList.remove("is-hidden");
    burger.setAttribute("aria-expanded", "true");
    syncBurgerLabel();
    var first = $(".menu__link", menu);
    if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 350);
  }
  function closeMenu(returnFocus) {
    if (!doc.classList.contains("menu-open")) return;
    doc.classList.remove("menu-open");
    burger.setAttribute("aria-expanded", "false");
    syncBurgerLabel();
    menuTimer = setTimeout(function () { menu.hidden = true; }, 700);
    if (returnFocus) burger.focus();
  }

  if (burger && menu) {
    burger.addEventListener("click", function () {
      doc.classList.contains("menu-open") ? closeMenu(false) : openMenu();
    });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { closeMenu(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu(true);
      // Simple focus trap while the menu is open
      if (e.key === "Tab" && doc.classList.contains("menu-open")) {
        var f = [burger].concat($$("a, button", menu));
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    window.addEventListener("resize", function () { if (window.innerWidth > 1080) closeMenu(false); });
  }

  // Brand / "back to top" links scroll to the very top
  $$('a[href="#home"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      closeMenu(false);
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
    });
  });

  /* ---------------------------------------------------------------------
     Scroll reveals
     --------------------------------------------------------------------- */
  var reveals = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-in"); });
  }

  /* ---------------------------------------------------------------------
     Bubbles (sparkling card, hero, pinned scene)
     --------------------------------------------------------------------- */
  function makeBubbles() {
    if (reduceMotion) return;
    $$("[data-bubbles]").forEach(function (box) {
      var n = parseInt(box.getAttribute("data-bubbles"), 10) || 12;
      if (window.innerWidth < 700) n = Math.ceil(n * 0.6);
      box.innerHTML = "";
      var h = box.clientHeight || 600;
      for (var i = 0; i < n; i++) {
        var b = document.createElement("span");
        var s = 3 + Math.random() * (box.classList.contains("bubbles--pin") ? 9 : 11);
        b.className = "bubble";
        b.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%");
        b.style.setProperty("--s", s.toFixed(1) + "px");
        b.style.setProperty("--t", (6 + Math.random() * 9).toFixed(2) + "s");
        b.style.setProperty("--dl", (-Math.random() * 14).toFixed(2) + "s");
        b.style.setProperty("--dx", ((Math.random() - 0.5) * 60).toFixed(0) + "px");
        b.style.setProperty("--rise", -(h + 40) + "px");
        box.appendChild(b);
      }
    });
  }

  /* ---------------------------------------------------------------------
     Scroll / pointer driven motion (single rAF loop)
     --------------------------------------------------------------------- */
  var parallaxEls = $$("[data-parallax]");
  var pin = $("#pin");
  var heroCans = $$(".hero__can");
  var hero = $(".hero");
  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var ticking = false, pointerLoop = false;

  function requestTick() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  function frame() {
    ticking = false;
    var y = window.scrollY, vh = window.innerHeight;
    updateHeader(y);
    if (reduceMotion) { updateWords(vh, true); return; }

    // Background parallax
    parallaxEls.forEach(function (el) {
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0.2;
      el.style.transform = "translate3d(-50%," + (y * speed).toFixed(1) + "px,0)";
    });

    // Hero cans: pointer depth + scroll drift
    if (y < vh * 1.2) {
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      heroCans.forEach(function (c) {
        var d = parseFloat(c.getAttribute("data-depth")) || 10;
        var sx = pointer.x * d, sy = pointer.y * d - y * d * 0.006;
        c.style.transform = "translate3d(" + sx.toFixed(2) + "px," + sy.toFixed(2) + "px,0)";
      });
      if (Math.abs(pointer.tx - pointer.x) > 0.001 || Math.abs(pointer.ty - pointer.y) > 0.001) requestTick();
    }

    // Pinned "less plastic / more future" scene
    if (pin) {
      var r = pin.getBoundingClientRect();
      var total = pin.offsetHeight - vh;
      if (r.bottom > 0 && r.top < vh) {
        var p = total > 0 ? clamp(-r.top / total, 0, 1) : 1;
        pin.style.setProperty("--p", p.toFixed(4));
      }
    }

    updateWords(vh, false);
  }

  function updateWords(vh, all) {
    wordBlocks.forEach(function (b) {
      var r = b.el.getBoundingClientRect();
      var lit;
      if (all) lit = b.words.length;
      else {
        var p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.38), 0, 1);
        lit = Math.round(p * b.words.length);
      }
      if (lit === b.lit) return;
      b.words.forEach(function (w, i) { w.classList.toggle("on", i < lit); });
      b.lit = lit;
    });
  }

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", function () { requestTick(); }, { passive: true });

  if (finePointer && !reduceMotion && hero) {
    hero.addEventListener("pointermove", function (e) {
      pointer.tx = (e.clientX / window.innerWidth - 0.5);
      pointer.ty = (e.clientY / window.innerHeight - 0.5);
      requestTick();
    });
    hero.addEventListener("pointerleave", function () { pointer.tx = 0; pointer.ty = 0; requestTick(); });
  }

  // Subtle 3D tilt on product stages (desktop only)
  if (finePointer && !reduceMotion) {
    $$("[data-tilt]").forEach(function (card) {
      var stage = $(".product__stage", card);
      card.addEventListener("pointermove", function (e) {
        var r = stage.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        stage.style.setProperty("--ry", (px * 6).toFixed(2) + "deg");
        stage.style.setProperty("--rx", (-py * 6).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", function () {
        stage.style.setProperty("--ry", "0deg");
        stage.style.setProperty("--rx", "0deg");
      });
    });
  }

  /* ---------------------------------------------------------------------
     Contact: copy email
     --------------------------------------------------------------------- */
  var copyBtn = $("#copyEmail"), copyStatus = $(".copy-status"), copyTimer;
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var email = copyBtn.getAttribute("data-email");
      var ok = function () {
        copyStatus.textContent = t("contact.copied");
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () { copyStatus.textContent = ""; }, 2600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(ok, function () { legacyCopy(email) && ok(); });
      } else if (legacyCopy(email)) ok();
    });
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------------------------------------------------------------------
     Privacy dialog
     --------------------------------------------------------------------- */
  var dialog = $("#privacy");
  if (dialog) {
    $("#privacyOpen").addEventListener("click", function () {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
    $("#privacyClose").addEventListener("click", function () {
      if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
    });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  }

  var year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------------------------------------------------------------------
     Future: interactive 360° can experience
     Elements marked [data-viewer-slot="still" | "sparkling" | "lineup"] are the
     reserved mount points. A future viewer module can call
     AQUVA.viewerSlots() and progressively replace the static <img> inside.
     --------------------------------------------------------------------- */
  window.AQUVA = {
    lang: function () { return currentLang; },
    setLang: function (l) { applyLang(l, true); },
    viewerSlots: function () { return $$("[data-viewer-slot]"); }
  };

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  applyLang(resolveLang(), false);
  makeBubbles();
  var resizeTimer, lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    if (window.innerWidth === lastW) return; // ignore mobile URL-bar height changes
    lastW = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(makeBubbles, 250);
  });
  runIntro();
  requestTick();
})();
