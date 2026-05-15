$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AssetPath = Join-Path $Root "demo-assets\hello.txt"
$CoordinatorUrl = "http://127.0.0.1:8080"
$NodeUrl = "http://127.0.0.1:8081"

if (-not (Test-Path $AssetPath)) {
    throw "Demo asset not found: $AssetPath"
}

$Sha256 = (Get-FileHash -Algorithm SHA256 -Path $AssetPath).Hash.ToLowerInvariant()

Write-Host "Approving demo content..."
Invoke-RestMethod `
    -Method Post `
    -Uri "$CoordinatorUrl/content/approve" `
    -ContentType "application/json" `
    -Body (@{
        contentId = "hello.txt"
        sha256 = $Sha256
        url = "local-demo://hello.txt"
        maxAgeSeconds = 86400
    } | ConvertTo-Json)

Write-Host "Asking node to cache local file..."
Invoke-RestMethod `
    -Method Post `
    -Uri "$NodeUrl/cache/local-file" `
    -ContentType "application/json" `
    -Body (@{
        contentId = "hello.txt"
        sourcePath = $AssetPath
        sha256 = $Sha256
    } | ConvertTo-Json)

Write-Host "Requesting route from coordinator..."
$Route = Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/route?contentId=hello.txt"
$DownloadUrl = $Route.selectedNode.downloadUrl

Write-Host "Downloading from selected node: $DownloadUrl"
$Downloaded = Invoke-RestMethod -Method Get -Uri $DownloadUrl

Write-Host "Downloaded content:"
Write-Host $Downloaded

Write-Host "Coordinator status:"
Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/status" | ConvertTo-Json -Depth 10
