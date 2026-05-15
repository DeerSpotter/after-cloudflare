$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AssetPath = Join-Path $Root "demo-assets\hello.txt"
$CoordinatorUrl = "http://127.0.0.1:8080"
$NodeUrl = "http://127.0.0.1:8081"
$Namespace = "demo"
$DisplayPath = "hello.txt"
$ContentId = "$Namespace/$DisplayPath"
$PublicPath = "/mcdn/$Namespace/$DisplayPath"

if (-not (Test-Path $AssetPath)) {
    throw "Demo asset not found: $AssetPath"
}

$Sha256 = (Get-FileHash -Algorithm SHA256 -Path $AssetPath).Hash.ToLowerInvariant()

Write-Host "Approving demo content path: $PublicPath"
Invoke-RestMethod `
    -Method Post `
    -Uri "$CoordinatorUrl/content/approve" `
    -ContentType "application/json" `
    -Body (@{
        contentId = $ContentId
        namespace = $Namespace
        displayPath = $DisplayPath
        sha256 = $Sha256
        url = "local-demo://hello.txt"
        originUrl = "local-demo://hello.txt"
        contentType = "text/plain"
        maxAgeSeconds = 86400
    } | ConvertTo-Json)

Write-Host "Asking node to cache local file by public path..."
Invoke-RestMethod `
    -Method Post `
    -Uri "$NodeUrl/cache/local-file" `
    -ContentType "application/json" `
    -Body (@{
        contentId = $ContentId
        namespace = $Namespace
        displayPath = $DisplayPath
        sourcePath = $AssetPath
        sha256 = $Sha256
        contentType = "text/plain"
    } | ConvertTo-Json)

Write-Host "Requesting route from coordinator by public path..."
$Route = Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/route?path=$([uri]::EscapeDataString($PublicPath))"
$DownloadUrl = $Route.selectedNode.downloadUrl

Write-Host "Downloading from selected node: $DownloadUrl"
$Downloaded = Invoke-RestMethod -Method Get -Uri $DownloadUrl

Write-Host "Downloaded content:"
Write-Host $Downloaded

Write-Host "Node manifest:"
Invoke-RestMethod -Method Get -Uri "$NodeUrl/manifest" | ConvertTo-Json -Depth 10

Write-Host "Coordinator status:"
Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/status" | ConvertTo-Json -Depth 10
