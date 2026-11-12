/* =========================================================================
   AQUVA — shopping cart (store + header badge + drawer)
   Cart contents are kept in localStorage as [{ id: variantId, qty }].
   No personal data is ever stored here.
   ========================================================================= */
(function () {
  "use strict";

  var SHOP = window.AQUVA_SHOP;
  if (!SHOP || !window.AQUVA) return;
  var KEY = "aquva-cart", MAX_QTY = 99;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var listeners = [];
  var items = load();

  function sanitize(list) {
    var merged = {};
    (Array.isArray(list) ? list : []).forEach(function (i) {
      if (!i || !SHOP.variant(i.id)) return;
      var q = Math.floor(Number(i.qty));
      if (!(q > 0)) return;
      merged[i.id] = Math.min(MAX_QTY, (merged[i.id] || 0) + q);
    });
    return Object.keys(merged).map(function (id) { return { id: id, qty: merged[id] }; });
  }
  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (e) { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    emit();
  }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); render(); }
  function find(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }

  /* ---------- Public store API ---------- */
  var Cart = {
    maxQty: MAX_QTY,
    add: function (id, qty) {
      if (!SHOP.variant(id)) return;
      qty = Math.max(1, Math.floor(qty || 1));
      var it = find(id);
      if (it) it.qty = Math.min(MAX_QTY, it.qty + qty); else items.push({ id: id, qty: Math.min(MAX_QTY, qty) });
      save();
    },
    setQty: function (id, qty) {
      var it = find(id); if (!it) return;
      qty = Math.floor(qty);
      if (!(qty > 0)) { Cart.remove(id); return; }
      it.qty = Math.min(MAX_QTY, qty); save();
    },
    remove: function (id) { items = items.filter(function (i) { return i.id !== id; }); save(); },
    clear: function () { items = []; save(); },
    lines: function () {
      return items.map(function (i) {
        var v = SHOP.variant(i.id), p = SHOP.product(v.productId);
        return { id: i.id, qty: i.qty, variant: v, product: p, lineCents: v.priceCents * i.qty, cans: v.cans * i.qty, volumeMl: v.volumeMl * i.qty };
      });
    },
    totals: function () {
      return Cart.lines().reduce(function (t, l) {
        t.packages += l.qty; t.cans += l.cans; t.volumeMl += l.volumeMl; t.subtotalCents += l.lineCents; return t;
      }, { packages: 0, cans: 0, volumeMl: 0, subtotalCents: 0 });
    },
    onChange: function (fn) { listeners.push(fn); },
    open: open,
    close: close
  };
  window.AQUVA_CART = Cart;

  // Keep several open tabs in sync
  window.addEventListener("storage", function (e) { if (e.key === KEY) { items = load(); emit(); } });

  /* ---------- Shared renderers (also used by the shop views) ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function packLabel(v) {
    return '<span data-i18n="pack.' + v.packKey + '.name"></span> · ' + v.cans + " × " + SHOP.canMl + " ml";
  }

  function summaryRows(t) {
    return '' +
      '<div class="sum-row"><span data-i18n="cart.packages"></span><strong>' + SHOP.formatNumber(t.packages) + '</strong></div>' +
      '<div class="sum-row"><span data-i18n="cart.cans"></span><strong>' + SHOP.formatNumber(t.cans) + '</strong></div>' +
      '<div class="sum-row"><span data-i18n="cart.volume"></span><strong>' + SHOP.formatLitres(t.volumeMl) + '</strong></div>';
  }

  Cart.ui = { esc: esc, packLabel: packLabel, summaryRows: summaryRows };

  /* ---------- Header badge ---------- */
  function renderBadges() {
    var t = Cart.totals();
    $$("[data-cart-count]").forEach(function (b) {
      b.textContent = SHOP.formatNumber(t.packages);
      b.hidden = t.packages === 0;
    });
    $$("[data-cart-open]").forEach(function (btn) {
      var label = AQUVA.t("cart.title") + (t.packages ? " — " + t.packages + " " + AQUVA.tp("unit.package", t.packages) : "");
      btn.setAttribute("aria-label", label);
    });
  }
  function bump() {
    $$("[data-cart-open]").forEach(function (b) {
      b.classList.remove("is-bumped"); void b.offsetWidth; b.classList.add("is-bumped");
    });
  }
  Cart.bump = bump;

  /* ---------- Drawer ---------- */
  var drawer = document.createElement("div");
  drawer.className = "drawer";
  drawer.id = "cart";
  drawer.hidden = true;
  drawer.innerHTML =
    '<div class="drawer__overlay" data-cart-close></div>' +
    '<aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">' +
      '<header class="drawer__head">' +
        '<div><p class="eyebrow" data-i18n="cart.eyebrow"></p><h2 class="drawer__title" id="cart-title" data-i18n="cart.title"></h2></div>' +
        '<button class="drawer__close" type="button" data-cart-close data-i18n-attr="aria-label:a11y.close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '</header>' +
      '<div class="drawer__body" data-cart-body></div>' +
      '<footer class="drawer__foot" data-cart-foot></footer>' +
    '</aside>';
  document.body.appendChild(drawer);

  var live = document.createElement("p");
  live.className = "sr-only"; live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
  document.body.appendChild(live);
  Cart.announce = function (msg) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); };

  var body = $("[data-cart-body]", drawer), foot = $("[data-cart-foot]", drawer);
  var lastFocus = null, closeTimer;

  function stepper(id, qty, name) {
    return '<div class="stepper stepper--sm" role="group" aria-label="' + esc(name) + '">' +
      '<button type="button" class="stepper__btn" data-cart-dec="' + id + '" data-i18n-attr="aria-label:qty.decrease"' + (qty <= 1 ? "" : "") + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button>' +
      '<span class="stepper__val" aria-live="polite">' + qty + '</span>' +
      '<button type="button" class="stepper__btn" data-cart-inc="' + id + '" data-i18n-attr="aria-label:qty.increase"' + (qty >= MAX_QTY ? " disabled" : "") + '><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>' +
    '</div>';
  }

  function render() {
    renderBadges();
    var lines = Cart.lines(), t = Cart.totals();
    if (!lines.length) {
      body.innerHTML =
        '<div class="cart-empty">' +
          '<svg class="cart-empty__icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 16h24l-2 24H14z"/><path d="M18 16v-3a6 6 0 0 1 12 0v3"/></svg>' +
          '<p class="cart-empty__title" data-i18n="cart.empty"></p>' +
          '<p class="cart-empty__text" data-i18n="cart.emptyText"></p>' +
        '</div>';
      foot.innerHTML = '<a class="btn btn--primary btn--block" href="/shop/" data-cart-continue-shop><span data-i18n="cart.discover"></span><svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
    } else {
      body.innerHTML = '<ul class="cart-lines">' + lines.map(function (l) {
        return '<li class="cart-line">' +
          '<img class="cart-line__img" src="' + l.product.image.small + '" alt="" width="420" height="840" loading="lazy" decoding="async">' +
          '<div class="cart-line__main">' +
            '<p class="cart-line__name">' + esc(l.product.name) + '</p>' +
            '<p class="cart-line__pack">' + packLabel(l.variant) + '</p>' +
            '<p class="cart-line__unit">' + SHOP.formatPrice(l.variant.priceCents) + ' / <span data-i18n="cart.perPackage"></span></p>' +
            '<div class="cart-line__row">' + stepper(l.id, l.qty, l.product.name) + '<strong class="cart-line__total">' + SHOP.formatPrice(l.lineCents) + '</strong></div>' +
          '</div>' +
          '<button type="button" class="cart-line__remove" data-cart-remove="' + l.id + '" data-i18n-attr="aria-label:cart.remove"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>' +
        '</li>';
      }).join("") + '</ul>';
      foot.innerHTML =
        '<div class="sum">' + summaryRows(t) +
          '<div class="sum-row sum-row--total"><span data-i18n="cart.subtotal"></span><strong>' + SHOP.formatPrice(t.subtotalCents) + '</strong></div>' +
        '</div>' +
        '<p class="drawer__note" data-i18n="cart.shippingNote"></p>' +
        '<div class="drawer__actions">' +
          '<button type="button" class="btn btn--ghost btn--block" data-cart-close><span data-i18n="cart.continue"></span></button>' +
          '<a class="btn btn--primary btn--block" href="/shop/#/checkout" data-cart-checkout><span data-i18n="cart.checkout"></span><svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>' +
        '</div>';
    }
    AQUVA.translate(drawer);
  }

  drawer.addEventListener("click", function (e) {
    var el = e.target.closest("button, a");
    if (e.target.hasAttribute("data-cart-close") || (el && el.hasAttribute("data-cart-close"))) { close(); return; }
    if (!el) return;
    var id;
    if ((id = el.getAttribute("data-cart-inc"))) { var a = find(id); if (a) Cart.setQty(id, a.qty + 1); refocus("[data-cart-inc='" + id + "']"); }
    else if ((id = el.getAttribute("data-cart-dec"))) { var b = find(id); if (b) Cart.setQty(id, b.qty - 1); refocus(find(id) ? "[data-cart-dec='" + id + "']" : ".drawer__close"); }
    else if ((id = el.getAttribute("data-cart-remove"))) { Cart.remove(id); refocus(".drawer__close"); }
    else if (el.hasAttribute("data-cart-checkout") || el.hasAttribute("data-cart-continue-shop")) { close(true); }
  });
  function refocus(sel) { var n = $(sel, drawer); if (n) n.focus(); }

  function open(opener) {
    clearTimeout(closeTimer);
    lastFocus = opener || document.activeElement;
    render();
    drawer.hidden = false;
    void drawer.offsetWidth;
    document.documentElement.classList.add("drawer-open");
    setTimeout(function () { var c = $(".drawer__close", drawer); if (c) c.focus({ preventScroll: true }); }, 80);
  }
  function close(skipFocus) {
    if (!document.documentElement.classList.contains("drawer-open")) return;
    document.documentElement.classList.remove("drawer-open");
    closeTimer = setTimeout(function () { drawer.hidden = true; }, 520);
    if (!skipFocus && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", function (e) {
    if (!document.documentElement.classList.contains("drawer-open")) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") {
      var f = $$("button:not([disabled]), a[href]", drawer).filter(function (n) { return n.offsetParent !== null; });
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  $$("[data-cart-open]").forEach(function (b) {
    b.addEventListener("click", function () { open(b); });
  });

  document.addEventListener("aquva:langchange", render);
  render();
})();
