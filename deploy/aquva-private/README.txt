AQUVA PRIVATE FOLDER (outside the public web root)

Upload this folder ONCE to your hosting account's home folder, next to public_html:

  /home/<account>/aquva-private/      <- this folder
  /home/<account>/public_html/        <- the website (index.html, api/, css/, ...)

Contents after the first newsletter sign-up:
  newsletter_subscribers.csv   all sign-ups and unsubscribes (created automatically, append-only)
  secret.key                   random key for spam protection (created automatically)
  ratelimit/                   short-lived anti-spam counters (no IP addresses)
  newsletter-config.php        your settings (copy of newsletter-config.sample.php)

Never delete this folder and never upload the website ZIP into it.
Website updates go into public_html only, so subscribers are never overwritten.
Folder permission: 700. File permissions: 600 (the PHP code sets these automatically).
