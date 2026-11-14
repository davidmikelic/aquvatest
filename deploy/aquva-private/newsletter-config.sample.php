<?php
/* =========================================================================
   AQUVA newsletter settings (PRIVATE, outside public_html)

   Location on Plus hosting:  /home/<account>/aquva-private/newsletter-config.php
   (rename this file from newsletter-config.sample.php). Without this file the
   sign-ups still work with the defaults below; only the export stays locked.

   export_password_hash: open https://www.aquva.hr/api/newsletter-export.php once,
   choose a password, and paste the generated line here. The password itself is
   never stored anywhere.
   ========================================================================= */
return [
    'export_password_hash' => '',

    // Sites allowed to post sign-ups (same-origin requests are always allowed)
    'allowed_origins' => ['https://www.aquva.hr', 'https://aquva.hr'],
    'site_url' => 'https://www.aquva.hr',

    // Spam / abuse protection (per 10 minutes)
    'rate_limit_per_client' => 5,
    'rate_limit_global' => 100,
    'rate_limit_window' => 600,

    'csv_file' => 'newsletter_subscribers.csv',
];
