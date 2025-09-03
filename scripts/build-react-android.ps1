param(
  [string]$AppPath = "react-native/apps/mobile"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Has-Cmd($name) {
  try { $null = Get-Command $name -ErrorAction Stop; return $true } catch { return $false }
}

Write-Host "==> Checking prerequisites"
$hasNode = Has-Cmd node
$hasNpm  = Has-Cmd npm.cmd
$hasNpx  = Has-Cmd npx.cmd
$javaOutput = ''
$hasJava = $false
try {
  $javaOutput = (& java -version) 2>&1 | Select-Object -First 1
  if ($LASTEXITCODE -eq 0) { $hasJava = $true }
} catch {
  $hasJava = $false
}
$sdkmanager = Has-Cmd sdkmanager

if ($hasNode) { $nodeVer = & node --version } else { $nodeVer = 'missing' }
if ($hasNpm)  { $npmVer  = & npm.cmd --version } else { $npmVer  = 'missing' }
if ($hasNpx)  { $npxStr  = (& npx.cmd --version); if (-not $npxStr) { $npxStr = 'found' } } else { $npxStr  = 'missing' }
if ($hasJava) { $javaStr = $javaOutput } else { $javaStr = 'missing (need Java 17)' }
if ($sdkmanager) { $sdkStr = 'found' } else { $sdkStr = 'not on PATH (Android Studio recommended)' }

Write-Host "Node:    $nodeVer"
Write-Host "npm:     $npmVer"
Write-Host "npx:     $npxStr"
Write-Host "Java:    $javaStr"
Write-Host "SDKMgr:  $sdkStr"

if (-not $hasNode -or -not $hasNpm -or -not $hasNpx) {
  Write-Error "Node/npm/npx are required. Install Node.js LTS, then re-run."
}
if (-not $hasJava) {
  # Try to set JAVA_HOME for this session to common Temurin paths
  $temurin = "C:\\Program Files\\Eclipse Adoptium\\jdk-17"
  $microsoft = "C:\\Program Files\\Microsoft\\jdk-17"
  if (Test-Path $temurin) { $env:JAVA_HOME = $temurin; $env:Path = "$env:JAVA_HOME\bin;" + $env:Path }
  elseif (Test-Path $microsoft) { $env:JAVA_HOME = $microsoft; $env:Path = "$env:JAVA_HOME\bin;" + $env:Path }
  try {
    $javaOutput = (& java -version) 2>&1 | Select-Object -First 1
    if ($LASTEXITCODE -eq 0) { $hasJava = $true; Write-Host "Java (session): $javaOutput" }
  } catch {}
  if (-not $hasJava) {
    Write-Warning "Java 17 required for Android builds. Install Temurin or Microsoft OpenJDK 17."
  }
}

# If Java is available, derive JAVA_HOME from java settings for this session
if ($hasJava -or (Get-Command java -ErrorAction SilentlyContinue)) {
  try {
    $props = (& java -XshowSettings:properties -version) 2>&1
    $line = $props | Where-Object { $_ -match '^\s*java\.home\s*=\s*' } | Select-Object -First 1
    if ($line) {
      $home = ($line -split '=')[1].Trim()
      # If it looks like a jre subdir, take parent
      if ($home.ToLower().EndsWith("\jre")) { $home = Split-Path -Parent $home }
      $env:JAVA_HOME = $home
      $env:GRADLE_JAVA_HOME = $home
      Write-Host "JAVA_HOME set for session: $home"
    }
  } catch {}
}

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$appDir = Join-Path $root $AppPath
if (-not (Test-Path $appDir)) { Write-Error "App path not found: $appDir" }

Push-Location $appDir
try {
  # Initialize android project if missing
  if (-not (Test-Path 'android')) {
    Write-Host "==> Initializing React Native project (android)"
    if (-not $hasNpx) { throw "npx is required to initialize React Native (install Node.js which includes npx)" }
    & npx.cmd react-native@0.74 init TempBudgetApp --version 0.74.0 --skip-install
    Move-Item -Force -Path (Join-Path 'TempBudgetApp' 'android') -Destination 'android'
    if (-not (Test-Path 'ios')) { Move-Item -Force -Path (Join-Path 'TempBudgetApp' 'ios') -Destination 'ios' }
    Remove-Item -Recurse -Force 'TempBudgetApp'
  }

  # Install JS deps
  if (Test-Path 'package.json') {
    Write-Host "==> Installing npm dependencies"
    if (Test-Path 'package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
  }

  # Build Release APK & AAB
  $androidDir = Join-Path (Get-Location) 'android'
  if (-not (Test-Path $androidDir)) { Write-Error "Android directory missing at $androidDir" }
  # Ensure local.properties points to a plausible SDK location
  $localProps = Join-Path $androidDir 'local.properties'
  $sdkDir = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  New-Item -ItemType Directory -Force -Path $sdkDir | Out-Null
  "sdk.dir=$sdkDir" | Out-File -FilePath $localProps -Encoding ascii -Force
  # Quick SDK check and hint
  $platformOk = Test-Path (Join-Path $sdkDir 'platforms\android-34')
  $buildtoolsOk = (Get-ChildItem -Path (Join-Path $sdkDir 'build-tools') -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^34' } | Measure-Object).Count -gt 0
  if (-not $platformOk -or -not $buildtoolsOk) {
    Write-Warning "Android SDK platform 34 and/or build-tools 34.x not found at $sdkDir. If Gradle fails, open Android Studio > SDK Manager and install: Android 14 (API 34) and Build-tools 34.x, and accept licenses."
  }
  Push-Location $androidDir
  try {
    Write-Host "==> Running Gradle assembleRelease & bundleRelease"
    .\gradlew --no-daemon assembleRelease bundleRelease
  } finally { Pop-Location }

  # Collect artifacts
  $apkGlob = "android/app/build/outputs/apk/release/*.apk"
  $aabGlob = "android/app/build/outputs/bundle/release/*.aab"
  $outDir = Join-Path $root 'artifacts/react-android'
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  Get-ChildItem -Path $apkGlob -ErrorAction SilentlyContinue | Copy-Item -Destination $outDir -Force -ErrorAction SilentlyContinue
  Get-ChildItem -Path $aabGlob -ErrorAction SilentlyContinue | Copy-Item -Destination $outDir -Force -ErrorAction SilentlyContinue

  Write-Host "==> Done. Check artifacts in: $outDir"
}
finally { Pop-Location }
