<?php
/* =========================================================================
   AQUVA newsletter sign-up endpoint
     POST /api/newsletter.php   JSON { email, consent: true, consentVersion, language,
                                       source, page, website (honeypot) }
     GET  /api/newsletter.php?health=1   storage self-check (booleans only)

   Answers 200 { ok: true, status: "subscribed" } only after the record is in the
   CSV file (a repeated address keeps its single existing record and gets the same
   answer, so the form cannot be used to check who is subscribed).
   ========================================================================= */
declare(strict_types=1);
define('AQUVA_NL', true);
require __DIR__ . '/lib/newsletter-core.php';

nl_security_headers();
$method = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';

if ($method === 'GET' && isset($_GET['health'])) {
    nl_health();
}
if ($method !== 'POST') {
    header('Allow: POST');
    nl_json(405, ['ok' => false, 'error' => 'method_not_allowed']);
}
if (!nl_origin_allowed()) {
    nl_json(403, ['ok' => false, 'error' => 'forbidden_origin']);
}
$type = isset($_SERVER['CONTENT_TYPE']) ? (string) $_SERVER['CONTENT_TYPE'] : '';
if (stripos($type, 'application/json') === false) {
    nl_json(415, ['ok' => false, 'error' => 'unsupported_media_type']);
}
if ((int) (isset($_SERVER['CONTENT_LENGTH']) ? $_SERVER['CONTENT_LENGTH'] : 0) > NL_MAX_BODY) {
    nl_json(413, ['ok' => false, 'error' => 'payload_too_large']);
}
$raw = file_get_contents('php://input', false, null, 0, NL_MAX_BODY + 1);
if (!is_string($raw) || strlen($raw) > NL_MAX_BODY) {
    nl_json(413, ['ok' => false, 'error' => 'payload_too_large']);
}
$body = json_decode($raw, true);
if (!is_array($body)) {
    nl_json(400, ['ok' => false, 'error' => 'invalid_json']);
}

// Honeypot: people never fill the hidden "website" field. Bots get a neutral answer; nothing is stored.
if (!empty($body['website'])) {
    nl_json(200, ['ok' => true, 'status' => 'subscribed']);
}

try {
    if (nl_rate_limited('subscribe')) {
        nl_json(429, ['ok' => false, 'error' => 'rate_limited']);
    }
} catch (Throwable $e) {
    error_log('[aquva-newsletter] ' . $e->getMessage());
    nl_json(503, ['ok' => false, 'error' => 'storage_unavailable']);
}

$email = nl_clean_email(isset($body['email']) ? $body['email'] : null);
if ($email === null) {
    nl_json(422, ['ok' => false, 'error' => 'invalid_email']);
}
if (!isset($body['consent']) || $body['consent'] !== true) {
    nl_json(422, ['ok' => false, 'error' => 'consent_required']);
}
$language = (isset($body['language']) && in_array($body['language'], NL_LANGS, true)) ? $body['language'] : 'hr';
$version = isset($body['consentVersion']) ? (string) $body['consentVersion'] : '';
$texts = nl_consent_texts();
if (!isset($texts[$version][$language])) {
    nl_json(422, ['ok' => false, 'error' => 'consent_required']);
}
$source = (isset($body['source']) && in_array($body['source'], NL_SOURCES, true)) ? $body['source'] : 'other';
$page = substr((string) preg_replace('~[^A-Za-z0-9/#?=&._-]~', '', isset($body['page']) ? (string) $body['page'] : ''), 0, 200);

try {
    nl_subscribe([
        'created_at_utc' => gmdate('Y-m-d\TH:i:s\Z'),
        'email' => $email,
        'language' => $language,
        'source' => $source,
        'consent' => '1',
        'consent_version' => $version,
        'consent_text' => $texts[$version][$language],
        'page' => $page,
    ]);
} catch (Throwable $e) {
    error_log('[aquva-newsletter] ' . $e->getMessage());
    nl_json(503, ['ok' => false, 'error' => 'storage_unavailable']);
}

nl_json(200, ['ok' => true, 'status' => 'subscribed']);
