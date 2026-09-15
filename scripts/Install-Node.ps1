$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolDir = Join-Path $repoRoot '.tools'
$nodeVersion = '22.23.2'
$archiveName = "node-v$nodeVersion-win-x64.zip"
New-Item -ItemType Directory -Force -Path $toolDir > $null
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt" -OutFile (Join-Path $toolDir 'node-shasums.txt')
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile (Join-Path $toolDir $archiveName)
$expected = (Select-String -LiteralPath (Join-Path $toolDir 'node-shasums.txt') -SimpleMatch $archiveName).Line.Split(' ')[0]
$actual = (Get-FileHash -LiteralPath (Join-Path $toolDir $archiveName) -Algorithm SHA256).Hash
if ($actual -ne $expected) { throw 'Node.js archive checksum mismatch.' }
Expand-Archive -LiteralPath (Join-Path $toolDir $archiveName) -DestinationPath $toolDir -Force
Write-Output "Portable Node.js installed in .tools/node-v$nodeVersion-win-x64. Start-Local.ps1 will use it."
