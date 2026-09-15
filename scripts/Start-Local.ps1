param(
    [int]$DatabasePort = 55432,
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $repoRoot '.local'
$databaseDir = Join-Path $localDir 'postgres'
New-Item -ItemType Directory -Force -Path $localDir > $null

if (Test-Path -LiteralPath (Join-Path $localDir 'services.json')) {
    throw 'Local service records already exist. Run scripts/Stop-Local.ps1 before restarting.'
}
if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin 'pg_ctl.exe'))) {
    throw 'PostgreSQL binaries were not found. Set -PostgresBin or use Docker Compose.'
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeDir = Join-Path $repoRoot '.tools/node-v22.23.2-win-x64'
if ($nodeCommand) {
    $installedVersion = & $nodeCommand.Source --version
    if ([version]$installedVersion.TrimStart('v') -ge [version]'22.12.0') {
        $nodeDir = Split-Path -Parent $nodeCommand.Source
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) {
    throw 'Node.js 22.12 or newer is required. Install Node.js or run scripts/Install-Node.ps1.'
}
$env:PATH = $nodeDir + [IO.Path]::PathSeparator + $env:PATH
foreach ($listener in [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()) {
    if ($listener.Port -in @(5080, 5081, 5173)) {
        throw "Port $($listener.Port) is already in use. Stop that service before starting this environment."
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $databaseDir 'PG_VERSION'))) {
    # This isolated development cluster accepts local connections only.
    & (Join-Path $PostgresBin 'initdb.exe') -D $databaseDir -U imposter -A trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
}
& (Join-Path $PostgresBin 'pg_ctl.exe') -D $databaseDir status > $null
if ($LASTEXITCODE -ne 0) {
    $arguments = '-D "{0}" -l "{1}" -o "-h 127.0.0.1 -p {2}" -w start' -f $databaseDir, (Join-Path $localDir 'postgres.log'), $DatabasePort
    $starter = Start-Process -FilePath (Join-Path $PostgresBin 'pg_ctl.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
    if (-not $starter.WaitForExit(30000)) { throw 'PostgreSQL did not start within 30 seconds.' }
    if ($starter.ExitCode -ne 0) { throw 'PostgreSQL failed to start. See .local/postgres.log.' }
}
foreach ($databaseName in @('imposter_games', 'imposter_words')) {
    $exists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U imposter -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$databaseName'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to the local PostgreSQL cluster.' }
    if ($exists -ne '1') {
        & (Join-Path $PostgresBin 'createdb.exe') -h 127.0.0.1 -p $DatabasePort -U imposter $databaseName
        if ($LASTEXITCODE -ne 0) { throw "Could not create $databaseName." }
    }
}

Push-Location $repoRoot
try {
    dotnet build Imposter.slnx
    if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
    Push-Location (Join-Path $repoRoot 'src/imposter-web')
    try {
        & (Join-Path $nodeDir 'npm.cmd') ci --no-audit --cache (Join-Path $repoRoot '.tools/npm-cache') --fetch-retries=0 --fetch-timeout=20000
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency install failed.' }
    } finally { Pop-Location }

    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    if (-not $env:Services__ApiKey) { $env:Services__ApiKey = 'dev-imposter-service-key-local-only' }
    $env:ConnectionStrings__Games = "Host=127.0.0.1;Port=$DatabasePort;Database=imposter_games;Username=imposter"
    $env:ConnectionStrings__Words = "Host=127.0.0.1;Port=$DatabasePort;Database=imposter_words;Username=imposter"
    $env:Services__WordsUrl = 'http://localhost:5081'
    if (-not $env:SeedDemoWords) { $env:SeedDemoWords = 'true' }
    $services = @()
    $startedProcesses = @()
    try {
        foreach ($serviceName in @('Words', 'Game')) {
            $serviceDir = Join-Path $repoRoot "src/Imposter.$serviceName.Api"
            $port = if ($serviceName -eq 'Words') { 5081 } else { 5080 }
            $env:ASPNETCORE_URLS = "http://localhost:$port"
            $dll = Join-Path $serviceDir "bin/Debug/net10.0/Imposter.$serviceName.Api.dll"
            $process = Start-Process -FilePath (Get-Command dotnet).Source -ArgumentList ('"{0}"' -f $dll) -WorkingDirectory $serviceDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDir "$serviceName.stdout.log") -RedirectStandardError (Join-Path $localDir "$serviceName.stderr.log")
            $services += @{ Id = $process.Id; Name = $serviceName; Marker = $dll }
            $startedProcesses += $process
        }
        $webDir = Join-Path $repoRoot 'src/imposter-web'
        $vitePath = Join-Path $webDir 'node_modules/vite/bin/vite.js'
        $process = Start-Process -FilePath (Join-Path $nodeDir 'node.exe') -ArgumentList ('"{0}" --host 127.0.0.1 --port 5173 --strictPort' -f $vitePath) -WorkingDirectory $webDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localDir 'web.stdout.log') -RedirectStandardError (Join-Path $localDir 'web.stderr.log')
        $services += @{ Id = $process.Id; Name = 'Web'; Marker = $vitePath }
        $startedProcesses += $process
    } finally {
        @{ DatabasePort = $DatabasePort; PostgresBin = $PostgresBin; Processes = $services } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $localDir 'services.json') -Encoding Ascii
    }
    foreach ($url in @('http://localhost:5081/health/ready', 'http://localhost:5080/health/ready', 'http://127.0.0.1:5173')) {
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            foreach ($started in $startedProcesses) {
                $started.Refresh()
                if ($started.HasExited) { throw 'A local service exited during startup. Check the logs in .local.' }
            }
            try {
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            } catch { Start-Sleep -Milliseconds 500 }
        }
        if (-not $ready) { throw "Service not ready at $url. Check .local logs. Run Stop-Local.ps1 to stop started services." }
    }
    Write-Output 'Imposter is ready at http://127.0.0.1:5173'
    Write-Output 'Use separate browser tabs for different players. Logs are in .local.'
} finally { Pop-Location }
