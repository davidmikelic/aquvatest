# AQUVA: test and production environments

| | Test (now) | Production (later) |
|---|---|---|
| Address | https://www.aquva-test.com | **https://www.aquva.hr** |
| Hosting | GitHub Pages (static, no PHP) | **Plus hosting**: cPanel, LiteSpeed, PHP selector |
| Visitors | AQUVA team only (Cloudflare Access login, keep it) | Public, no login |
| Search engines | `noindex` (automatic) | Indexed |
| Newsletter | Forms say "not open yet", nothing is saved | Saved by PHP into a private CSV file |

Nothing in this document has been carried out. Uploading, DNS and hosting settings need your approval.

---

## 1. Folder layout on Plus hosting

```
/home/<account>/                       cPanel home folder (not public)
├── aquva-private/                     PRIVATE, outside the web root: upload once, never overwrite
│   ├── newsletter_subscribers.csv     created automatically at the first sign-up, append-only
│   ├── newsletter-config.php          your settings (from newsletter-config.sample.php)
│   ├── secret.key                     created automatically (spam protection key)
│   ├── ratelimit/                     created automatically (short-lived counters, no IPs)
│   └── .htaccess                      deny-all (extra safety)
└── public_html/                       document root of www.aquva.hr: website ZIP goes here
    ├── index.html, 404.html, shop/, css/, js/, assets/, robots.txt, sitemap.xml, .htaccess
    └── api/
        ├── newsletter.php             sign-up endpoint (POST)
        ├── newsletter-unsubscribe.php unsubscribe page
        ├── newsletter-export.php      password-protected CSV download
        ├── geo.php                    optional country hint for the first-visit language
        └── lib/newsletter-core.php    shared code (blocked from the web by lib/.htaccess)
            lib/environment.php        "production" here, "staging" in the staging package
```

If aquva.hr is an **addon domain** whose folder is e.g. `/home/<account>/aquva.hr` or
`public_html/aquva.hr`, the code still uses `/home/<account>/aquva-private` (it always
climbs above `public_html`). Check with the health test in section 4.

## 2. Build the upload packages (on this computer)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\build-production.ps1
```

Creates in `dist\`:
- `aquva-hr-public_html.zip`: the website. Contains **no** subscriber data, so re-uploading it can never overwrite subscribers.
- `aquva-private-first-time.zip`: the private folder (only the first time).

## 3. Settings in cPanel (Plus hosting)

1. **Domain:** `www.aquva.hr` points to `public_html` (or its addon folder). DNS is managed at Plus or your registrar, with no Cloudflare required.
2. **SSL:** cPanel → *SSL/TLS Status* → run AutoSSL for `aquva.hr` and `www.aquva.hr`. `.htaccess` then redirects everything to `https://www.aquva.hr`.
3. **PHP version:** cPanel → *Select PHP Version* (PHP selector) → **PHP 8.2, 8.3 or 8.4** (7.4 minimum).
   Extensions are standard: `json`, `filter`, `ctype` (on by default). No database is needed.
4. **Private folder:** File Manager → home folder → *Upload* `aquva-private-first-time.zip` → *Extract*.
   Set permissions: folder `aquva-private` **700**. Rename `newsletter-config.sample.php` to
   `newsletter-config.php` (optional at first, needed for the export password).
5. **Website:** File Manager → `public_html` → *Upload* `aquva-hr-public_html.zip` → *Extract* →
   allow overwriting. Delete the ZIP afterwards. Make sure *Show Hidden Files* is on, so the
   `.htaccess` files are visible and present.
6. **Export password:** open `https://www.aquva.hr/api/newsletter-export.php`, choose a password
   (12+ characters), copy the generated line into `aquva-private/newsletter-config.php`, save.
   The page then becomes the login.
7. **Email:** keep the existing mail settings (MX, SPF, DKIM) for `info@aquva.hr` unchanged.

Optional: if Plus enables LiteSpeed/Apache GeoIP for the account, `api/geo.php` will pass the
visitor's country to the first-visit language choice. Without it, the site uses the browser
language, which is also fine.

## 4. Test after uploading (5 minutes)

1. `https://www.aquva.hr/api/newsletter.php?health=1` shows
   `"ok":true, "storage_writable":true, "storage_outside_webroot":true`.
   If `storage_outside_webroot` is false, stop and check the folder layout.
2. On the homepage, sign up in the footer with your own address and tick the consent box:
   "Hvala! Prijavljeni ste na AQUVA novosti."
3. In File Manager, `aquva-private/newsletter_subscribers.csv` now exists with one row.
4. Sign up again with the same address: same message, **no** second row.
5. These must all fail (403/404), proving the data is not public:
   - `https://www.aquva.hr/aquva-private/newsletter_subscribers.csv`
   - `https://www.aquva.hr/newsletter_subscribers.csv`
   - `https://www.aquva.hr/api/lib/newsletter-core.php`
6. Export: log in at `/api/newsletter-export.php`, choose *Aktivni pretplatnici* + *Excel*,
   open the file in Excel: columns split correctly and Croatian characters display.
7. Unsubscribe: copy the `unsubscribe_url` from the export, open it, press *Odjavi me*,
   then export again: the address is gone from the active list (the full log keeps the history).
8. Language: switch to EN and sign up with another address; the message is English and the
   CSV row has `language = en`. Repeat with the popup; the row has `source = popup`.

## 4b. Staging (test copy of the newsletter on Plus hosting)

The GitHub test site (`aquva-test.com`) cannot run PHP, so the newsletter can only be tested on
a PHP host. Staging is a separate copy on Plus hosting, for example a subdomain such as
`test.aquva.hr` with its own folder. **The staging address has not been chosen or created yet.**

Packages (built by the same script, in `dist\staging\`):
- `aquva-staging-public_html.zip`: extract into the staging subdomain's folder.
- `aquva-private-staging-first-time.zip`: extract **once** into the home folder, giving
  `/home/<account>/aquva-private-staging/`.

How staging differs from production:
- `api/lib/environment.php` says `staging`, so all sign-ups go to `aquva-private-staging`, never to
  the real `aquva-private` folder, even on the same hosting account.
- Its own `.htaccess`: `X-Robots-Tag: noindex`, HTTPS on the staging address itself (no redirect
  to www.aquva.hr), no long caching. There is no robots.txt or sitemap.xml.
- Unsubscribe links in the export use the staging address. The export file name starts with
  `aquva-newsletter-STAGING-`.
- Recommended: cPanel → *Directory Privacy* → password-protect the staging folder, so only the
  AQUVA team can open it (similar to Cloudflare Access on the test site).

Test on staging: steps 1 to 8 of section 4, using the staging address. The health check must also show
`"environment":"staging"` and `"private_folder":"aquva-private-staging"`. In addition:
- Send the form 6 times within 10 minutes: the 6th answer is "Too many attempts" (rate limit).
- Unsubscribe and sign up again with the same address: a new `subscribed` row is added.
- After testing, the `aquva-private-staging` folder can simply be deleted.

## 5. Every later website update

Build again and upload only `aquva-hr-public_html.zip` into `public_html`.
Never upload anything into `aquva-private`, and never delete it.
Back up `aquva-private/newsletter_subscribers.csv` regularly (download it via File Manager,
or use the export page).

## 6. How the newsletter storage works

- **Endpoint:** `POST /api/newsletter.php` (JSON) from both the popup and the footer form.
- **Checks, all on the server:**
  - origin is the AQUVA site
  - JSON only, at most 4 KB
  - a hidden honeypot field catches bots
  - rate limit of 5 sign-ups per visitor and 100 in total per 10 minutes
  - valid email
  - `consent === true` with a known consent version
- **Consent record:** the stored consent wording is taken from the server's own copy
  (`nl_consent_texts()` in `api/lib/newsletter-core.php`), so it cannot be faked.
  If the wording on the website changes, add a new version there and in `js/newsletter-config.js`.
- **File:** `newsletter_subscribers.csv`, UTF-8, columns
  `created_at_utc, email, status, language, source, consent, consent_version, consent_text, unsubscribe_token, page`.
  It's append-only. Unsubscribing adds a new `unsubscribed` row instead of editing old ones, so
  nothing is ever lost, and the latest row per address is that address's current status.
- **Duplicates:** the check and the append run under one exclusive file lock (`flock`), so even
  simultaneous submissions cannot create two active records for the same address. A repeated
  sign-up gets the same answer as a new one, so nobody can test which addresses are subscribed.
- **Formula injection:** cells starting with `= + - @` or a tab are prefixed with `'`, and such
  email addresses are rejected outright.
- **Privacy:** no IP addresses are stored. Rate limiting uses a keyed hash that changes daily and
  expires after 10 minutes.
- **Success message:** shown only after the server confirms the row was written. On GitHub Pages
  (no PHP) the forms say sign-up is not open yet.
- **Unsubscribe:** each row has a random token. Campaign emails must include the
  `unsubscribe_url` from the export. Opening it shows a confirmation button, so link scanners
  in mail programs cannot unsubscribe people by accident. Requests sent to info@aquva.hr can be
  handled with the same link.
- **No confirmation email** is sent (there is no mail service). The opt-in is an unticked
  checkbox the visitor ticks themselves, with the exact wording stored. If you later want double
  opt-in, it needs an email-sending step.

## 7. Other production notes

- All canonical, hreflang, Open Graph, sitemap and structured-data URLs already use
  `https://www.aquva.hr`. Pages mark themselves `noindex` on every other host.
- `CNAME` stays `www.aquva-test.com` for the GitHub test site and is not part of the production ZIP.
- **Google Search Console:** not configured (no code yet). Later, either add the DNS TXT record
  or paste the meta tag at the marked comment in `index.html` and `shop/index.html`, then
  submit `https://www.aquva.hr/sitemap.xml`.
- **Analytics:** none by decision. Cookie consent is ready for consent-gated scripts later.
- **Shop structured data:** add `Product`/`Offer` only when real ordering exists.
- **Test environment:** keep the Cloudflare Access protection on `aquva-test.com`. Production
  does not use Cloudflare.
