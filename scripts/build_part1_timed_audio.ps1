param(
  [string]$OutFile = "work/audio/part1_voiceover_timed.wav",
  [string]$FfmpegPath = "ffmpeg"
)

$ErrorActionPreference = "Stop"

$clips = @(
  @{ File = "work/audio/part1_scene1_voiceover_openai_shimmer.wav"; Duration = 6.0 },
  @{ File = "work/audio/part1_scene2_voiceover_openai_shimmer.wav"; Duration = 15.0 },
  @{ File = "work/audio/part1_scene3_voiceover_openai_shimmer.wav"; Duration = 9.0 },
  @{ File = "work/audio/part1_scene4_voiceover_openai_shimmer.wav"; Duration = 25.0 },
  @{ File = "work/audio/part1_scene5_voiceover_openai_shimmer.wav"; Duration = 15.0 }
)

function Resolve-FfmpegPath {
  param([string]$Candidate)

  if (Test-Path -LiteralPath $Candidate) {
    return (Resolve-Path -LiteralPath $Candidate).Path
  }

  $command = Get-Command $Candidate -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  throw "Missing FFmpeg executable. Install FFmpeg and add it to PATH, or pass -FfmpegPath with the full ffmpeg.exe path."
}

function Get-WavDurationSeconds {
  param([string]$Path)

  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path))
  if ($bytes.Length -lt 44) {
    throw "WAV file is too small: $Path"
  }

  $byteRate = [BitConverter]::ToUInt32($bytes, 28)
  $dataSize = [BitConverter]::ToUInt32($bytes, 40)
  if ($byteRate -eq 0 -or $dataSize -eq 0) {
    throw "Could not read WAV duration: $Path"
  }

  return [double]$dataSize / [double]$byteRate
}

$ResolvedFfmpegPath = Resolve-FfmpegPath -Candidate $FfmpegPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null

$argsList = @("-y")
$filters = @()
$labels = @()

for ($i = 0; $i -lt $clips.Count; $i += 1) {
  $clip = $clips[$i]
  if (-not (Test-Path -LiteralPath $clip.File)) {
    throw "Missing voiceover clip: $($clip.File)"
  }

  $argsList += @("-i", $clip.File)
  $sourceDuration = Get-WavDurationSeconds -Path $clip.File
  $targetDuration = [double]$clip.Duration
  $chain = "[$i`:a]"

  if ($sourceDuration -gt ($targetDuration * 1.01)) {
    $factor = [Math]::Round($sourceDuration / $targetDuration, 3).ToString([Globalization.CultureInfo]::InvariantCulture)
    $chain += "atempo=$factor,"
    Write-Output "$($clip.File) ${sourceDuration}s -> ${targetDuration}s atempo=$factor"
  } else {
    Write-Output "$($clip.File) ${sourceDuration}s -> ${targetDuration}s padded"
  }

  $target = $targetDuration.ToString([Globalization.CultureInfo]::InvariantCulture)
  $chain += "atrim=0:$target,asetpts=PTS-STARTPTS,apad,atrim=0:$target[a$i]"
  $filters += $chain
  $labels += "[a$i]"
}

$filter = ($filters -join ";") + ";" + ($labels -join "") + "concat=n=$($clips.Count):v=0:a=1[a]"
$argsList += @("-filter_complex", $filter, "-map", "[a]", "-ar", "48000", "-ac", "2", $OutFile)

& $ResolvedFfmpegPath @argsList
