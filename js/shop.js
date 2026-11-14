/* =========================================================================
   AQUVA — shop views (hash routing on /shop/)
     #/              shop home (two products)
     #/still         product detail
     #/sparkling     product detail
     #/checkout      demo checkout
     #/confirmation  demo confirmation

   DEMO ONLY: no payment processing, no network requests, no order creation.
   Checkout details live in memory for the current page only.
   ========================================================================= */
(function () {
  "use strict";

  var SHOP = window.AQUVA_SHOP, Cart = window.AQUVA_CART, A = window.AQUVA;
  var view = document.getElementById("shop-view");
  if (!SHOP || !Cart || !A || !view) return;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = Cart.ui.esc;
  var ICON_ARROW = '<svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  var pdpState = {};          // { still: { pack: "1", qty: 1 }, ... }
  var demoOrder = null;       // in-memory only; gone on reload
  var currentRoute = null, firstRender = true;

  /* ---------------------------------------------------------------------
     Helpers
     --------------------------------------------------------------------- */
  function price(cents) { return '<span data-cents="' + cents + '">' + SHOP.formatPrice(cents) + "</span>"; }
  function litres(ml) { return '<span data-ml="' + ml + '">' + SHOP.formatLitres(ml) + "</span>"; }
  function counted(n, key) { return '<span data-count="' + n + '" data-count-key="' + key + '">' + SHOP.formatNumber(n) + " " + A.tp(key, n) + "</span>"; }

  function refreshFormatted(root) {
    $$("[data-cents]", root).forEach(function (e) { e.textContent = SHOP.formatPrice(+e.getAttribute("data-cents")); });
    $$("[data-ml]", root).forEach(function (e) { e.textContent = SHOP.formatLitres(+e.getAttribute("data-ml")); });
    $$("[data-count]", root).forEach(function (e) { var n = +e.getAttribute("data-count"); e.textContent = SHOP.formatNumber(n) + " " + A.tp(e.getAttribute("data-count-key"), n); });
    $$("[data-error-key]", root).forEach(function (e) { e.textContent = A.t(e.getAttribute("data-error-key")) || ""; });
  }

  function productName(p) { return 'AQUVA <strong>' + p.shortName + '</strong>'; }

  function stage(p, opts) {
    opts = opts || {};
    var deco = p.id === "sparkling"
      ? '<div class="bubbles bubbles--card" data-bubbles="22" aria-hidden="true"></div>'
      : '<div class="product__rings" aria-hidden="true"><span></span><span></span><span></span></div>';
    return '<div class="product__stage"' + (opts.slot ? ' data-viewer-slot="' + p.id + '"' : "") + '>' +
      '<span class="product__word" aria-hidden="true">' + p.shortName + '</span>' + deco +
      '<img class="product__can" src="' + p.image.large + '" srcset="' + p.image.small + ' 420w, ' + p.image.large + ' 760w" sizes="' + (opts.sizes || "(max-width: 860px) 46vw, 260px") + '" width="760" height="1520" decoding="async"' + (opts.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' alt="" data-i18n-attr="alt:' + p.altKey + '">' +
      '<span class="product__shadow" aria-hidden="true"></span>' +
    '</div>';
  }

  function packVisual(cans) {
    var cols = cans === 1 ? 1 : cans === 6 ? 3 : 6, rows = Math.ceil(cans / cols), w = 5, h = 9, g = 2.2;
    var W = cols * w + (cols - 1) * g, H = rows * h + (rows - 1) * g, r = "";
    for (var i = 0; i < cans; i++) {
      var x = (i % cols) * (w + g), y = Math.floor(i / cols) * (h + g);
      r += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h + '" rx="1.6"/>';
    }
    return '<svg class="pack__visual" viewBox="0 0 ' + W.toFixed(1) + " " + H.toFixed(1) + '" aria-hidden="true" style="--cols:' + cols + '">' + r + "</svg>";
  }

  function crumbs(currentKeyOrHtml, isKey) {
    return '<nav class="crumbs" data-i18n-attr="aria-label:shop.crumbsLabel">' +
      '<a href="#/" data-i18n="shop.crumb"></a><span aria-hidden="true">/</span>' +
      '<span aria-current="page"' + (isKey ? ' data-i18n="' + currentKeyOrHtml + '">' : ">" + currentKeyOrHtml) + "</span></nav>";
  }

  function demoBanner(key) {
    return '<div class="demo-banner" role="note">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>' +
      '<p><strong data-i18n="demo.label"></strong> <span data-i18n="' + key + '"></span></p></div>';
  }

  /* Order summary (checkout sidebar + confirmation). Prices only when SHOP.showPrices. */
  function summary(lines, t) {
    var P = SHOP.showPrices;
    return '<ul class="sum-lines">' + lines.map(function (l) {
      return '<li class="sum-line">' +
        '<img src="' + l.product.image.small + '" alt="" width="420" height="840" loading="lazy" decoding="async">' +
        '<div><p class="sum-line__name">' + esc(l.product.name) + '</p>' +
        '<p class="sum-line__pack">' + Cart.ui.packLabel(l.variant) + '</p>' +
        '<p class="sum-line__qty">' + l.qty + ' × ' + (P ? price(l.variant.priceCents) : '<span data-i18n="pack.' + l.variant.packKey + '.name"></span>') + '</p></div>' +
        '<strong class="sum-line__total">' + (P ? price(l.lineCents) : counted(l.cans, "unit.can")) + '</strong></li>';
    }).join("") + '</ul>' +
    '<div class="sum">' +
      Cart.ui.summaryRows(t) +
      '<div class="sum-row"><span data-i18n="cart.volume"></span><strong>' + litres(t.volumeMl) + '</strong></div>' +
      (P ? '<div class="sum-row sum-row--sep"><span data-i18n="cart.subtotal"></span><strong>' + price(t.subtotalCents) + '</strong></div>' +
        '<div class="sum-row"><span data-i18n="checkout.delivery"></span><strong class="sum-muted" data-i18n="checkout.notConfigured"></strong></div>' +
        '<div class="sum-row sum-row--total"><span><span data-i18n="checkout.total"></span><small data-i18n="checkout.totalNote"></small></span><strong>' + price(t.subtotalCents) + '</strong></div>' : '') +
    '</div>';
  }

  /* ---------------------------------------------------------------------
     Views
     --------------------------------------------------------------------- */
  function viewHome() {
    var cards = SHOP.products.map(function (p, i) {
      var from = p.variants[0];
      return '<a class="product product--' + p.id + ' product--link" href="#/' + p.id + '" data-reveal data-tilt style="--d:' + (i * 0.12) + 's">' +
        stage(p, { eager: true }) +
        '<div class="product__info">' +
          '<p class="product__index"><span data-i18n="' + p.typeKey + '"></span></p>' +
          '<h2 class="product__name">' + productName(p) + '</h2>' +
          '<p class="product__tagline" data-i18n="' + p.taglineKey + '"></p>' +
          '<p class="product__desc" data-i18n="' + p.shopDescKey + '"></p>' +
          '<div class="product__buyrow">' +
            '<span class="btn btn--primary product__cta"><span data-i18n="shop.discover"></span>' + ICON_ARROW + '</span>' +
            (SHOP.showPrices ? '<p class="product__from"><span data-i18n="shop.from"></span> ' + price(from.priceCents) + '</p>' : '') +
          '</div>' +
        '</div></a>';
    }).join("");

    return '<section class="shop-hero" aria-labelledby="shop-title">' +
        '<div class="shop-hero__bg" aria-hidden="true"><div class="hero__glow hero__glow--a"></div><div class="shop-hero__word">SHOP</div></div>' +
        '<div class="container shop-hero__inner">' +
          '<p class="eyebrow" data-reveal data-i18n="shop.eyebrow"></p>' +
          '<h1 class="shop-hero__title" id="shop-title" tabindex="-1" data-focus data-reveal style="--d:.06s">' +
            '<span data-i18n="shop.title1"></span> <span class="hero__title-accent" data-i18n="shop.title2"></span></h1>' +
          '<p class="shop-hero__sub" data-reveal style="--d:.14s" data-i18n="shop.sub"></p>' +
          '<ul class="shop-hero__facts" data-reveal style="--d:.2s"><li>Still</li><li>Sparkling</li><li>330 ml</li><li data-i18n="tags.can"></li></ul>' +
        '</div>' +
      '</section>' +
      '<section class="shop-products" aria-label="AQUVA Still & Sparkling"><div class="container"><div class="product-grid">' + cards + '</div>' +
      '<aside class="inquiry" data-reveal aria-labelledby="inquiry-title">' +
        '<span class="inquiry__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M4 7.5l8 6 8-6"/></svg></span>' +
        '<h2 class="inquiry__title" id="inquiry-title" data-i18n="shop.inquiryTitle"></h2>' +
        '<p class="inquiry__text" data-i18n="shop.inquiryText"></p>' +
        '<a class="inquiry__email" href="mailto:info@aquva.hr">info@aquva.hr</a>' +
      '</aside></div></section>';
  }

  function viewProduct(p) {
    var st = pdpState[p.id] || (pdpState[p.id] = { pack: SHOP.packs[0].id, qty: 1 });
    var other = SHOP.products.filter(function (o) { return o.id !== p.id; })[0];
    var packs = p.variants.map(function (v) {
      return '<label class="pack' + (v.packId === st.pack ? " is-selected" : "") + '">' +
        '<input class="sr-only" type="radio" name="pack" value="' + v.packId + '"' + (v.packId === st.pack ? " checked" : "") + (v.available ? "" : " disabled") + '>' +
        '<span class="pack__check" aria-hidden="true">' + ICON_CHECK + '</span>' +
        packVisual(v.cans) +
        '<span class="pack__name" data-i18n="pack.' + v.packKey + '.name"></span>' +
        '<span class="pack__qty">' + v.cans + ' × ' + SHOP.canMl + ' ml</span>' +
        (SHOP.showPrices ? '<span class="pack__price">' + price(v.priceCents) + '</span>' : '') +
      '</label>';
    }).join("");

    return '<section class="pdp product--' + p.id + '"><div class="container">' +
      crumbs(esc(p.name), false) +
      '<div class="pdp__grid">' +
        '<div class="pdp__media"><div class="product product--' + p.id + ' pdp__product" data-tilt>' + stage(p, { eager: true, slot: true, sizes: "(max-width: 860px) 44vw, 300px" }) + '</div></div>' +
        '<div class="pdp__info">' +
          '<p class="product__index"><span data-i18n="' + p.typeKey + '"></span></p>' +
          '<h1 class="pdp__name" tabindex="-1" data-focus>' + productName(p) + '</h1>' +
          '<p class="product__tagline" data-i18n="' + p.taglineKey + '"></p>' +
          '<p class="product__desc" data-i18n="' + p.descKey + '"></p>' +
          '<ul class="tags"><li>330 ml</li><li data-i18n="tags.can"></li><li data-i18n="' + p.typeKey + '"></li></ul>' +
          '<fieldset class="packs"><legend class="field-label" data-i18n="pdp.choosePack"></legend><div class="packs__grid">' + packs + '</div></fieldset>' +
          '<div class="pdp__qty">' +
            '<label class="field-label" for="qty" data-i18n="pdp.quantity"></label>' +
            '<div class="pdp__qty-row">' +
              // The value is the number of CANS; it steps by the selected pack size (1, 6 or 24)
              '<div class="stepper">' +
                '<button type="button" class="stepper__btn" data-qty="-1" data-i18n-attr="aria-label:qty.decrease"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button>' +
                '<input class="stepper__input" id="qty" type="number" inputmode="numeric" min="1" max="' + Cart.maxQty + '" step="1" value="' + st.qty + '">' +
                '<button type="button" class="stepper__btn" data-qty="1" data-i18n-attr="aria-label:qty.increase"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="pdp__buy' + (SHOP.showPrices ? '' : ' pdp__buy--noprice') + '">' +
            (SHOP.showPrices ? '<div class="pdp__total"><span class="field-label" data-i18n="pdp.total"></span><strong class="pdp__price" data-pdp-price></strong></div>' : '') +
            '<button class="btn btn--primary pdp__add" type="button" data-add><span data-add-label data-i18n="pdp.add"></span>' + ICON_ARROW + '</button>' +
          '</div>' +
          '<a class="pdp__switch" href="#/' + other.id + '"><span data-i18n="pdp.also"></span> <strong>' + esc(other.name) + '</strong>' + ICON_ARROW + '</a>' +
        '</div>' +
      '</div></div></section>';
  }

  // st.qty = number of the selected packs (what goes into the cart); the field shows cans = st.qty × pack size
  function updatePdp(p) {
    var st = pdpState[p.id], v = SHOP.variant(p.id + "-" + st.pack);
    var input = $("#qty", view), pr = $("[data-pdp-price]", view);
    if (input) {
      input.min = v.cans; input.step = v.cans; input.max = v.cans * Cart.maxQty;
      if (document.activeElement !== input || input.value !== "") input.value = v.cans * st.qty;
    }
    if (pr) pr.innerHTML = price(v.priceCents * st.qty);
    $$(".pack", view).forEach(function (l) { l.classList.toggle("is-selected", $("input", l).checked); });
  }

  function bindProduct(p) {
    var st = pdpState[p.id], input = $("#qty", view);
    function packCans() { return SHOP.variant(p.id + "-" + st.pack).cans; }
    function setPacks(q) {
      q = Math.floor(Number(q));
      if (!(q >= 1)) q = 1;
      st.qty = Math.min(Cart.maxQty, q); updatePdp(p);
    }
    function setCans(c, snap) {                       // typed number of cans -> whole packs
      var n = Number(c), size = packCans();
      if (!(n > 0)) { if (snap) setPacks(1); return; }
      if (!snap && n % size !== 0) return;            // still typing (e.g. "1" on the way to "18")
      setPacks(Math.round(n / size));
    }
    $$('input[name="pack"]', view).forEach(function (r) {
      r.addEventListener("change", function () {
        var cans = packCans() * st.qty;               // keep roughly the same number of cans
        st.pack = r.value;
        setPacks(Math.ceil(cans / packCans()));
      });
    });
    $$("[data-qty]", view).forEach(function (b) {
      b.addEventListener("click", function () { setPacks(st.qty + Number(b.getAttribute("data-qty"))); });
    });
    input.addEventListener("input", function () { if (input.value !== "") setCans(input.value, false); });
    input.addEventListener("change", function () { setCans(input.value, true); });
    input.addEventListener("blur", function () { setCans(input.value, true); });
    var add = $("[data-add]", view), label = $("[data-add-label]", view), timer;
    add.addEventListener("click", function () {
      var v = SHOP.variant(p.id + "-" + st.pack);
      Cart.add(v.id, st.qty);
      Cart.bump();
      Cart.announce(A.t("pdp.added"));
      label.setAttribute("data-i18n", "pdp.added"); label.textContent = A.t("pdp.added");
      add.classList.add("is-done");
      clearTimeout(timer);
      timer = setTimeout(function () { label.setAttribute("data-i18n", "pdp.add"); label.textContent = A.t("pdp.add"); add.classList.remove("is-done"); }, 1800);
      setTimeout(function () { Cart.open(add); }, 380);
    });
    updatePdp(p);
  }

  /* ---------- Checkout ---------- */
  var FIELDS = [
    { name: "firstName", key: "f.firstName", ac: "given-name", req: true, max: 60 },
    { name: "lastName", key: "f.lastName", ac: "family-name", req: true, max: 60 },
    { name: "email", key: "f.email", ac: "email", type: "email", req: true, rule: "email", inputmode: "email" },
    { name: "phone", key: "f.phone", ac: "tel", type: "tel", req: true, rule: "phone", inputmode: "tel" },
    { name: "street", key: "f.street", ac: "street-address", req: true, wide: true, max: 120 },
    { name: "city", key: "f.city", ac: "address-level2", req: true, max: 80 },
    { name: "postal", key: "f.postal", ac: "postal-code", req: true, rule: "postal" },
    { name: "country", key: "f.country", ac: "country-name", req: true, wide: true, max: 60 }
  ];

  function field(f) {
    return '<div class="field' + (f.wide ? " field--wide" : "") + '">' +
      '<label for="f-' + f.name + '"><span data-i18n="checkout.' + f.key + '"></span>' + (f.req ? ' <span class="field__req" aria-hidden="true">*</span>' : "") + '</label>' +
      '<input id="f-' + f.name + '" name="' + f.name + '" type="' + (f.type || "text") + '" autocomplete="' + f.ac + '"' +
        (f.inputmode ? ' inputmode="' + f.inputmode + '"' : "") + (f.max ? ' maxlength="' + f.max + '"' : "") +
        (f.req ? ' required aria-required="true"' : "") + ' aria-describedby="e-' + f.name + '" spellcheck="false">' +
      '<p class="field__error" id="e-' + f.name + '"></p></div>';
  }

  function viewCheckout() {
    if (!Cart.lines().length) {
      return '<section class="shop-state"><div class="container shop-state__inner">' +
        '<svg class="cart-empty__icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 16h24l-2 24H14z"/><path d="M18 16v-3a6 6 0 0 1 12 0v3"/></svg>' +
        '<h1 class="shop-state__title" tabindex="-1" data-focus data-i18n="cart.empty"></h1>' +
        '<p class="shop-state__text" data-i18n="checkout.emptyText"></p>' +
        '<a class="btn btn--primary" href="#/"><span data-i18n="cart.discover"></span>' + ICON_ARROW + '</a></div></section>';
    }
    var f = FIELDS.map(field);
    return '<section class="checkout"><div class="container">' +
      crumbs("checkout.title", true) +
      '<header class="checkout__head">' +
        '<p class="eyebrow" data-i18n="checkout.eyebrow"></p>' +
        '<h1 class="title checkout__title" tabindex="-1" data-focus data-i18n="checkout.title"></h1>' +
        demoBanner("checkout.demoText") +
      '</header>' +
      '<div class="checkout__grid">' +
        '<form class="co-form" novalidate data-checkout-form>' +
          '<fieldset class="co-step"><legend><span class="co-step__num">01</span><span data-i18n="checkout.contact"></span></legend>' +
            '<div class="fields">' + f[0] + f[1] + f[2] + f[3] + '</div></fieldset>' +
          '<fieldset class="co-step"><legend><span class="co-step__num">02</span><span data-i18n="checkout.address"></span></legend>' +
            '<div class="fields">' + f[4] + f[5] + f[6] + f[7] + '</div></fieldset>' +
          '<fieldset class="co-step"><legend><span class="co-step__num">03</span><span data-i18n="checkout.deliveryTitle"></span></legend>' +
            '<div class="co-info"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg><p data-i18n="checkout.deliveryInfo"></p></div>' +
            '<div class="field field--wide"><label for="f-notes" data-i18n="checkout.f.notes"></label>' +
              '<textarea id="f-notes" name="notes" rows="3" maxlength="300" data-i18n-attr="placeholder:checkout.f.notesPh"></textarea></div>' +
          '</fieldset>' +
          '<fieldset class="co-step"><legend><span class="co-step__num">04</span><span data-i18n="checkout.payment"></span></legend>' +
            '<div class="pay-options">' +
              '<div class="pay-option" aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 14.5h4"/></svg>' +
                '<span data-i18n="checkout.payCard"></span><em class="soon" data-i18n="checkout.soon"></em></div>' +
              '<div class="pay-option" aria-disabled="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></svg>' +
                '<span data-i18n="checkout.payOther"></span><em class="soon" data-i18n="checkout.soon"></em></div>' +
            '</div>' +
            '<p class="co-hint" data-i18n="checkout.payNote"></p>' +
          '</fieldset>' +
          '<div class="field field--check"><label class="check"><input type="checkbox" name="ack" id="f-ack" required aria-required="true" aria-describedby="e-ack"><span class="check__box" aria-hidden="true">' + ICON_CHECK + '</span><span data-i18n="checkout.ack"></span></label>' +
            '<p class="field__error" id="e-ack"></p></div>' +
          '<button type="submit" class="btn btn--primary btn--block co-submit"><span data-i18n="checkout.submit"></span>' + ICON_ARROW + '</button>' +
          '<p class="co-hint co-hint--center" data-i18n="checkout.privacy"></p>' +
        '</form>' +
        '<aside class="co-summary" aria-labelledby="sum-title"><div class="co-summary__card">' +
          '<h2 class="co-summary__title" id="sum-title" data-i18n="checkout.summary"></h2>' +
          '<div data-summary>' + summary(Cart.lines(), Cart.totals()) + '</div>' +
          '<a class="co-summary__edit" href="#/" data-i18n="checkout.editCart"></a>' +
        '</div></aside>' +
      '</div></div></section>';
  }

  function validate(el) {
    var v = (el.type === "checkbox") ? el.checked : el.value.trim(), key = null;
    if (el.type === "checkbox") { if (!v) key = "err.ack"; }
    else if (el.required && !v) key = "err.required";
    else if (v && el.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) key = "err.email";
    else if (v && el.name === "phone" && (!/^\+?[0-9\s\-()\/.]{6,22}$/.test(v) || v.replace(/\D/g, "").length < 6)) key = "err.phone";
    else if (v && el.name === "postal" && !/^[A-Za-z0-9][A-Za-z0-9\s\-]{1,9}$/.test(v)) key = "err.postal";
    var err = document.getElementById("e-" + el.name);
    el.setAttribute("aria-invalid", key ? "true" : "false");
    el.closest(".field").classList.toggle("is-invalid", !!key);
    if (err) {
      if (key) { err.setAttribute("data-error-key", key); err.textContent = A.t(key); }
      else { err.removeAttribute("data-error-key"); err.textContent = ""; }
    }
    return !key;
  }

  function bindCheckout() {
    var form = $("[data-checkout-form]", view);
    if (!form) return;
    var inputs = $$("input[required]", form);
    inputs.forEach(function (el) {
      el.addEventListener("blur", function () { if (el.value || el.dataset.touched) { el.dataset.touched = "1"; validate(el); } });
      el.addEventListener(el.type === "checkbox" ? "change" : "input", function () { if (el.getAttribute("aria-invalid") === "true") validate(el); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault(); // DEMO: never submit anywhere
      var firstBad = null;
      inputs.forEach(function (el) { el.dataset.touched = "1"; if (!validate(el) && !firstBad) firstBad = el; });
      if (firstBad) { firstBad.focus(); Cart.announce(A.t("err.summary")); return; }
      var data = {};
      FIELDS.forEach(function (fd) { data[fd.name] = form.elements[fd.name].value.trim(); });
      data.notes = form.elements.notes.value.trim();
      demoOrder = {
        ref: "DEMO-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        lines: Cart.lines(),
        totals: Cart.totals(),
        customer: data
      };
      form.reset();
      currentRoute = null;   // leaving checkout: don't re-render it when the cart empties
      Cart.clear();
      location.hash = "#/confirmation";
    });
  }

  /* ---------- Confirmation ---------- */
  function viewConfirmation() {
    if (!demoOrder) {
      return '<section class="shop-state"><div class="container shop-state__inner">' +
        '<h1 class="shop-state__title" tabindex="-1" data-focus data-i18n="confirm.none"></h1>' +
        '<p class="shop-state__text" data-i18n="confirm.noneText"></p>' +
        '<a class="btn btn--primary" href="#/"><span data-i18n="confirm.backShop"></span>' + ICON_ARROW + '</a></div></section>';
    }
    var c = demoOrder.customer;
    var info = [
      ["checkout.f.firstName", c.firstName + " " + c.lastName, "confirm.name"],
      ["checkout.f.email", c.email], ["checkout.f.phone", c.phone],
      ["confirm.address", c.street + ", " + c.postal + " " + c.city + ", " + c.country]
    ];
    if (c.notes) info.push(["checkout.f.notes", c.notes]);
    return '<section class="confirm"><div class="container confirm__inner">' +
      '<div class="confirm__badge" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 6s-12 14-12 22a12 12 0 0 0 24 0c0-8-12-22-12-22Z"/><path d="M18.5 28.5l4 4 7.5-8"/></svg></div>' +
      '<p class="eyebrow" data-i18n="confirm.eyebrow"></p>' +
      '<h1 class="confirm__title" tabindex="-1" data-focus data-i18n="confirm.title"></h1>' +
      '<p class="confirm__text" data-i18n="confirm.text"></p>' +
      '<p class="confirm__ref"><span data-i18n="confirm.ref"></span> <strong>' + esc(demoOrder.ref) + '</strong></p>' +
      '<div class="confirm__grid">' +
        '<div class="co-summary__card"><h2 class="co-summary__title" data-i18n="confirm.items"></h2>' + summary(demoOrder.lines, demoOrder.totals) + '</div>' +
        '<div class="co-summary__card"><h2 class="co-summary__title" data-i18n="confirm.customer"></h2><dl class="confirm__dl">' +
          info.map(function (r) { return '<div><dt data-i18n="' + (r[2] || r[0]) + '"></dt><dd>' + esc(r[1]) + '</dd></div>'; }).join("") +
        '</dl><p class="co-hint" data-i18n="confirm.dataNote"></p></div>' +
      '</div>' +
      '<div class="confirm__actions"><a class="btn btn--primary" href="#/"><span data-i18n="confirm.backShop"></span>' + ICON_ARROW + '</a>' +
        '<a class="btn btn--ghost" href="/"><span data-i18n="confirm.home"></span></a></div>' +
    '</div></section>';
  }

  /* ---------------------------------------------------------------------
     Router
     --------------------------------------------------------------------- */
  function parse() {
    var h = (location.hash || "").replace(/^#\/?/, "").split(/[?#]/)[0];
    if (SHOP.product(h)) return { name: "product", product: SHOP.product(h) };
    if (h === "checkout") return { name: "checkout" };
    if (h === "confirmation") return { name: "confirmation" };
    return { name: "home" };
  }

  function syncDocumentMeta(r) {
    var titleKey = "shop.meta.title", descKey = "shop.meta.description";
    var COMPANY = "AQUVA D.P. d.o.o.";
    if (r.name === "product" && r.product) {
      document.title = COMPANY + " | " + r.product.name;
      return;
    }
    if (r.name === "checkout") titleKey = "checkout.title";
    if (r.name === "confirmation") titleKey = "confirm.eyebrow";
    var title = A.t(titleKey), desc = A.t(descKey);
    if (title) document.title = r.name === "checkout" || r.name === "confirmation" ? (COMPANY + " | " + title) : title;
    var meta = document.querySelector('meta[name="description"]');
    if (meta && desc) meta.setAttribute("content", desc);
  }

  function render(opts) {
    opts = opts || {};
    var r = parse();
    currentRoute = r;
    var html = r.name === "product" ? viewProduct(r.product)
      : r.name === "checkout" ? viewCheckout()
      : r.name === "confirmation" ? viewConfirmation()
      : viewHome();
    view.innerHTML = html;
    view.setAttribute("data-route", r.name);
    A.enhance(view);
    syncDocumentMeta(r);
    if (r.name === "product") bindProduct(r.product);
    if (r.name === "checkout") bindCheckout();
    if (!opts.keepScroll) window.scrollTo(0, 0);
    if (!firstRender && !opts.noFocus) { var f = $("[data-focus]", view); if (f) f.focus({ preventScroll: true }); }
    firstRender = false;
    // When we leave the confirmation, the demo data is discarded
    if (r.name !== "confirmation") demoOrder = null;
  }

  window.addEventListener("hashchange", function () { render(); });

  document.addEventListener("aquva:langchange", function () {
    if (!currentRoute) return;
    if (currentRoute.name === "checkout") {
      refreshFormatted(view);            // keep typed form values, update numbers & errors
      var s = $("[data-summary]", view);
      if (s) { s.innerHTML = summary(Cart.lines(), Cart.totals()); A.translate(s); }
      syncDocumentMeta(currentRoute);    // keep the checkout title in the new language
    } else {
      render({ keepScroll: true, noFocus: true });
    }
  });

  Cart.onChange(function () {
    if (!currentRoute || currentRoute.name !== "checkout") return;
    if (!Cart.lines().length) { render({ noFocus: true }); return; }
    var s = $("[data-summary]", view);
    if (s) { s.innerHTML = summary(Cart.lines(), Cart.totals()); A.translate(s); }
  });

  render({ keepScroll: !!location.hash });
})();
