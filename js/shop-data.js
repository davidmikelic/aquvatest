/* =========================================================================
   AQUVA — central product & price data (single source of truth)

   To change a price, edit PACKS below. Prices are stored in euro CENTS
   (integers) so totals never suffer from floating-point rounding.
   The same packaging options and prices apply to every product.
   Names and descriptions live in js/i18n.js (keys listed per product).
   ========================================================================= */
window.AQUVA_SHOP = (function () {
  "use strict";

  var CURRENCY = "EUR";
  var CAN_ML = 330;

  /* Prices are temporarily NOT shown anywhere in the shop (product page, cards, cart,
     checkout). The price data below and all calculations stay intact: set this back to
     true to show prices again. */
  var SHOW_PRICES = false;

  /* Packaging options — id is used in variant IDs, key in translations */
  var PACKS = [
    { id: "1",  key: "single", cans: 1,  priceCents: 99 },    // 1 × 330 ml  — €0.99
    { id: "6",  key: "six",    cans: 6,  priceCents: 549 },   // 6 × 330 ml  — €5.49
    { id: "24", key: "case24", cans: 24, priceCents: 2199 }   // 24 × 330 ml — €21.99
  ];

  var PRODUCTS = [
    {
      id: "still",
      index: "01",
      name: "AQUVA Still",
      shortName: "STILL",
      typeKey: "still.type",
      taglineKey: "still.tagline",
      descKey: "still.desc",
      shopDescKey: "shop.still.short",
      altKey: "alt.still",
      image: { small: "/assets/img/can-still-420.webp", large: "/assets/img/can-still-760.webp" },
      available: true
    },
    {
      id: "sparkling",
      index: "02",
      name: "AQUVA Sparkling",
      shortName: "SPARKLING",
      typeKey: "sparkling.type",
      taglineKey: "sparkling.tagline",
      descKey: "sparkling.desc",
      shopDescKey: "shop.sparkling.short",
      altKey: "alt.sparkling",
      image: { small: "/assets/img/can-sparkling-420.webp", large: "/assets/img/can-sparkling-760.webp" },
      available: true
    }
  ];

  /* Build the six variants: <productId>-<packId>, e.g. "still-6" */
  var VARIANTS = {};
  PRODUCTS.forEach(function (p) {
    p.variants = PACKS.map(function (pk) {
      var v = {
        id: p.id + "-" + pk.id,
        productId: p.id,
        packId: pk.id,
        packKey: pk.key,
        cans: pk.cans,
        volumeMl: pk.cans * CAN_ML,
        priceCents: pk.priceCents,
        available: p.available
      };
      VARIANTS[v.id] = v;
      return v;
    });
  });

  function locale() { return (window.AQUVA && AQUVA.locale()) || "hr-HR"; }

  return {
    currency: CURRENCY,
    canMl: CAN_ML,
    showPrices: SHOW_PRICES,

    /* Optimal packaging for a total number of cans, independent of how the cans were
       added: as many cases of 24 as possible, then six-packs, the rest are loose cans.
       Loose cans are never counted as packages (1 to 5 cans = 0 packages). */
    packaging: function (cans) {
      cans = Math.max(0, Math.floor(Number(cans) || 0));
      var case24 = Math.floor(cans / 24), rest = cans % 24, six = Math.floor(rest / 6);
      return { cans: cans, case24: case24, six: six, loose: rest % 6, packages: case24 + six };
    },
    packs: PACKS,
    products: PRODUCTS,
    product: function (id) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i]; return null; },
    variant: function (id) { return VARIANTS[id] || null; },

    /* Localised formatting */
    formatPrice: function (cents) {
      return new Intl.NumberFormat(locale(), { style: "currency", currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
    },
    formatLitres: function (ml) {
      return new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ml / 1000) + " L";
    },
    formatNumber: function (n) { return new Intl.NumberFormat(locale()).format(n); }
  };
})();
