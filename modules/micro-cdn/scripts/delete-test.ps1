$ErrorActionPreference = "Stop"

$CoordinatorUrl = "http://127.0.0.1:8080"
$NodeUrl = "http://127.0.0.1:8081"
$ContentId = "hello.txt"

Write-Host "Deleting cached content from node: $ContentId"
Invoke-RestMethod `
    -Method Delete `
    -Uri "$NodeUrl/cache/$ContentId"

Write-Host "Node manifest after delete:"
Invoke-RestMethod -Method Get -Uri "$NodeUrl/manifest" | ConvertTo-Json -Depth 10

Write-Host "Coordinator status after unadvertise:"
Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/status" | ConvertTo-Json -Depth 10

Write-Host "Route should now fail if no other node serves this content:"
try {
    Invoke-RestMethod -Method Get -Uri "$CoordinatorUrl/route?contentId=$ContentId" | ConvertTo-Json -Depth 10
} catch {
    Write-Host $_.Exception.Message
}
