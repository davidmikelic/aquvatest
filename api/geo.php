<?php
/* =========================================================================
   AQUVA country hint for the automatic first-visit language (production host).
   Returns { "country": "HR" } only if the hosting server already provides a
   country (LiteSpeed/Apache GeoIP or a proxy header); otherwise { "country": null }
   and the website falls back to the browser language. Nothing is stored.
   ========================================================================= */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

$country = null;
foreach (['HTTP_CF_IPCOUNTRY', 'GEOIP_COUNTRY_CODE', 'HTTP_X_COUNTRY_CODE', 'MM_COUNTRY_CODE'] as $key) {
    $v = getenv($key);
    if (!is_string($v) || $v === '') {
        $v = isset($_SERVER[$key]) ? (string) $_SERVER[$key] : '';
    }
    if (preg_match('/^[A-Za-z]{2}$/', $v) && strtoupper($v) !== 'XX') {
        $country = strtoupper($v);
        break;
    }
}
echo json_encode(['country' => $country]);
