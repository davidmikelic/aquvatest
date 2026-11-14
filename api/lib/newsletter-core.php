<?php
/* =========================================================================
   AQUVA newsletter core (shared by newsletter.php, -unsubscribe.php, -export.php)
   PHP 7.4 to 8.4. This folder is not web-accessible (api/lib/.htaccess) and the
   file refuses to run unless included by an endpoint.

   Storage: one append-only CSV file in a PRIVATE folder outside the web root:
     <home>/aquva-private/newsletter_subscribers.csv
   Every subscription and every unsubscription is a new row; earlier rows are
   never rewritten. A subscriber's current status is their latest row.
   ========================================================================= */
declare(strict_types=1);

if (!defined('AQUVA_NL')) { http_response_code(403); exit; }

const NL_COLUMNS = ['created_at_utc', 'email', 'status', 'language', 'source', 'consent', 'consent_version', 'consent_text', 'unsubscribe_token', 'page'];
const NL_LANGS = ['hr', 'en', 'it', 'de'];
const NL_SOURCES = ['popup', 'footer'];
const NL_MAX_BODY = 4096;

/* Canonical consent wording per version and language. The stored text comes from
   here, not from the browser. If the wording on the website changes, add "v2". */
function nl_consent_texts(): array
{
    return [
        'v1' => [
            'hr' => 'Želim primati AQUVA novosti e-poštom. Odjaviti se mogu u bilo kojem trenutku.',
            'en' => 'I would like to receive AQUVA news by email. I can unsubscribe at any time.',
            'it' => "Desidero ricevere le novità AQUVA via email. Posso annullare l'iscrizione in qualsiasi momento.",
            'de' => 'Ich möchte AQUVA Neuigkeiten per E-Mail erhalten. Ich kann mich jederzeit abmelden.',
        ],
    ];
}

/* ---------------------------------------------------------------- paths */

/* production or staging (api/lib/environment.php, written per package by the build script) */
function nl_env(): array
{
    static $env = null;
    if ($env !== null) {
        return $env;
    }
    $file = __DIR__ . DIRECTORY_SEPARATOR . 'environment.php';
    $data = is_file($file) ? include $file : [];
    $data = is_array($data) ? $data : [];
    $name = (isset($data['environment']) && $data['environment'] === 'staging') ? 'staging' : 'production';
    $dir = isset($data['private_dir_name']) ? (string) $data['private_dir_name'] : '';
    if (!preg_match('/^aquva-private[a-z0-9-]*$/', $dir)) {
        $dir = $name === 'staging' ? 'aquva-private-staging' : 'aquva-private';
    }
    if ($name === 'staging' && $dir === 'aquva-private') {
        $dir = 'aquva-private-staging';                // staging must never share the production folder
    }
    $env = ['environment' => $name, 'private_dir_name' => $dir];
    return $env;
}

/* Base address for links in exports: the configured site_url, else the current host. */
function nl_site_url(): string
{
    $site = rtrim((string) nl_config()['site_url'], '/');
    if ($site !== '') {
        return $site;
    }
    $host = isset($_SERVER['HTTP_HOST']) ? strtolower((string) $_SERVER['HTTP_HOST']) : '';
    return preg_match('/^[a-z0-9.-]+(:\d+)?$/', $host) ? 'https://' . $host : 'https://www.aquva.hr';
}

function nl_docroot(): string
{
    $dr = isset($_SERVER['DOCUMENT_ROOT']) ? realpath((string) $_SERVER['DOCUMENT_ROOT']) : false;
    return $dr ? $dr : dirname(__DIR__, 2);
}

/* Private folder: next to (not inside) the web root, e.g. /home/<account>/aquva-private.
   Can be overridden with the environment variable AQUVA_PRIVATE_DIR. */
function nl_private_dir(): string
{
    $env = getenv('AQUVA_PRIVATE_DIR');
    if (is_string($env) && $env !== '') {
        return rtrim($env, '/\\');
    }
    $root = nl_docroot();
    // cPanel: never place it inside public_html, even when the domain's folder is
    // public_html/<domain>; use the account's home folder above public_html instead.
    $pos = strpos(str_replace('\\', '/', $root), '/public_html');
    $base = $pos !== false ? substr($root, 0, $pos) : dirname($root);
    return $base . DIRECTORY_SEPARATOR . nl_env()['private_dir_name'];
}

function nl_ensure_private_dir(): string
{
    $dir = nl_private_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException('storage_unavailable: cannot create ' . $dir);
    }
    // Defence in depth in case the folder ever ends up inside a web root
    $ht = $dir . DIRECTORY_SEPARATOR . '.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    $idx = $dir . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($idx)) {
        @file_put_contents($idx, '');
    }
    if (!is_writable($dir)) {
        throw new RuntimeException('storage_unavailable: not writable ' . $dir);
    }
    return $dir;
}

function nl_is_outside_webroot(): bool
{
    $priv = realpath(nl_private_dir());
    $path = str_replace('\\', '/', $priv ? $priv : nl_private_dir()) . '/';
    $root = str_replace('\\', '/', nl_docroot()) . '/';
    return strpos($path, $root) !== 0 && strpos($path, '/public_html/') === false;
}

/* --------------------------------------------------------------- config */

function nl_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $defaults = [
        'csv_file' => 'newsletter_subscribers.csv',
        'export_password_hash' => '',
        'allowed_origins' => ['https://www.aquva.hr', 'https://aquva.hr'],
        'site_url' => nl_env()['environment'] === 'staging' ? '' : 'https://www.aquva.hr',   // '' = the address being used
        'rate_limit_per_client' => 5,     // sign-ups per client per window
        'rate_limit_global' => 100,       // sign-ups from everyone per window
        'rate_limit_window' => 600,       // seconds
    ];
    $file = nl_private_dir() . DIRECTORY_SEPARATOR . 'newsletter-config.php';
    $user = is_file($file) ? include $file : [];
    $cfg = array_merge($defaults, is_array($user) ? $user : []);
    return $cfg;
}

function nl_csv_path(): string
{
    return nl_ensure_private_dir() . DIRECTORY_SEPARATOR . basename((string) nl_config()['csv_file']);
}

/* --------------------------------------------------------------- output */

function nl_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store, max-age=0');
}

function nl_json(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function nl_h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* ----------------------------------------------------------- validation */

function nl_clean_email($value): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $e = strtolower(trim($value));
    if ($e === '' || strlen($e) > 254) {
        return null;
    }
    if (preg_match('/[\s,;"<>\x00-\x1f\x7f]/', $e) || preg_match('/^[=+\-@]/', $e)) {
        return null;                                   // also blocks CSV formula starts
    }
    if (filter_var($e, FILTER_VALIDATE_EMAIL) === false) {
        return null;
    }
    $domain = substr($e, (int) strrpos($e, '@') + 1);
    if (!preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $domain)) {
        return null;
    }
    return $e;
}

/* Same-origin requests, or origins listed in the config, are accepted. */
function nl_origin_allowed(): bool
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
    if ($origin === '') {
        $ref = isset($_SERVER['HTTP_REFERER']) ? (string) $_SERVER['HTTP_REFERER'] : '';
        if ($ref === '') {
            return true;                               // some privacy tools strip both; other checks still apply
        }
        $p = parse_url($ref);
        $origin = (isset($p['scheme']) ? $p['scheme'] : '') . '://' . (isset($p['host']) ? $p['host'] : '') . (isset($p['port']) ? ':' . $p['port'] : '');
    }
    if (in_array($origin, (array) nl_config()['allowed_origins'], true)) {
        return true;
    }
    $p = parse_url($origin);
    $originHost = (isset($p['host']) ? $p['host'] : '') . (isset($p['port']) ? ':' . $p['port'] : '');
    $host = isset($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : '';
    return $host !== '' && strcasecmp($originHost, $host) === 0;
}

/* ------------------------------------------------------------------ CSV */

/* Neutralise spreadsheet formulas and keep every record on one line. */
function nl_cell($value): string
{
    $s = str_replace(["\r\n", "\r", "\n"], ' ', (string) $value);
    if ($s !== '' && strpos("=+-@\t", $s[0]) !== false) {
        $s = "'" . $s;
    }
    return $s;
}

function nl_uncell(string $s): string
{
    return (strlen($s) > 1 && $s[0] === "'" && strpos("=+-@\t", $s[1]) !== false) ? substr($s, 1) : $s;
}

function nl_write_row($handle, array $cells): void
{
    $clean = array_map('nl_cell', $cells);
    if (fputcsv($handle, $clean, ',', '"', '') === false) {
        throw new RuntimeException('storage_unavailable: write failed');
    }
}

/* Read all rows (handle must be locked). Returns list of assoc rows. */
function nl_read_rows($handle): array
{
    rewind($handle);
    $rows = [];
    $first = true;
    while (($r = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        if ($r === [null] || $r === []) {
            continue;
        }
        if ($first) {
            $first = false;
            if (isset($r[0]) && $r[0] === NL_COLUMNS[0]) {
                continue;                              // header row
            }
        }
        $row = [];
        foreach (NL_COLUMNS as $i => $col) {
            $row[$col] = isset($r[$i]) ? nl_uncell((string) $r[$i]) : '';
        }
        $rows[] = $row;
    }
    return $rows;
}

/* Latest row per email = current state. */
function nl_current_state(array $rows): array
{
    $state = [];
    foreach ($rows as $row) {
        $state[strtolower($row['email'])] = $row;
    }
    return $state;
}

function nl_open_locked(bool $exclusive)
{
    $path = nl_csv_path();
    $isNew = !is_file($path);
    $h = @fopen($path, 'c+');
    if (!$h) {
        throw new RuntimeException('storage_unavailable: cannot open ' . basename($path));
    }
    if ($isNew) {
        @chmod($path, 0600);
    }
    if (!flock($h, $exclusive ? LOCK_EX : LOCK_SH)) {
        fclose($h);
        throw new RuntimeException('storage_unavailable: lock failed');
    }
    return $h;
}

function nl_append($handle, array $record): void
{
    fseek($handle, 0, SEEK_END);
    if (ftell($handle) === 0) {
        nl_write_row($handle, NL_COLUMNS);             // header for a new file
    }
    $cells = [];
    foreach (NL_COLUMNS as $col) {
        $cells[] = isset($record[$col]) ? $record[$col] : '';
    }
    nl_write_row($handle, $cells);
    fflush($handle);
}

/* Returns 'created', 'resubscribed' or 'exists'. Duplicate check and append happen
   under one exclusive lock, so simultaneous sign-ups cannot create duplicates. */
function nl_subscribe(array $record): string
{
    $h = nl_open_locked(true);
    try {
        $state = nl_current_state(nl_read_rows($h));
        $key = strtolower($record['email']);
        if (isset($state[$key]) && $state[$key]['status'] === 'subscribed') {
            return 'exists';
        }
        $result = isset($state[$key]) ? 'resubscribed' : 'created';
        $record['status'] = 'subscribed';
        $record['unsubscribe_token'] = bin2hex(random_bytes(16));
        nl_append($h, $record);
        return $result;
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

/* Finds the subscriber a token belongs to (any token ever issued to that address). */
function nl_find_by_token(string $token): ?array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token) || !is_file(nl_csv_path())) {
        return null;
    }
    $h = nl_open_locked(false);
    try {
        $rows = nl_read_rows($h);
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
    $email = null;
    foreach ($rows as $row) {
        if (hash_equals($row['unsubscribe_token'], $token)) {
            $email = strtolower($row['email']);
        }
    }
    if ($email === null) {
        return null;
    }
    $state = nl_current_state($rows);
    return isset($state[$email]) ? $state[$email] : null;
}

/* Appends an 'unsubscribed' row. Returns 'unsubscribed', 'already' or 'invalid'. */
function nl_unsubscribe(string $token): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $token) || !is_file(nl_csv_path())) {
        return 'invalid';
    }
    $h = nl_open_locked(true);
    try {
        $rows = nl_read_rows($h);
        $email = null;
        foreach ($rows as $row) {
            if (hash_equals($row['unsubscribe_token'], $token)) {
                $email = strtolower($row['email']);
            }
        }
        if ($email === null) {
            return 'invalid';
        }
        $state = nl_current_state($rows);
        $current = $state[$email];
        if ($current['status'] !== 'subscribed') {
            return 'already';
        }
        $current['created_at_utc'] = gmdate('Y-m-d\TH:i:s\Z');
        $current['status'] = 'unsubscribed';
        $current['consent'] = '0';
        nl_append($h, $current);
        return 'unsubscribed';
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

/* ----------------------------------------------------------- rate limit */

function nl_secret(): string
{
    $file = nl_ensure_private_dir() . DIRECTORY_SEPARATOR . 'secret.key';
    if (!is_file($file)) {
        @file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
        @chmod($file, 0600);
    }
    $s = (string) @file_get_contents($file);
    return $s !== '' ? $s : 'aquva-fallback';
}

/* Sliding-window counter in a small JSON file. Returns true if the hit is allowed. */
function nl_bucket_hit(string $file, int $max, int $window): bool
{
    $h = @fopen($file, 'c+');
    if (!$h) {
        return true;
    }
    flock($h, LOCK_EX);
    $now = time();
    $raw = stream_get_contents($h);
    $list = $raw ? json_decode($raw, true) : [];
    $list = array_values(array_filter(is_array($list) ? $list : [], function ($t) use ($now, $window) {
        return is_int($t) && $t > $now - $window;
    }));
    $ok = count($list) < $max;
    if ($ok) {
        $list[] = $now;
    }
    ftruncate($h, 0);
    rewind($h);
    fwrite($h, (string) json_encode($list));
    fflush($h);
    flock($h, LOCK_UN);
    fclose($h);
    return $ok;
}

/* The client key is a keyed hash of the connection address that changes every day.
   The IP address itself is never written anywhere; bucket files expire with the window. */
function nl_rate_limited(string $bucket = 'subscribe', ?int $perClient = null, ?int $global = null): bool
{
    $cfg = nl_config();
    $window = (int) $cfg['rate_limit_window'];
    $dir = nl_ensure_private_dir() . DIRECTORY_SEPARATOR . 'ratelimit';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    $client = substr(hash_hmac('sha256', $bucket . '|' . $ip . '|' . gmdate('Y-m-d'), nl_secret()), 0, 32);
    $okClient = nl_bucket_hit($dir . DIRECTORY_SEPARATOR . $client . '.json', $perClient !== null ? $perClient : (int) $cfg['rate_limit_per_client'], $window);
    $okGlobal = $okClient ? nl_bucket_hit($dir . DIRECTORY_SEPARATOR . 'global-' . $bucket . '.json', $global !== null ? $global : (int) $cfg['rate_limit_global'], $window) : true;
    if (mt_rand(1, 40) === 1) {
        foreach ((array) glob($dir . DIRECTORY_SEPARATOR . '*.json') as $f) {
            if (is_string($f) && strpos(basename($f), 'global-') !== 0 && @filemtime($f) < time() - $window) {
                @unlink($f);
            }
        }
    }
    return !($okClient && $okGlobal);
}

/* ------------------------------------------------------------- health */

function nl_health(): void
{
    $writable = false;
    $csv = false;
    try {
        $dir = nl_ensure_private_dir();
        $writable = is_writable($dir);
        $csv = is_file($dir . DIRECTORY_SEPARATOR . basename((string) nl_config()['csv_file']));
    } catch (Throwable $e) {
        $writable = false;
    }
    nl_json(200, [
        'ok' => $writable,
        'environment' => nl_env()['environment'],
        'private_folder' => nl_env()['private_dir_name'],
        'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION,
        'storage_writable' => $writable,
        'storage_outside_webroot' => nl_is_outside_webroot(),
        'csv_exists' => $csv,
        'export_configured' => (string) nl_config()['export_password_hash'] !== '',
    ]);
}

/* ---------------------------------------------------------- simple page */

function nl_page(string $lang, string $title, string $bodyHtml, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    echo '<!doctype html><html lang="' . nl_h($lang) . '"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">'
        . '<title>' . nl_h($title) . ' | AQUVA</title><style>'
        . 'body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0A2A6B;background:linear-gradient(180deg,#fff,#EAF3FD);min-height:100vh}'
        . 'main{max-width:560px;margin:0 auto;padding:72px 22px}h1{font-weight:500;font-size:28px;letter-spacing:-.01em;margin:0 0 14px}'
        . 'p{color:rgba(10,42,107,.72);line-height:1.6}label{display:block;font-size:14px;font-weight:600;margin:18px 0 6px}'
        . 'input,select{width:100%;box-sizing:border-box;height:48px;padding:0 14px;border:1px solid rgba(10,42,107,.25);border-radius:12px;font:inherit;color:#0A2A6B;background:#fff}'
        . 'button{margin-top:22px;height:50px;padding:0 26px;border:0;border-radius:999px;background:#0A2A6B;color:#fff;font:inherit;font-weight:600;letter-spacing:.06em;cursor:pointer}'
        . 'button:hover{background:#0B72E0}.note{font-size:13px}.box{background:#fff;border:1px solid #D6E8FB;border-radius:20px;padding:26px}'
        . 'code{display:block;white-space:pre-wrap;word-break:break-all;background:#EAF3FD;padding:12px;border-radius:10px;font-size:13px}a{color:#0A68D0}'
        . '</style></head><body><main><p style="letter-spacing:.3em;font-weight:600;font-size:13px">AQUVA</p>' . $bodyHtml . '</main></body></html>';
    exit;
}
