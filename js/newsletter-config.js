/* =========================================================================
   AQUVA newsletter configuration

   Sign-ups are saved by the PHP endpoint on the AQUVA hosting server
   (api/newsletter.php) into a CSV file outside the public web root
   (/home/<account>/aquva-private/newsletter_subscribers.csv).

     POST /api/newsletter.php  JSON { email, consent: true, consentVersion,
                                      language, source, page, website }
     -> 200 { ok: true, status: "subscribed" } only after the record is saved

   GitHub Pages and the local static test server cannot run PHP: there the
   endpoint answers 404/405 and the forms honestly say sign-up is not open yet.
   Nothing is stored in the browser as a substitute.
   ========================================================================= */
window.AQUVA_NEWSLETTER = {
  endpoint: "/api/newsletter.php",
  consentVersion: "v1",    // must exist in api/lib/newsletter-core.php (nl_consent_texts); bump when the wording changes
  doubleOptIn: false,      // no confirmation emails are sent by the file-based storage
  popupDelayMs: 12000,     // timed popup appears ~12 s after the visitor arrives
  popupSnoozeDays: 14      // after closing the popup, do not show it again for this long
};
