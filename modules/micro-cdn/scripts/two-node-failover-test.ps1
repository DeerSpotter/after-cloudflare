$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$CoordinatorUrl = if ($env:COORDINATOR_URL) { $env:COORDINATOR_URL } else { "http://127.0.0.1:18080" }
$FastNodeUrl = if ($env:FAST_NODE_URL) { $env:FAST_NODE_URL } else { "http://127.0.0.1:18081" }
$SlowNodeUrl = if ($env:SLOW_NODE_URL) { $env:SLOW_NODE_URL } else { "http://127.0.0.1:18082" }
$AssetPath = Join-Path $Root "demo-assets\hello.txt"
$OutputPath = Join-Path $Root "downloaded-hedged-hello.txt"
$ContentId = "demo/hello.txt"
$PublicPath = "/mcdn/demo/hello.txt"

if (-not (Test-Path $AssetPath)) {
    throw "Missing demo asset: $AssetPath"
}

$Hash = (Get-FileHash -Path $AssetPath -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host "Two node hedged failover test"
Write-Host "Coordinator: $CoordinatorUrl"
Write-Host "Fast node:   $FastNodeUrl"
Write-Host "Slow node:   $SlowNodeUrl"
Write-Host "Public path: $PublicPath"
Write-Host "SHA256:      $Hash"
Write-Host ""

Write-Host "Approving content..."
Invoke-RestMethod -Method Post -Uri "$CoordinatorUrl/content/approve" -ContentType "application/json" -Body (@{
    contentId = $ContentId
    namespace = "demo"
    displayPath = "hello.txt"
    publicPath = $PublicPath
    sha256 = $Hash
    url = "local-demo://hello.txt"
    originUrl = "local-demo://hello.txt"
    contentType = "text/plain"
    sizeBytes = (Get-Item $AssetPath).Length
    maxAgeSeconds = 86400
} | ConvertTo-Json)

Write-Host "Registering slow node fixture as node-slow..."
Invoke-RestMethod -Method Post -Uri "$CoordinatorUrl/nodes/register" -ContentType "application/json" -Body (@{
    nodeId = "node-slow"
    region = "local-dev"
    maxDiskMb = 128
    maxBandwidthMbps = 25
    microCdnEnabled = $true
    publicAddress = $SlowNodeUrl
} | ConvertTo-Json)

Write-Host "Advertising slow node first so it can become primary before quality feedback..."
Invoke-RestMethod -Method Post -Uri "$CoordinatorUrl/content/advertise" -ContentType "application/json" -Body (@{
    nodeId = "node-slow"
    contentId = $ContentId
} | ConvertTo-Json)

Write-Host "Caching asset on fast node..."
Invoke-RestMethod -Method Post -Uri "$FastNodeUrl/cache/local-file" -ContentType "application/json" -Body (@{
    contentId = $ContentId
    namespace = "demo"
    displayPath = "hello.txt"
    sourcePath = $AssetPath
    sha256 = $Hash
    contentType = "text/plain"
} | ConvertTo-Json)

Write-Host "Requesting route plan..."
$Route = Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/route?path=$([uri]::EscapeDataString($PublicPath))&candidateLimit=2&firstByteTimeoutMs=250&backupRaceAfterMs=75&deadlineMs=1200"
$Route.candidates | Format-Table role, nodeId, raceAfterMs, firstByteTimeoutMs, score

if ($Route.candidates.Count -lt 2) {
    throw "Expected at least two candidates, but got $($Route.candidates.Count)."
}

Write-Host "Running hedged fetch..."
$env:COORDINATOR_URL = $CoordinatorUrl
$env:CANDIDATE_LIMIT = "2"
$env:FIRST_BYTE_TIMEOUT_MS = "250"
$env:BACKUP_RACE_AFTER_MS = "75"
$env:DEADLINE_MS = "1200"
$HedgedOutput = node (Join-Path $Root "scripts\hedged-fetch.mjs") $PublicPath $OutputPath
$HedgedOutput | Write-Host
$Result = $HedgedOutput | ConvertFrom-Json

if ($Result.ok -ne $true) {
    throw "Hedged fetch failed."
}

if ($Result.winner.nodeId -ne "node-001") {
    throw "Expected fast node node-001 to win, but winner was $($Result.winner.nodeId)."
}

if (-not (Test-Path $OutputPath)) {
    throw "Expected output file was not written: $OutputPath"
}

$OutputHash = (Get-FileHash -Path $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($OutputHash -ne $Hash) {
    throw "Output hash mismatch. Expected $Hash but got $OutputHash"
}

Write-Host "Checking updated coordinator quality stats..."
$Status = Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/status"
$Status.nodes | Format-Table nodeId, requestCount, successCount, timeoutCount, firstByteAvgMs, firstByteP95Ms, qualityScore

Write-Host "PASS: Hedged client used backup race and selected fast node before slow primary completed."
