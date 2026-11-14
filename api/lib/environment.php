<?php
/* =========================================================================
   Which server this copy of the website runs on. The repository version is
   PRODUCTION. deploy/build-production.ps1 replaces this file inside the staging
   package only, so staging always writes to its own private folder
   (<home>/aquva-private-staging) and can never touch real subscribers.
   ========================================================================= */
if (!defined('AQUVA_NL')) { http_response_code(403); exit; }

return [
    'environment' => 'production',
    'private_dir_name' => 'aquva-private',
];
