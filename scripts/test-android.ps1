param(
    [string]$Python = "python",
    [string]$PackageId = "com.example.budget_manager_mobile",
    [string]$Apk = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolve adb from PATH or known locations (BeeWare SDK or repo tools)
function Resolve-AdbPath {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Path }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "BeeWare/briefcase/Cache/tools/android_sdk/platform-tools/adb.exe"),
        (Join-Path $PSScriptRoot "../tools/android/platform-tools/adb.exe")
    )
    foreach ($c in $candidates) {
        $full = (Resolve-Path -Path $c -ErrorAction SilentlyContinue)
        if ($full) { return $full.Path }
    }
    return $null
}

$adb = Resolve-AdbPath

# Strip UTF-8 BOM if present (Gradle/Groovy can't handle BOM at start)
function Remove-BomIfPresent {
    param([Parameter(Mandatory=$true)][string]$Path)
    if (-not (Test-Path $Path)) { return }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            Write-Host "==> Stripping UTF-8 BOM: $Path"
            $out = $bytes[3..($bytes.Length-1)]
            [System.IO.File]::WriteAllBytes($Path, $out)
        }
    } catch {
        Write-Warning ("Couldn't strip BOM from {0}: {1}" -f $Path, $_)
    }
}

if (-not $Apk) {
    Write-Host "==> Ensuring Briefcase is available"
    & $Python -m pip install --upgrade pip | Out-Null
    & $Python -m pip install briefcase==0.3.20 | Out-Null

    Push-Location "$PSScriptRoot\..\mobile"
    try {
    Write-Host "==> Building Android APK via Briefcase"
    # Create the project if needed; ignore failure if tools like git are missing but project already exists
    try { & $Python -m briefcase create android -v --no-input } catch { Write-Warning "briefcase create failed; continuing if project already exists..." }
    # Ensure Python sources and metadata are copied into the Gradle project; refresh requirements (-r)
    try { & $Python -m briefcase update android -v --no-input -r } catch { Write-Warning "briefcase update failed; continuing to build..." }

    # Safety net: Ensure Material Components dependency is present in Gradle app module
    $gradleApp = Join-Path $PWD "build/budget_manager_mobile/android/gradle/app/build.gradle"
    $gradleAppDir = Split-Path -Path $gradleApp -Parent
    if (Test-Path $gradleApp) {
        Remove-BomIfPresent -Path $gradleApp
        $gradleContent = Get-Content -Raw -Path $gradleApp
        if ($gradleContent -notmatch "com\.google\.android\.material:material") {
            Write-Host "==> Injecting Material dependency into Gradle (app/build.gradle)"
            $pattern = '(?s)(dependencies\s*\{)'
            $replacement = '$1' + [Environment]::NewLine + '    implementation "com.google.android.material:material:1.11.0"'
            $patched = [regex]::Replace($gradleContent, $pattern, $replacement)
            $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
            [System.IO.File]::WriteAllText($gradleApp, $patched, $utf8NoBom)
        }
        Remove-BomIfPresent -Path $gradleApp
    }

    # Fallback: Write Gradle-side Python requirements file where Chaquopy expects it
    $reqPath = Join-Path $gradleAppDir "requirements.txt"
    Write-Host "==> Writing Gradle requirements.txt (fallback)"
    $reqContent = @(
        "toga-android==0.5.2",
    "travertino==0.5.2",
        "XlsxWriter==3.2.0"
    ) -join [Environment]::NewLine
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($reqPath, $reqContent + [Environment]::NewLine, $utf8NoBom)
    Remove-BomIfPresent -Path $reqPath

    & $Python -m briefcase build android -v --no-input
    if ($LASTEXITCODE -ne 0) { throw "briefcase build failed" }

        # Ensure package entrypoint is present in Gradle python sources
        $gradlePy = Join-Path $PWD "build/budget_manager_mobile/android/gradle/app/src/main/python/budget_manager_mobile"
        $srcPkg = Join-Path $PWD "src/budget_manager_mobile"
        if (Test-Path $gradlePy) {
            New-Item -ItemType Directory -Path $gradlePy -Force | Out-Null
            if (Test-Path $srcPkg) {
                Copy-Item -Path (Join-Path $srcPkg "*.py") -Destination $gradlePy -Force -Recurse -ErrorAction SilentlyContinue
            }
        }

    # Dependencies come from mobile/pyproject.toml; Gradle requirements are regenerated.
        # Safety net again after any regeneration steps
        if (Test-Path $gradleApp) {
            Remove-BomIfPresent -Path $gradleApp
            $gradleContent = Get-Content -Raw -Path $gradleApp
            if ($gradleContent -notmatch "com\.google\.android\.material:material") {
                Write-Host "==> Re-injecting Material dependency into Gradle (app/build.gradle)"
                $pattern = '(?s)(dependencies\s*\{)'
                $replacement = '$1' + [Environment]::NewLine + '    implementation "com.google.android.material:material:1.11.0"'
                $patched = [regex]::Replace($gradleContent, $pattern, $replacement)
                $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
                [System.IO.File]::WriteAllText($gradleApp, $patched, $utf8NoBom)
            }
            Remove-BomIfPresent -Path $gradleApp
        }

        # Rebuild to pick up copied sources
    & $Python -m briefcase build android -v --no-input
        if ($LASTEXITCODE -ne 0) { throw "briefcase rebuild failed" }
        & $Python -m briefcase package android -v --no-input
        if ($LASTEXITCODE -ne 0) { throw "briefcase package failed" }

        $apkItem = Get-ChildItem -Path build -Recurse -Filter *.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $apkItem) { throw "No APK produced under 'mobile/build'" }
        $Apk = $apkItem.FullName
        Write-Host "==> APK: $Apk"
    }
    finally { Pop-Location }
}

Write-Host "==> Checking for device/emulator (adb)"
if (-not $adb) { Write-Error "adb not found. Install Android Platform Tools or ensure adb is on PATH."; exit 2 }
& "$adb" start-server | Out-Null
$devices = (& "$adb" devices) -split "`n" | Where-Object { $_ -match "`tdevice$" }
if (-not $devices) {
    Write-Warning "No connected device/emulator. Start an emulator from Android Studio, then re-run."
    exit 2
}

Write-Host "==> Installing APK"
& "$adb" install -r -g "$Apk" | Write-Host

Write-Host "==> Launching app with monkey ($PackageId)"
& "$adb" logcat -c | Out-Null
& "$adb" shell monkey -p $PackageId -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep -Seconds 8

Write-Host "==> Capturing logcat"
& "$adb" logcat -d | Out-File -FilePath "$PSScriptRoot\android-logcat.txt" -Encoding UTF8

# Detect common crash markers in logcat
$crash = Select-String -Path "$PSScriptRoot\android-logcat.txt" -Pattern @(
    'FATAL EXCEPTION',
    'Traceback (most recent call last)',
    'ImportError',
    'com.chaquo.python.PyException'
)
if ($crash) {
    Write-Error "Detected crash markers in logcat. See scripts/android-logcat.txt"
    exit 1
}

Write-Host "==> Smoke test passed. See scripts/android-logcat.txt"
exit 0
