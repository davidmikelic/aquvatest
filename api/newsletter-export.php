<?php
/* =========================================================================
   AQUVA newsletter export (admin)
     GET  /api/newsletter-export.php   login form
     POST /api/newsletter-export.php   password + options -> CSV download

   The password is never stored in the website files. Only its hash lives in
   <home>/aquva-private/newsletter-config.php ('export_password_hash'), outside
   the web root. While no hash is configured, this page only offers a helper that
   turns a chosen password into the line to paste into that file.
   ========================================================================= */
declare(strict_types=1);
define('AQUVA_NL', true);
require __DIR__ . '/lib/newsletter-core.php';

nl_security_headers();
header('X-Frame-Options: DENY');

$method = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
$host = isset($_SERVER['HTTP_HOST']) ? strtolower((string) $_SERVER['HTTP_HOST']) : '';
$isLocal = (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host);
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
$title = 'Izvoz pretplatnika';

if (!$https && !$isLocal) {
    nl_page('hr', $title, '<h1>' . $title . '</h1><p>Ova stranica radi samo preko HTTPS veze. Otvorite je kao https://' . nl_h($host) . '/api/newsletter-export.php</p>', 403);
}

$hash = (string) nl_config()['export_password_hash'];

/* ---------- not configured yet: password-hash helper only ---------- */
if ($hash === '') {
    $out = '';
    $limited = false;
    if ($method === 'POST') {
        try {
            $limited = nl_rate_limited('export-setup', 10, 30);
        } catch (Throwable $e) {
            nl_page('hr', $title, '<h1>Izvoz još nije postavljen</h1><p><strong>Pohrana trenutačno nije dostupna.</strong> Provjerite privatnu mapu ' . nl_h(nl_env()['private_dir_name']) . '.</p>', 503);
        }
    }
    if ($limited) {
        $out = '<p><strong>Previše pokušaja. Pričekajte 10 minuta.</strong></p>';
    } elseif ($method === 'POST') {
        $p1 = isset($_POST['password']) ? (string) $_POST['password'] : '';
        $p2 = isset($_POST['password2']) ? (string) $_POST['password2'] : '';
        if (strlen($p1) < 12) {
            $out = '<p><strong>Lozinka mora imati barem 12 znakova.</strong></p>';
        } elseif (!hash_equals($p1, $p2)) {
            $out = '<p><strong>Lozinke se ne podudaraju.</strong></p>';
        } else {
            $line = "    'export_password_hash' => '" . password_hash($p1, PASSWORD_DEFAULT) . "',";
            $out = '<p>Kopirajte ovaj redak u datoteku <strong>' . nl_h(nl_env()['private_dir_name']) . '/newsletter-config.php</strong> (izvan public_html), umjesto postojećeg retka export_password_hash, i spremite datoteku:</p><code>' . nl_h($line) . '</code><p class="note">Sama lozinka nije nigdje spremljena. Ovaj pomoćnik nestaje čim je lozinka postavljena.</p>';
        }
    }
    nl_page('hr', $title,
        '<h1>Izvoz još nije postavljen</h1>'
        . '<p>Za preuzimanje popisa pretplatnika postavite lozinku. Upišite je ovdje kako biste dobili redak za konfiguracijsku datoteku.</p>'
        . $out
        . '<form method="post" class="box" autocomplete="off"><label for="p1">Nova lozinka (barem 12 znakova)</label><input id="p1" name="password" type="password" minlength="12" required>'
        . '<label for="p2">Ponovite lozinku</label><input id="p2" name="password2" type="password" minlength="12" required>'
        . '<button type="submit">Izradi redak za konfiguraciju</button></form>');
}

/* ---------- login form ---------- */
$form = function (string $error = ''): string {
    return '<h1>Izvoz pretplatnika</h1><p>Preuzmite popis pretplatnika AQUVA newslettera kao CSV datoteku za Excel.</p>'
        . ($error !== '' ? '<p><strong>' . nl_h($error) . '</strong></p>' : '')
        . '<form method="post" class="box"><label for="pw">Lozinka</label><input id="pw" name="password" type="password" required autocomplete="current-password">'
        . '<label for="view">Sadržaj</label><select id="view" name="view"><option value="active">Aktivni pretplatnici (za slanje)</option><option value="all">Cijeli zapis (sve prijave i odjave)</option></select>'
        . '<label for="sep">Format</label><select id="sep" name="sep"><option value="semicolon">Excel (točka-zarez ;)</option><option value="comma">Standardni CSV (zarez ,)</option></select>'
        . '<button type="submit">Preuzmi CSV</button></form>'
        . '<p class="note">Datoteka se nalazi izvan javne mape web stranice i dostupna je samo preko ove stranice ili cPanel upravitelja datoteka.</p>';
};

if ($method !== 'POST') {
    nl_page('hr', $title, $form());
}

try {
    if (nl_rate_limited('export', 10, 30)) {
        nl_page('hr', $title, $form('Previše pokušaja. Pričekajte 10 minuta.'), 429);
    }
} catch (Throwable $e) {
    nl_page('hr', $title, $form('Pohrana trenutačno nije dostupna.'), 503);
}

$password = isset($_POST['password']) ? (string) $_POST['password'] : '';
if (!password_verify($password, $hash)) {
    usleep(400000);
    nl_page('hr', $title, $form('Pogrešna lozinka.'), 401);
}

/* ---------- authorised: build the CSV ---------- */
$view = (isset($_POST['view']) && $_POST['view'] === 'all') ? 'all' : 'active';
$sep = (isset($_POST['sep']) && $_POST['sep'] === 'comma') ? ',' : ';';

$rows = [];
if (is_file(nl_csv_path())) {
    $h = nl_open_locked(false);
    try {
        $rows = nl_read_rows($h);
    } finally {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

$site = nl_site_url();
if ($view === 'active') {
    $header = ['email', 'subscribed_at_utc', 'language', 'source', 'consent_version', 'consent_text', 'unsubscribe_url'];
    $data = [];
    foreach (nl_current_state($rows) as $r) {
        if ($r['status'] !== 'subscribed') {
            continue;
        }
        $data[] = [$r['email'], $r['created_at_utc'], $r['language'], $r['source'], $r['consent_version'], $r['consent_text'],
            $site . '/api/newsletter-unsubscribe.php?token=' . $r['unsubscribe_token']];
    }
} else {
    $header = NL_COLUMNS;
    $data = array_map(function ($r) {
        return array_values($r);
    }, $rows);
}

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="aquva-newsletter-' . (nl_env()['environment'] === 'staging' ? 'STAGING-' : '') . $view . '-' . gmdate('Y-m-d') . '.csv"');
$out = fopen('php://output', 'w');
fwrite($out, "\xEF\xBB\xBF");                                  // UTF-8 BOM so Excel shows č, ć, ž, š, đ correctly
fputcsv($out, $header, $sep, '"', '');
foreach ($data as $line) {
    fputcsv($out, array_map('nl_cell', $line), $sep, '"', '');
}
fclose($out);
exit;
