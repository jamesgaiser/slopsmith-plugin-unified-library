$src = "$PSScriptRoot"
$dst = "$env:APPDATA\slopsmith-desktop\plugins\unified_library"

if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst | Out-Null
    Write-Output "Created plugin directory: $dst"
}

# Bump the dev patch number in plugin.json to bust the browser cache
$json = Get-Content "$src\plugin.json" -Raw | ConvertFrom-Json
if ($json.version -match '^(\d+\.\d+\.\d+)-dev(?:\.(\d+))?$') {
    $base  = $Matches[1]
    $patch = if ($Matches[2]) { [int]$Matches[2] + 1 } else { 1 }
    $json.version = "$base-dev.$patch"
    $json | ConvertTo-Json -Compress | Set-Content "$src\plugin.json"
    Write-Output "Version bumped to $($json.version)"
}

Copy-Item "$src\screen.js"      "$dst\screen.js"      -Force
Copy-Item "$src\screen.html"    "$dst\screen.html"    -Force
Copy-Item "$src\settings.html"  "$dst\settings.html"  -Force
Copy-Item "$src\plugin.json"    "$dst\plugin.json"    -Force
Write-Output "Deployed to $dst"
