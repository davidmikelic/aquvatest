# =========================================================================
# Builds the upload packages for Plus hosting into .\dist\
#
# PRODUCTION (www.aquva.hr)
#   dist\aquva-hr-public_html.zip                 website -> extract into public_html (every update)
#   dist\aquva-private-first-time.zip             private folder -> extract ONCE next to public_html
#
# STAGING (test copy on Plus hosting, e.g. a subdomain; never the GitHub test site)
#   dist\staging\aquva-staging-public_html.zip    website -> extract into the staging folder
#   dist\staging\aquva-private-staging-first-time.zip
#                                                 private folder aquva-private-staging -> ONCE
#   Differences: api/lib/environment.php says "staging" (own private folder
#   aquva-private-staging, so test sign-ups never mix with real subscribers),
#   staging .htaccess (noindex header, HTTPS on its own address, no redirect to
#   www.aquva.hr, no long caching), no robots.txt / sitemap.xml.
#
# The website ZIPs never contain subscriber data, so uploading a new version
# cannot overwrite or delete subscribers. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File deploy\build-production.ps1 [-Target all|production|staging]
# =========================================================================
param([ValidateSet("all", "production", "staging")][string]$Target = "all")

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force $dist | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding($false)
$excludeDirs = @("assets\brand")

function Add-FileToZip([System.IO.Compression.ZipArchive]$zip, [string]$source, [string]$entryName) {
  $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $in = [System.IO.File]::OpenRead($source); $out = $entry.Open()
  try { $in.CopyTo($out) } finally { $out.Dispose(); $in.Dispose() }
}
function Add-TextToZip([System.IO.Compression.ZipArchive]$zip, [string]$text, [string]$entryName) {
  $entry = $zip.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $out = $entry.Open()
  try { $bytes = $utf8.GetBytes($text); $out.Write($bytes, 0, $bytes.Length) } finally { $out.Dispose() }
}
function Rel([string]$base, [string]$file) { $file.Substring($base.Length).TrimStart('\', '/') -replace '\\', '/' }

# $replace: published path -> source file on disk (or $null to leave the file out)
function Build-Web([string]$zipPath, [string[]]$include, [hashtable]$replace, [hashtable]$texts) {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  $count = 0
  try {
    foreach ($item in $include) {
      $path = Join-Path $root $item
      if (-not (Test-Path $path)) { throw "Missing: $item" }
      $files = if ((Get-Item $path -Force).PSIsContainer) { Get-ChildItem $path -Recurse -File -Force } else { @(Get-Item $path -Force) }
      foreach ($f in $files) {
        $relDir = $f.FullName.Substring($root.Length).TrimStart('\')
        if ($excludeDirs | Where-Object { $relDir.StartsWith($_ + '\') }) { continue }
        $rel = Rel $root $f.FullName
        if ($texts.ContainsKey($rel)) { Add-TextToZip $zip $texts[$rel] $rel; $count++; continue }
        $src = if ($replace.ContainsKey($rel)) { $replace[$rel] } else { $f.FullName }
        Add-FileToZip $zip $src $rel
        $count++
      }
    }
  } finally { $zip.Dispose() }
  "Website package: $zipPath ($count files)"
}

function Build-Private([string]$zipPath, [string]$folder, [hashtable]$texts) {
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  $src = Join-Path $root "deploy\aquva-private"
  $zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in Get-ChildItem $src -Recurse -File -Force) {
      $rel = Rel $src $f.FullName
      if ($texts.ContainsKey($rel)) { Add-TextToZip $zip $texts[$rel] ($folder + "/" + $rel) }
      else { Add-FileToZip $zip $f.FullName ($folder + "/" + $rel) }
    }
  } finally { $zip.Dispose() }
  "Private folder package: $zipPath ($folder)"
}

$common = @("index.html", "404.html", "site.webmanifest", ".htaccess", "css", "js", "shop", "api", "assets")

if ($Target -ne "staging") {
  Build-Web (Join-Path $dist "aquva-hr-public_html.zip") ($common + @("robots.txt", "sitemap.xml")) @{} @{}
  Build-Private (Join-Path $dist "aquva-private-first-time.zip") "aquva-private" @{}
}

if ($Target -ne "production") {
  $stage = Join-Path $dist "staging"
  New-Item -ItemType Directory -Force $stage | Out-Null

  $envPhp = [System.IO.File]::ReadAllText((Join-Path $root "api\lib\environment.php"))
  $envPhp = $envPhp -replace "'environment' => 'production'", "'environment' => 'staging'" `
                    -replace "'private_dir_name' => 'aquva-private'", "'private_dir_name' => 'aquva-private-staging'"
  if ($envPhp -notmatch "'environment' => 'staging'" -or $envPhp -notmatch "'aquva-private-staging'") { throw "Could not write staging environment.php" }

  $sample = [System.IO.File]::ReadAllText((Join-Path $root "deploy\aquva-private\newsletter-config.sample.php"))
  $sample = $sample -replace "'site_url' => 'https://www\.aquva\.hr',", "'site_url' => '',   // staging: '' = the staging address itself"
  $sample = $sample -replace "open https://www\.aquva\.hr/api/newsletter-export\.php", "open https://<staging address>/api/newsletter-export.php"
  $sample = $sample -replace "AQUVA newsletter settings \(PRIVATE, outside public_html\)", "AQUVA newsletter settings STAGING (PRIVATE, outside public_html)"
  $sample = $sample -replace "/aquva-private/newsletter-config\.php", "/aquva-private-staging/newsletter-config.php"
  if ($sample -notmatch "'site_url' => ''") { throw "Could not write staging config sample" }

  $readme = [System.IO.File]::ReadAllText((Join-Path $root "deploy\aquva-private\README.txt"))
  $readme = "STAGING COPY: this folder must be named aquva-private-staging. It holds TEST sign-ups only.`r`n" +
            "It is separate from aquva-private (production) and may be deleted after testing.`r`n`r`n" + (($readme -replace "/aquva-private/ ", "/aquva-private-staging/ ") -replace "Never delete this folder and never upload", "Never upload")

  Build-Web (Join-Path $stage "aquva-staging-public_html.zip") $common `
    @{ ".htaccess" = (Join-Path $root "deploy\staging\.htaccess") } `
    @{ "api/lib/environment.php" = $envPhp }
  Build-Private (Join-Path $stage "aquva-private-staging-first-time.zip") "aquva-private-staging" `
    @{ "newsletter-config.sample.php" = $sample; "README.txt" = $readme }
}
