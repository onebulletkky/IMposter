param([string]$BaseUrl = 'http://localhost:5080')
$ErrorActionPreference = 'Stop'

function Invoke-GameApi {
    param([string]$Path, [string]$Method = 'GET', $Body = $null, $Player = $null)
    $parameters = @{ Uri = "$BaseUrl/api$Path"; Method = $Method; TimeoutSec = 10 }
    if ($Player) { $parameters.Headers = @{ Authorization = "Bearer $($Player.token)" } }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = ConvertTo-Json -InputObject $Body -Compress
    }
    Invoke-RestMethod @parameters
}
function Assert-Game {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$hostPlayer = Invoke-GameApi -Path '/lobbies' -Method POST -Body @{ nickname = 'SmokeHost' }
$code = $hostPlayer.code
Assert-Game ($code -cmatch '^[A-Z0-9]{5}$') 'Lobby code is invalid.'
$second = Invoke-GameApi -Path "/lobbies/$($code.ToLowerInvariant())/join" -Method POST -Body @{ nickname = 'SmokeSecond' }
$third = Invoke-GameApi -Path "/lobbies/$code/join" -Method POST -Body @{ nickname = 'SmokeThird' }
$players = @($hostPlayer, $second, $third)
$null = Invoke-GameApi -Path "/lobbies/$code/settings" -Method PUT -Player $hostPlayer -Body @{ impostorCount = 1; extraImpostorChancePercent = 0; roundCount = 1; turnSeconds = 30 }
$view = Invoke-GameApi -Path "/lobbies/$code/start" -Method POST -Player $hostPlayer
Assert-Game ($view.phase -eq 'Playing') 'Game did not start.'
$impostor = $null
$commonWord = $null
foreach ($player in $players) {
    $privateView = Invoke-GameApi -Path "/lobbies/$code" -Player $player
    Assert-Game ($null -eq $privateView.revealedWord) 'Common word leaked before the end.'
    foreach ($other in $privateView.players) {
        Assert-Game ($null -eq $other.isImpostor) 'Another player role leaked.'
    }
    if ($privateView.self.isImpostor) { $impostor = $player }
    else { $commonWord = $privateView.self.word }
}
Assert-Game ($null -ne $impostor -and $null -ne $commonWord) 'Role assignment is invalid.'
while ($view.phase -eq 'Playing') {
    $current = $null
    foreach ($player in $players) { if ($player.playerId -eq $view.currentPlayerId) { $current = $player } }
    $view = Invoke-GameApi -Path "/lobbies/$code/turn" -Method POST -Player $current -Body @{ turnNumber = $view.turnNumber }
}
Assert-Game ($view.phase -eq 'Voting') 'Round did not lead to voting.'
for ($index = 0; $index -lt $players.Count; $index++) {
    $view = Invoke-GameApi -Path "/lobbies/$code/votes" -Method POST -Player $players[$index] -Body @{ targetId = $players[($index + 1) % $players.Count].playerId }
}
Assert-Game ($view.phase -eq 'Guessing' -and $view.isVoteTie -and $view.guessesRemaining -eq 3) 'Tied vote did not grant three guesses.'
$view = Invoke-GameApi -Path "/lobbies/$code/guesses" -Method POST -Player $impostor -Body @{ word = 'SmokeIncorrectWord' }
Assert-Game ($view.phase -eq 'Guessing' -and $view.guessesRemaining -eq 2 -and $null -eq $view.revealedWord) 'Incorrect tie guess revealed or ended the game early.'
$view = Invoke-GameApi -Path "/lobbies/$code/guesses" -Method POST -Player $impostor -Body @{ word = " $($commonWord.ToUpperInvariant()) " }
Assert-Game ($view.phase -eq 'Finished' -and $view.winningTeam -eq 'Impostors' -and $view.revealedWord -eq $commonWord) 'Final guess did not reveal the result.'
$view = Invoke-GameApi -Path "/lobbies/$code/restart" -Method POST -Player $hostPlayer
Assert-Game ($view.phase -eq 'Lobby' -and $null -eq $view.self.word) 'Rematch did not clear private data.'
foreach ($player in $players) { $null = Invoke-GameApi -Path "/lobbies/$code/players/me" -Method DELETE -Player $player }
Write-Output 'HTTP smoke passed: create, join, private roles, turns, voting, tie guesses, reveal, rematch, leave.'
