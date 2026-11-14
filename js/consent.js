/* =========================================================================
   AQUVA cookie consent

   Categories: necessary (always on), analytics, marketing (both off by default).
   The choice is stored in localStorage as { v, ts, necessary, analytics, marketing }
   and asked again after MAX_AGE_DAYS or when VERSION changes.

   Optional tools must be added as
     <script type="text/plain" data-consent="analytics" data-src="https://..."></script>
   (or with inline code instead of data-src). They are only activated after the
   visitor consents to that category. None are configured at the moment.
   ========================================================================= */
(function () {
  "use strict";

  var A = window.AQUVA;
  if (!A) return;

  var KEY = "aquva-consent", VERSION = 1, MAX_AGE_DAYS = 180;
  var CATEGORIES = ["analytics", "marketing"];
  var doc = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var listeners = [];
  var activated = { analytics: false, marketing: false };

  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY));
      if (!c || c.v !== VERSION || typeof c.ts !== "number") return null;
      if (Date.now() - c.ts > MAX_AGE_DAYS * 864e5) return null;
      return c;
    } catch (e) { return null; }
  }
  var state = read();

  function write(analytics, marketing) {
    var prev = state;
    state = { v: VERSION, ts: Date.now(), necessary: true, analytics: !!analytics, marketing: !!marketing };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    hideBanner();
    activate();
    listeners.forEach(function (fn) { try { fn(state, prev); } catch (e) {} });
    // A withdrawn category whose scripts already ran can only be stopped by reloading the page
    var withdrawn = CATEGORIES.some(function (c) { return prev && prev[c] && !state[c] && activated[c]; });
    if (withdrawn) location.reload();
  }

  /* Activate deferred <script type="text/plain" data-consent="..."> tags for granted categories */
  function activate() {
    if (!state) return;
    $$('script[type="text/plain"][data-consent]').forEach(function (old) {
      var cat = old.getAttribute("data-consent");
      if (!state[cat] || old.hasAttribute("data-activated")) return;
      var s = document.createElement("script");
      var src = old.getAttribute("data-src");
      if (src) { s.src = src; s.async = true; } else { s.text = old.text; }
      old.setAttribute("data-activated", "");
      old.parentNode.insertBefore(s, old.nextSibling);
      activated[cat] = true;
    });
  }

  /* ---------- Banner ---------- */
  var banner = document.createElement("section");
  banner.className = "consent";
  banner.hidden = true;
  banner.setAttribute("aria-labelledby", "consent-title");
  banner.innerHTML =
    '<div class="consent__inner">' +
      '<span class="consent__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.4-4.6"/></svg></span>' +
      '<div class="consent__body">' +
        '<h2 class="consent__title" id="consent-title" data-i18n="consent.title"></h2>' +
        '<p class="consent__text"><span data-i18n="consent.text"></span> <button type="button" class="link-btn consent__more" data-privacy-open data-i18n="consent.more"></button></p>' +
      '</div>' +
      '<div class="consent__actions">' +
        '<button type="button" class="btn btn--ghost" data-consent-action="necessary"><span data-i18n="consent.necessaryOnly"></span></button>' +
        '<button type="button" class="btn btn--ghost" data-consent-action="settings"><span data-i18n="consent.settings"></span></button>' +
        '<button type="button" class="btn btn--primary" data-consent-action="all"><span data-i18n="consent.acceptAll"></span></button>' +
      '</div>' +
    '</div>';

  function showBanner() {
    banner.hidden = false;
    doc.classList.add("consent-open");
    requestAnimationFrame(function () { banner.classList.add("is-visible"); });
  }
  function hideBanner() {
    if (banner.hidden) return;
    banner.classList.remove("is-visible");
    doc.classList.remove("consent-open");
    setTimeout(function () { banner.hidden = true; }, A.reduceMotion ? 0 : 400);
  }

  /* ---------- Preferences dialog ---------- */
  function row(cat, always) {
    return '<li class="prefs__item">' +
      '<div class="prefs__copy"><h3 class="prefs__name" id="prefs-' + cat + '" data-i18n="prefs.' + cat + '"></h3>' +
      '<p class="prefs__desc" data-i18n="prefs.' + cat + 'Text"></p></div>' +
      (always
        ? '<span class="prefs__always" data-i18n="prefs.alwaysOn"></span>'
        : '<label class="switch"><input type="checkbox" role="switch" name="' + cat + '" aria-labelledby="prefs-' + cat + '"><span class="switch__track" aria-hidden="true"></span></label>') +
    '</li>';
  }
  var prefs = document.createElement("dialog");
  prefs.className = "dialog prefs";
  prefs.id = "cookie-prefs";
  prefs.setAttribute("aria-labelledby", "prefs-title");
  prefs.innerHTML =
    '<div class="dialog__inner">' +
      '<button class="dialog__close" type="button" data-prefs-close data-i18n-attr="aria-label:a11y.close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<p class="eyebrow">AQUVA</p>' +
      '<h2 id="prefs-title" data-i18n="prefs.title"></h2>' +
      '<p data-i18n="prefs.intro"></p>' +
      '<ul class="prefs__list">' + row("necessary", true) + row("analytics") + row("marketing") + '</ul>' +
      '<div class="prefs__actions">' +
        '<button type="button" class="btn btn--ghost" data-consent-action="necessary"><span data-i18n="consent.necessaryOnly"></span></button>' +
        '<button type="button" class="btn btn--ghost" data-consent-action="all"><span data-i18n="consent.acceptAll"></span></button>' +
        '<button type="button" class="btn btn--primary" data-consent-action="save"><span data-i18n="prefs.save"></span></button>' +
      '</div>' +
    '</div>';

  function openPrefs() {
    CATEGORIES.forEach(function (c) {
      var box = $('input[name="' + c + '"]', prefs);
      if (box) box.checked = !!(state && state[c]);    // never pre-selected without a prior choice
    });
    if (prefs.open) return;
    if (typeof prefs.showModal === "function") prefs.showModal(); else prefs.setAttribute("open", "");
  }
  function closePrefs() {
    if (!prefs.open) return;
    if (typeof prefs.close === "function") prefs.close(); else prefs.removeAttribute("open");
  }

  function onAction(action) {
    if (action === "settings") { openPrefs(); return; }
    if (action === "necessary") write(false, false);
    else if (action === "all") write(true, true);
    else if (action === "save") {
      write($('input[name="analytics"]', prefs).checked, $('input[name="marketing"]', prefs).checked);
    }
    closePrefs();
    if (window.AQUVA_CART && AQUVA_CART.announce) AQUVA_CART.announce(A.t("prefs.saved"));
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var act = t.closest("[data-consent-action]");
    if (act && (banner.contains(act) || prefs.contains(act))) { onAction(act.getAttribute("data-consent-action")); return; }
    if (t.closest("[data-consent-open]")) { e.preventDefault(); openPrefs(); return; }
    if (t.closest("[data-prefs-close]")) { closePrefs(); return; }
    if (t === prefs) closePrefs();                       // backdrop click: closes, does not consent
  });

  /* ---------- Boot ---------- */
  document.body.appendChild(banner);
  document.body.appendChild(prefs);
  A.translate(banner);
  A.translate(prefs);
  if (state) activate(); else showBanner();

  window.AQUVA_CONSENT = {
    get: function () { return state ? JSON.parse(JSON.stringify(state)) : null; },
    has: function (cat) { return cat === "necessary" || !!(state && state[cat]); },
    decided: function () { return !!state; },
    open: openPrefs,
    onChange: function (fn) { listeners.push(fn); }
  };
})();
