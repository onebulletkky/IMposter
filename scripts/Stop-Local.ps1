param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $repoRoot '.local/services.json'
if (Test-Path -LiteralPath $recordPath) {
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    $PostgresBin = $record.PostgresBin
    foreach ($service in $record.Processes) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($service.Id)"
        if ($process -and $process.CommandLine -and $process.CommandLine.Contains($service.Marker) -and $service.Marker.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Stop-Process -Id $service.Id
        }
    }
    Remove-Item -LiteralPath $recordPath
}
$databaseDir = Join-Path $repoRoot '.local/postgres'
if (Test-Path -LiteralPath (Join-Path $databaseDir 'postmaster.pid')) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $databaseDir -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop the workspace PostgreSQL cluster.' }
}
Write-Output 'Local services stopped. Database files are preserved in .local/postgres.'
