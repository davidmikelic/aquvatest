/* =========================================================================
   AQUVA newsletter: one system for the timed popup and the footer form.
   Provider connection lives in js/newsletter-config.js.
   Explicit opt-in: the consent checkbox is never pre-ticked and is required.
   ========================================================================= */
(function () {
  "use strict";

  var A = window.AQUVA;
  if (!A) return;
  var CFG = window.AQUVA_NEWSLETTER || {};
  var ENDPOINT = String(CFG.endpoint || "").trim();
  var DELAY = CFG.popupDelayMs || 30000;
  var COOLDOWN = (CFG.popupCooldownHours || 24) * 36e5;
  var K_SUB = "aquva-nl";                 // UI hint only (set after the server confirmed a sign-up)
  var K_SHOWN_AT = "aquva-nl-shown-at";   // localStorage: when the popup was last displayed
  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var store = {
    get: function (k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch (e) { return null; } },
    set: function (k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} }
  };

  // compact (footer): same fields, same consent wording and backend; the privacy note is just the link
  function formHTML(id, source, compact) {
    return '<form class="nl-form" novalidate data-nl-form data-source="' + source + '" data-i18n-attr="aria-label:nl.label">' +
      '<div class="nl-form__row">' +
        '<label class="sr-only" for="nl-email-' + id + '" data-i18n="nl.emailLabel"></label>' +
        '<input class="nl-form__input" id="nl-email-' + id + '" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" required aria-describedby="nl-msg-' + id + '" data-i18n-attr="placeholder:nl.placeholder">' +
        '<button type="submit" class="btn btn--primary nl-form__btn"><span data-nl-label data-i18n="nl.button"></span></button>' +
      '</div>' +
      // Honeypot for bots: hidden from people and assistive tech, must stay empty
      '<input class="nl-form__hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="check nl-form__consent"><input type="checkbox" name="consent" required aria-describedby="nl-msg-' + id + '">' +
        '<span class="check__box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        '<span data-i18n="nl.consent"></span></label>' +
      '<p class="nl-form__msg" id="nl-msg-' + id + '" role="status" aria-live="polite"></p>' +
      '<p class="nl-form__note">' + (compact ? '' : '<span data-i18n="nl.privacy"></span> ') + '<button type="button" class="link-btn" data-privacy-open data-i18n="footer.privacy"></button></p>' +
    '</form>';
  }

  function setMsg(form, key, kind) {
    var m = $(".nl-form__msg", form);
    m.className = "nl-form__msg" + (kind ? " is-" + kind : "");
    if (key) { m.setAttribute("data-msg-key", key); m.textContent = A.t(key); }
    else { m.removeAttribute("data-msg-key"); m.textContent = ""; }
  }

  function submit(form) {
    var email = form.elements.email, consent = form.elements.consent;
    var value = email.value.trim();
    email.setAttribute("aria-invalid", "false");
    if (!EMAIL_RX.test(value)) {
      email.setAttribute("aria-invalid", "true"); email.focus();
      setMsg(form, "err.email", "error"); return;
    }
    if (!consent.checked) { consent.focus(); setMsg(form, "nl.errorConsent", "error"); return; }

    if (!ENDPOINT) {                       // honest: no provider connected, nothing is saved
      setMsg(form, "nl.unavailable", "info");
      return;
    }

    var btn = $(".nl-form__btn", form), label = $("[data-nl-label]", form);
    btn.disabled = true; label.setAttribute("data-i18n", "nl.sending"); label.textContent = A.t("nl.sending");
    setMsg(form, null);
    var consentText = consent.parentNode.textContent.trim();
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value, language: A.lang(), source: form.getAttribute("data-source"), consent: true, consentVersion: CFG.consentVersion || "v1", consentText: consentText, page: location.pathname, website: form.elements.website.value })
    }).then(function (res) {
      // No PHP backend on this host (GitHub Pages, static test server): say so honestly, nothing was saved
      if (res.status === 404 || res.status === 405 || res.status === 501) { setMsg(form, "nl.unavailable", "info"); return; }
      if (res.status === 429) { setMsg(form, "nl.errorRate", "error"); return; }
      if (res.status === 422) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          setMsg(form, j && j.error === "consent_required" ? "nl.errorConsent" : "err.email", "error");
        });
      }
      if (!res.ok) throw new Error("HTTP " + res.status);      // 403/415/5xx: "please try again"
      // Success only when the PHP endpoint itself confirms the record was saved. A static host
      // that answers 200 with the raw .php file (no PHP) is treated as "not open yet".
      return res.json().catch(function () { return null; }).then(function (j) {
        if (!j || j.ok !== true || j.status !== "subscribed") { setMsg(form, "nl.unavailable", "info"); return; }
        store.set(K_SUB, "1");               // only a UI hint so the popup is not shown again; the data lives on the server
        form.reset();
        setMsg(form, CFG.doubleOptIn === false ? "nl.successDirect" : "nl.success", "ok");
        if (popup.contains(form)) setTimeout(function () { closePopup(false); }, 2600);
      });
    }).catch(function () {
      setMsg(form, "nl.errorNetwork", "error");
    }).then(function () {
      btn.disabled = false; label.setAttribute("data-i18n", "nl.button"); label.textContent = A.t("nl.button");
    });
  }

  document.addEventListener("submit", function (e) {
    var form = e.target.closest && e.target.closest("[data-nl-form]");
    if (!form) return;
    e.preventDefault();
    submit(form);
  });
  // Re-translate visible messages when the language changes
  document.addEventListener("aquva:langchange", function () {
    Array.prototype.forEach.call(document.querySelectorAll(".nl-form__msg[data-msg-key]"), function (m) {
      m.textContent = A.t(m.getAttribute("data-msg-key"));
    });
  });

  /* ---------- Footer form ---------- */
  var footerSlot = $('[data-newsletter="footer"]');
  if (footerSlot) { footerSlot.innerHTML = formHTML("footer", "footer", true); A.translate(footerSlot); }

  /* ---------- Timed popup ---------- */
  var popup = document.createElement("dialog");
  popup.className = "dialog nl-pop";
  popup.setAttribute("aria-labelledby", "nl-pop-title");
  popup.innerHTML =
    '<div class="dialog__inner">' +
      '<button class="dialog__close" type="button" data-nl-close data-i18n-attr="aria-label:a11y.close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<img class="nl-pop__mark" src="/assets/img/aquva-mark-320.webp" alt="" width="320" height="256" loading="lazy">' +
      '<h2 class="nl-pop__title" id="nl-pop-title" data-i18n="nl.title"></h2>' +
      '<p class="nl-pop__text" data-i18n="nl.text"></p>' +
      formHTML("popup", "popup") +
    '</div>';
  document.body.appendChild(popup);
  A.translate(popup);

  function closePopup() {
    if (!popup.open) return;
    var finish = function () { popup.classList.remove("is-closing"); if (typeof popup.close === "function") popup.close(); else popup.removeAttribute("open"); };
    if (A.reduceMotion) finish(); else { popup.classList.add("is-closing"); setTimeout(finish, 220); }
  }
  popup.addEventListener("click", function (e) {
    if (e.target === popup || (e.target.closest && e.target.closest("[data-nl-close]"))) closePopup(true);
  });
  popup.addEventListener("cancel", function (e) { e.preventDefault(); closePopup(true); }); // Esc

  // Last time the popup was actually DISPLAYED (ms). Missing, non-numeric, zero/negative or
  // future values (clock changes, tampering) are ignored, so they can never block or spam.
  function lastShown() {
    var t = Number(store.get(K_SHOWN_AT));
    return (isFinite(t) && t > 0 && t <= Date.now() + 6e4) ? t : 0;
  }
  // Never after a successful sign-up; otherwise at most once per COOLDOWN (24 h), across refreshes,
  // pages and later visits. Closing the popup does not change anything: the clock starts when it is shown.
  function popupAllowed() {
    if (store.get(K_SUB) === "1") return false;
    var t = lastShown();
    return !t || Date.now() - t >= COOLDOWN;
  }
  function importantFlow() {                                             // never interrupt checkout
    return /\/shop\//.test(location.pathname) && /checkout|confirmation/.test(location.hash);
  }

  var timer = null;                                                      // one pending timer per page, never more
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tryShow, ms); }
  function tryShow() {
    clearTimeout(timer); timer = null;
    if (popup.open || !popupAllowed()) return;                          // re-checked: another tab may have shown it
    if (A.isBusy() || importantFlow() || document.hidden) {
      schedule(1500);                                                    // wait while the cookie banner etc. is shown
      return;
    }
    store.set(K_SHOWN_AT, String(Date.now()));                           // the 24 h cooldown starts now
    if (typeof popup.showModal === "function") popup.showModal(); else popup.setAttribute("open", "");
  }
  if (popupAllowed()) schedule(DELAY);                                   // 30 s after the page loads

  window.AQUVA_NEWSLETTER_UI = { open: function () { tryShow(); }, configured: !!ENDPOINT };
})();
