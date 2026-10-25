$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:TUNNEL_TOKEN)) {
  throw 'Set TUNNEL_TOKEN to the remotely managed Cloudflare Tunnel token.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$docker = Get-Command docker.exe -ErrorAction Stop
$cloudflared = Get-Command cloudflared.exe -ErrorAction Stop
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

& $cloudflared.Source tunnel run
if ($LASTEXITCODE -ne 0) {
  throw 'The Cloudflare Tunnel stopped with an error.'
}
