param(
  [string]$EnvFile = ".env.local",
  [string]$OutDir = "work/audio",
  [string]$NarrationDir = "narration"
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
  @{ Input = (Join-Path $NarrationDir "part1_scene1_narration.txt"); Output = "$OutDir/part1_scene1_voiceover_openai_shimmer.wav" },
  @{ Input = (Join-Path $NarrationDir "part1_scene2_narration.txt"); Output = "$OutDir/part1_scene2_voiceover_openai_shimmer.wav" },
  @{ Input = (Join-Path $NarrationDir "part1_scene3_narration.txt"); Output = "$OutDir/part1_scene3_voiceover_openai_shimmer.wav" },
  @{ Input = (Join-Path $NarrationDir "part1_scene4_narration.txt"); Output = "$OutDir/part1_scene4_voiceover_openai_shimmer.wav" },
  @{ Input = (Join-Path $NarrationDir "part1_scene5_narration.txt"); Output = "$OutDir/part1_scene5_voiceover_openai_shimmer.wav" }
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
    speed = 0.88
    instructions = "Sweet, professional adult female narration. Calm educational documentary tone, clear pronunciation of nutrient names, warm authority, no theatrical exaggeration."
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
