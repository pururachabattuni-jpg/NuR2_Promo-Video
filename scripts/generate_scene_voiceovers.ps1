param(
  [string]$EnvFile = ".env.local",
  [string]$OutDir = "work/audio"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing environment file: $EnvFile"
}

$line = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -match '^\s*OPENAI_API_KEY\s*=' } | Select-Object -First 1
if (-not $line) {
  throw "OPENAI_API_KEY was not found in $EnvFile"
}

$apiKey = ($line -replace '^\s*OPENAI_API_KEY\s*=\s*', '').Trim().Trim('"').Trim("'")
if (-not $apiKey) {
  throw "OPENAI_API_KEY is empty in $EnvFile"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$scenes = @(
  @{ Input = "work/nur2_scene3_narration.txt"; Output = "$OutDir/nur2_scene3_voiceover_openai_shimmer_fixed.wav" },
  @{ Input = "work/nur2_scene4_punjab_narration.txt"; Output = "$OutDir/nur2_scene4_punjab_voiceover_openai_shimmer_fixed.wav" },
  @{ Input = "work/nur2_scene5_central_valley_narration.txt"; Output = "$OutDir/nur2_scene5_central_valley_voiceover_openai_shimmer_fixed.wav" },
  @{ Input = "work/nur2_scene6_cup_narration.txt"; Output = "$OutDir/nur2_scene6_cup_voiceover_openai_shimmer_fixed.wav" }
)

function Repair-WavHeader {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 44) {
    throw "WAV output is too small: $Path"
  }

  [BitConverter]::GetBytes([uint32]($bytes.Length - 8)).CopyTo($bytes, 4)
  [BitConverter]::GetBytes([uint32]($bytes.Length - 44)).CopyTo($bytes, 40)
  [System.IO.File]::WriteAllBytes($Path, $bytes)
}

foreach ($scene in $scenes) {
  if (-not (Test-Path -LiteralPath $scene.Input)) {
    throw "Missing narration file: $($scene.Input)"
  }

  $text = (Get-Content -LiteralPath $scene.Input -Raw).Trim()
  $body = @{
    model = "gpt-4o-mini-tts"
    voice = "shimmer"
    input = $text
    response_format = "wav"
    speed = 0.82
    instructions = "Sweet, professional adult female narration. Calm documentary tone, clear pacing, warm authority, no theatrical exaggeration."
  } | ConvertTo-Json -Depth 4

  Invoke-WebRequest `
    -Uri "https://api.openai.com/v1/audio/speech" `
    -Method Post `
    -Headers @{ Authorization = "Bearer $apiKey" } `
    -ContentType "application/json" `
    -Body $body `
    -OutFile $scene.Output | Out-Null

  Repair-WavHeader -Path $scene.Output
  $length = (Get-Item -LiteralPath $scene.Output).Length
  Write-Output "$($scene.Output) $length bytes"
}
