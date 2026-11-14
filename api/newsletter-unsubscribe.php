<?php
/* =========================================================================
   AQUVA newsletter unsubscribe
     GET  /api/newsletter-unsubscribe.php?token=<32 hex>   shows a confirmation button
     POST /api/newsletter-unsubscribe.php  (token)          records the unsubscription
   A GET never unsubscribes on its own, so email link scanners cannot do it by accident.
   ========================================================================= */
declare(strict_types=1);
define('AQUVA_NL', true);
require __DIR__ . '/lib/newsletter-core.php';

nl_security_headers();

$T = [
    'hr' => ['title' => 'Odjava s AQUVA novosti', 'ask' => 'Želite li odjaviti adresu %s s AQUVA novosti?', 'button' => 'Odjavi me',
             'done' => 'Odjavljeni ste. Više nećete primati AQUVA novosti.', 'already' => 'Ova adresa je već odjavljena.',
             'invalid' => 'Poveznica za odjavu nije valjana. Za odjavu nam pišite na info@aquva.hr.',
             'error' => 'Odjava trenutačno nije moguća. Pokušajte kasnije ili nam pišite na info@aquva.hr.', 'back' => 'Natrag na AQUVA'],
    'en' => ['title' => 'Unsubscribe from AQUVA news', 'ask' => 'Do you want to unsubscribe %s from AQUVA news?', 'button' => 'Unsubscribe me',
             'done' => 'You have been unsubscribed. You will no longer receive AQUVA news.', 'already' => 'This address is already unsubscribed.',
             'invalid' => 'This unsubscribe link is not valid. Email info@aquva.hr to unsubscribe.',
             'error' => 'Unsubscribing is not possible right now. Please try later or email info@aquva.hr.', 'back' => 'Back to AQUVA'],
    'it' => ['title' => "Annulla l'iscrizione alle novità AQUVA", 'ask' => "Vuoi annullare l'iscrizione di %s alle novità AQUVA?", 'button' => 'Annulla iscrizione',
             'done' => 'Iscrizione annullata. Non riceverai più le novità AQUVA.', 'already' => "Questo indirizzo non è più iscritto.",
             'invalid' => "Il link non è valido. Per annullare l'iscrizione scrivi a info@aquva.hr.",
             'error' => 'Al momento non è possibile annullare. Riprova più tardi o scrivi a info@aquva.hr.', 'back' => 'Torna su AQUVA'],
    'de' => ['title' => 'Abmeldung von AQUVA Neuigkeiten', 'ask' => 'Möchten Sie %s von den AQUVA Neuigkeiten abmelden?', 'button' => 'Abmelden',
             'done' => 'Sie wurden abgemeldet. Sie erhalten keine AQUVA Neuigkeiten mehr.', 'already' => 'Diese Adresse ist bereits abgemeldet.',
             'invalid' => 'Dieser Abmeldelink ist ungültig. Schreiben Sie zur Abmeldung an info@aquva.hr.',
             'error' => 'Die Abmeldung ist gerade nicht möglich. Bitte später erneut versuchen oder an info@aquva.hr schreiben.', 'back' => 'Zurück zu AQUVA'],
];

function nl_mask(string $email): string
{
    $at = strrpos($email, '@');
    if ($at === false) {
        return '***';
    }
    return substr($email, 0, 1) . str_repeat('*', max(2, $at - 1)) . substr($email, $at);
}

$method = isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : 'GET';
$token = isset($_REQUEST['token']) && is_string($_REQUEST['token']) ? strtolower(trim($_REQUEST['token'])) : '';
$lang = isset($_GET['lang']) && in_array($_GET['lang'], NL_LANGS, true) ? (string) $_GET['lang'] : 'hr';
$back = '<p><a href="/">' . nl_h($T[$lang]['back']) . '</a></p>';

try {
    $row = nl_find_by_token($token);
} catch (Throwable $e) {
    error_log('[aquva-newsletter] ' . $e->getMessage());
    nl_page($lang, $T[$lang]['title'], '<h1>' . nl_h($T[$lang]['title']) . '</h1><p>' . nl_h($T[$lang]['error']) . '</p>' . $back, 503);
}
if ($row !== null && in_array($row['language'], NL_LANGS, true)) {
    $lang = $row['language'];
    $back = '<p><a href="/">' . nl_h($T[$lang]['back']) . '</a></p>';
}
$t = $T[$lang];

if ($row === null) {
    nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($t['invalid']) . '</p>' . $back, 404);
}

if ($method === 'POST') {
    if (!nl_origin_allowed()) {
        nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($t['invalid']) . '</p>' . $back, 403);
    }
    try {
        if (nl_rate_limited('unsubscribe', 20, 500)) {
            nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($t['error']) . '</p>' . $back, 429);
        }
        $result = nl_unsubscribe($token);
    } catch (Throwable $e) {
        error_log('[aquva-newsletter] ' . $e->getMessage());
        nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($t['error']) . '</p>' . $back, 503);
    }
    $msg = $result === 'unsubscribed' ? $t['done'] : ($result === 'already' ? $t['already'] : $t['invalid']);
    nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($msg) . '</p>' . $back, $result === 'invalid' ? 404 : 200);
}

if ($row['status'] !== 'subscribed') {
    nl_page($lang, $t['title'], '<h1>' . nl_h($t['title']) . '</h1><p>' . nl_h($t['already']) . '</p>' . $back);
}

nl_page($lang, $t['title'],
    '<h1>' . nl_h($t['title']) . '</h1>'
    . '<p>' . nl_h(sprintf($t['ask'], nl_mask($row['email']))) . '</p>'
    . '<form method="post" action="/api/newsletter-unsubscribe.php">'
    . '<input type="hidden" name="token" value="' . nl_h($token) . '">'
    . '<button type="submit">' . nl_h($t['button']) . '</button></form>' . $back);
