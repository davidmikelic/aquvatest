/* =========================================================================
   AQUVA newsletter configuration

   Sign-ups are saved by the PHP endpoint on the AQUVA hosting server
   (api/newsletter.php) into a CSV file outside the public web root
   (/home/<account>/aquva-private/newsletter_subscribers.csv).

     POST /api/newsletter.php  JSON { email, consent: true, consentVersion,
                                      language, source, page, website }
     -> 200 { ok: true, status: "subscribed" } only after the record is saved

   THIS FILE IS THE GITHUB PAGES (TEST) VERSION: endpoint is intentionally EMPTY.
   GitHub Pages cannot run PHP, so the forms honestly say sign-up is not open yet
   and the address is never sent anywhere or stored (not even in the browser).
   The hosting version (aquva-hosting/js/newsletter-config.js) uses
   endpoint "/api/newsletter.php".
   ========================================================================= */
window.AQUVA_NEWSLETTER = {
  endpoint: "",            // GitHub test site: never collect or send sign-ups
  consentVersion: "v1",    // must exist in api/lib/newsletter-core.php (nl_consent_texts); bump when the wording changes
  doubleOptIn: false,      // no confirmation emails are sent by the file-based storage
  popupDelayMs: 30000,     // timed popup appears 30 s after the page loads ...
  popupCooldownHours: 24   // ... at most once per 24 h after it was shown; never again after a successful sign-up
};
