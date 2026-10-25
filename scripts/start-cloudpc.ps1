$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$docker = Get-Command docker.exe -ErrorAction Stop
$cloudflared = Get-Command cloudflared.exe -ErrorAction Stop
$logDirectory = Join-Path $repoRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$stdoutLog = Join-Path $logDirectory 'cloudflared-quick-tunnel.stdout.log'
$stderrLog = Join-Path $logDirectory 'cloudflared-quick-tunnel.stderr.log'
$deadline = (Get-Date).AddMinutes(3)
$dockerReady = $false

while ((Get-Date) -lt $deadline) {
  & $docker.Source info *> $null
  if ($LASTEXITCODE -eq 0) {
    $dockerReady = $true
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
  throw 'Docker did not become ready within three minutes.'
}

& $docker.Source compose --project-directory $repoRoot up --detach --remove-orphans
if ($LASTEXITCODE -ne 0) {
  throw 'Docker Compose failed to start the application.'
}

$tunnel = Start-Process -FilePath $cloudflared.Source `
  -ArgumentList @('tunnel', '--url', 'http://localhost:3000') `
  -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

try {
  $tunnelDeadline = (Get-Date).AddSeconds(90)
  $tunnelUrl = $null

  while ((Get-Date) -lt $tunnelDeadline -and -not $tunnel.HasExited) {
    $logs = @($stdoutLog, $stderrLog) |
      Where-Object { Test-Path -LiteralPath $_ } |
      ForEach-Object { Get-Content -LiteralPath $_ -Raw }
    $urlMatch = [regex]::Match(($logs -join "`n"), 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($urlMatch.Success) {
      $tunnelUrl = $urlMatch.Value
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $tunnelUrl) {
    throw 'Cloudflare did not provide a Quick Tunnel URL within 90 seconds.'
  }

  $callbackUrl = "$tunnelUrl/auth/google/callback"
  $envPath = Join-Path $repoRoot '.env'
  $envLines = [System.Collections.Generic.List[string]]::new()
  $callbackFound = $false
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^GOOGLE_CALLBACK_URL=') {
      $envLines.Add("GOOGLE_CALLBACK_URL='$callbackUrl'")
      $callbackFound = $true
    } else {
      $envLines.Add($line)
    }
  }
  if (-not $callbackFound) {
    throw 'GOOGLE_CALLBACK_URL was not found in .env.'
  }

  [IO.File]::WriteAllLines($envPath, $envLines.ToArray(), [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText(
    (Join-Path $logDirectory 'google-callback-url.txt'),
    "$callbackUrl`r`n",
    [Text.UTF8Encoding]::new($false)
  )

  & $docker.Source compose --project-directory $repoRoot up --detach --force-recreate app
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not restart the app with the current tunnel callback URL.'
  }

  Write-Host "Current Google callback URL: $callbackUrl"
  Write-Host 'Add this exact URL to the Google OAuth client authorized redirect URIs.'
  Wait-Process -Id $tunnel.Id
  if ($tunnel.ExitCode -ne 0) {
    throw 'The Cloudflare Quick Tunnel stopped with an error.'
  }
} catch {
  if (-not $tunnel.HasExited) {
    Stop-Process -Id $tunnel.Id -Force
  }
  throw
}
