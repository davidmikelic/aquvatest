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

  var LOCALES = { hr: "hr-HR", en: "en-GB", it: "it-IT", de: "de-DE" };
  var LANG_NAMES = { hr: "Hrvatski", en: "English", it: "Italiano", de: "Deutsch" };

  /* Translate every [data-i18n] / [data-i18n-attr] inside root (used for dynamic views too) */
  function translate(root) {
    root = root || document;
    $$("[data-i18n]", root).forEach(function (el) {
      var v = t(el.getAttribute("data-i18n"));
      if (v != null) el.textContent = v;
    });
    $$("[data-i18n-attr]", root).forEach(function (el) {
      el.getAttribute("data-i18n-attr").split(";").forEach(function (pair) {
        var p = pair.split(":");
        var v = t((p[1] || "").trim());
        if (p[0] && v != null) el.setAttribute(p[0].trim(), v);
      });
    });
  }

  function applyLang(lang, persist) {
    if (LANGS.indexOf(lang) < 0) lang = DEFAULT_LANG;
    currentLang = lang;
    doc.lang = lang;

    translate(document);

    // Page-specific title/description keys (e.g. the shop page)
    var titleKey = document.body.getAttribute("data-title-key") || "meta.title";
    var descKey = document.body.getAttribute("data-desc-key") || "meta.description";
    document.title = t(titleKey);
    setMeta('meta[name="description"]', "content", t(descKey));
    setMeta('meta[property="og:title"]', "content", t(titleKey));
    setMeta('meta[property="og:description"]', "content", t(descKey));
    setMeta('meta[property="og:locale"]', "content", t("meta.ogLocale"));
    setMeta('meta[name="twitter:title"]', "content", t(titleKey));
    setMeta('meta[name="twitter:description"]', "content", t(descKey));

    syncGlobe();
    syncBurgerLabel();
    splitWords();
    if (persist) store.set("aquva-lang", lang);
    doc.classList.remove("i18n-pending");
    requestTick();
    document.dispatchEvent(new CustomEvent("aquva:langchange", { detail: { lang: lang } }));
  }

  /* ---------------------------------------------------------------------
     Globe language selector (disclosure pattern)
     --------------------------------------------------------------------- */
  var globes = $$("[data-globe]");

  function syncGlobe() {
    globes.forEach(function (g) {
      var btn = $(".globe__btn", g), code = $(".globe__code", g);
      if (code) code.textContent = currentLang.toUpperCase();
      if (btn) btn.setAttribute("aria-label", (t("a11y.language") || "Language") + ": " + LANG_NAMES[currentLang]);
      $$("[data-lang]", g).forEach(function (o) {
        o.setAttribute("aria-pressed", String(o.getAttribute("data-lang") === currentLang));
      });
    });
  }
  function closeGlobes(except, returnFocus) {
    globes.forEach(function (g) {
      if (g === except || !g.classList.contains("is-open")) return;
      g.classList.remove("is-open");
      var btn = $(".globe__btn", g);
      btn.setAttribute("aria-expanded", "false");
      if (returnFocus) btn.focus();
    });
  }
  globes.forEach(function (g) {
    var btn = $(".globe__btn", g);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !g.classList.contains("is-open");
      closeGlobes(g);
      g.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open) { var cur = $('[aria-pressed="true"]', g); if (cur) setTimeout(function () { cur.focus({ preventScroll: true }); }, 60); }
    });
    $$("[data-lang]", g).forEach(function (o) {
      o.addEventListener("click", function () {
        applyLang(o.getAttribute("data-lang"), true);
        closeGlobes(null, true);
        // Keep the URL clean once a choice is made explicitly
        if (location.search.indexOf("lang=") > -1 && history.replaceState) {
          history.replaceState(null, "", location.pathname + location.hash);
        }
      });
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest("[data-globe]")) closeGlobes(null, false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("[data-globe].is-open")) { e.stopImmediatePropagation(); closeGlobes(null, true); }
  }, true);
  document.addEventListener("focusin", function (e) {
    if (!e.target.closest("[data-globe]")) closeGlobes(null, false);
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
  /* Defer reading scrollY until the first rAF frame so we don't force layout
     while the stylesheet is still settling after parse. */
  var lastY = 0;
  var headerReady = false;

  function updateHeader(y) {
    if (!headerReady) { lastY = y; headerReady = true; }
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
        navLinks.forEach(function (a) {
          var href = a.getAttribute("href");
          if (href.charAt(0) === "#") a.classList.toggle("is-active", href === "#" + id);
        });
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
    window.addEventListener("resize", function () { if (window.innerWidth > 1199) closeMenu(false); });
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
  var revealObserver = null;
  if ("IntersectionObserver" in window && !reduceMotion) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  }
  function observeReveals(root) {
    $$("[data-reveal]", root).forEach(function (el) {
      if (el.classList.contains("is-in")) return;
      if (revealObserver) revealObserver.observe(el); else el.classList.add("is-in");
    });
  }
  observeReveals(document);

  /* ---------------------------------------------------------------------
     Bubbles (sparkling card, hero, pinned scene)
     --------------------------------------------------------------------- */
  function makeBubbles(root) {
    if (reduceMotion) return;
    var boxes = $$("[data-bubbles]", root);
    if (!boxes.length) return;
    /* Batch geometry reads before any DOM writes to avoid forced reflow. */
    var vw = window.innerWidth;
    var meta = boxes.map(function (box) {
      return {
        box: box,
        h: box.clientHeight || 600,
        n: parseInt(box.getAttribute("data-bubbles"), 10) || 12,
        pin: box.classList.contains("bubbles--pin")
      };
    });
    meta.forEach(function (m) {
      var n = vw < 700 ? Math.ceil(m.n * 0.6) : m.n;
      var h = m.h;
      var box = m.box;
      var frag = document.createDocumentFragment();
      for (var i = 0; i < n; i++) {
        var b = document.createElement("span");
        var s = 3 + Math.random() * (m.pin ? 9 : 11);
        b.className = "bubble";
        b.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%");
        b.style.setProperty("--s", s.toFixed(1) + "px");
        b.style.setProperty("--t", (6 + Math.random() * 9).toFixed(2) + "s");
        b.style.setProperty("--dl", (-Math.random() * 14).toFixed(2) + "s");
        b.style.setProperty("--dx", ((Math.random() - 0.5) * 60).toFixed(0) + "px");
        b.style.setProperty("--rise", -(h + 40) + "px");
        frag.appendChild(b);
      }
      box.textContent = "";
      box.appendChild(frag);
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
    /* Phase 1 — geometry reads (no style writes yet). */
    var y = window.scrollY, vh = window.innerHeight;
    var pinRect = null, pinH = 0, pinVisible = false;
    if (pin && !reduceMotion) {
      pinRect = pin.getBoundingClientRect();
      pinH = pin.offsetHeight;
      pinVisible = pinRect.bottom > 0 && pinRect.top < vh;
    }
    var wordRects = null;
    if (wordBlocks.length) {
      wordRects = wordBlocks.map(function (b) { return b.el.getBoundingClientRect(); });
    }

    /* Phase 2 — style / class writes. */
    updateHeader(y);
    if (reduceMotion) { updateWords(vh, true, wordRects); return; }

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
    if (pin && pinVisible) {
      var total = pinH - vh;
      var p = total > 0 ? clamp(-pinRect.top / total, 0, 1) : 1;
      pin.style.setProperty("--p", p.toFixed(4));
    }

    updateWords(vh, false, wordRects);
  }

  function updateWords(vh, all, rects) {
    wordBlocks.forEach(function (b, idx) {
      var r = rects ? rects[idx] : b.el.getBoundingClientRect();
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
  function bindTilt(root) {
    if (!finePointer || reduceMotion) return;
    $$("[data-tilt]", root).forEach(function (card) {
      if (card._tilt) return; card._tilt = true;
      var stage = $(".product__stage", card);
      if (!stage) return;
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
  bindTilt(document);

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
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); }
    });
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
    locale: function () { return LOCALES[currentLang]; },
    setLang: function (l) { applyLang(l, true); },
    t: t,
    /* Plural-aware lookup: key.one / key.few / key.other (falls back to .other) */
    tp: function (key, n) {
      var cat = "other";
      try { cat = new Intl.PluralRules(LOCALES[currentLang]).select(n); } catch (e) {}
      var v = t(key + "." + cat);
      return v != null ? v : t(key + ".other");
    },
    translate: translate,
    /* Bring dynamically rendered markup (shop views, cart) up to the site's standard */
    enhance: function (root) {
      translate(root);
      observeReveals(root);
      makeBubbles(root);
      bindTilt(root);
    },
    reduceMotion: reduceMotion,
    viewerSlots: function () { return $$("[data-viewer-slot]"); }
  };

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  /* Capture viewport width before applyLang/makeBubbles mutate the DOM. */
  var resizeTimer, lastW = window.innerWidth;
  applyLang(resolveLang(), false);
  makeBubbles(document);
  window.addEventListener("resize", function () {
    var w = window.innerWidth;
    if (w === lastW) return; // ignore mobile URL-bar height changes
    lastW = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { makeBubbles(document); }, 250);
  });
  runIntro();
  requestTick();
})();
