# NuR2 Video Creation Handoff

This document is the Git handoff for the NuR2 nutrient-loss video work. It lists the assets, scripts, tools, setup steps, render commands, and known cleanup notes needed for another person to continue the project.

## Current State

The project is being rebuilt in steps.

| Part | Global video span | Scenes | Current preview output |
| --- | --- | --- | --- |
| Part 1 | `00:00-01:10` | Scenes 1-5 | `renders/drafts/nur2_part1_preview_v3_fixed30.mp4` |
| Part 2 | `01:10-02:12` | Scenes 6-11 | `renders/drafts/nur2_part2_preview_v3_fixed30.mp4` |

The MP4 files above are preview exports. They can be regenerated from the tracked scripts and assets after voiceover audio is rebuilt.

## What To Commit

Commit these source items:

- `README.md`
- `.gitignore`
- `.env.example`
- `docs/`
- `assets/`
- `scripts/`
- `narration/`

Do not commit:

- `.env.local` or any file containing a real API key
- `work/` because it contains generated audio, browser profiles, cache files, and scratch files
- `renders/drafts/` outputs unless someone intentionally wants a preview artifact in the repo
- temporary QA frame extracts unless someone intentionally wants them as review artifacts

The `.gitignore` is configured so `.env.local`, `work/`, and draft renders stay out of normal Git adds. Use Git LFS for large MP4/WebM/source-video files if the team wants to version them.

## Tools Used

Install these before rebuilding.

| Tool | Used for | Version used here | Notes |
| --- | --- | --- | --- |
| Windows PowerShell | Running voiceover and FFmpeg helper scripts | Windows PowerShell 5.x | PowerShell Core should also work for these scripts. |
| Node.js | Running the browser-canvas render scripts | `v24.14.1` | Scripts use built-in Node modules only; no npm install is currently required. |
| npm | Available with Node.js | `11.11.0` | Not required by the current scripts, but useful if future dependencies are added. |
| Google Chrome | Headless browser rendering through Canvas and MediaRecorder | Local Chrome install | Default path is `C:\Program Files\Google\Chrome\Application\chrome.exe`; pass `--chrome` if Chrome is elsewhere. |
| FFmpeg | Audio fitting, WebM-to-MP4 conversion, decode checks, QA frame extraction | `9.0.1` full build | Add FFmpeg to `PATH`, or pass `-FfmpegPath` to the audio scripts and use the full `ffmpeg.exe` path in conversion commands. |
| OpenAI API | Synthetic narration generation | `gpt-4o-mini-tts`, voice `shimmer` | Requires `OPENAI_API_KEY` in `.env.local`. The ChatGPT iPhone Juniper voice was requested earlier, but the API render used `shimmer` as the available professional female TTS voice. |
| Codex / Image generation | Creation and iteration of still background assets | N/A | Only needed if replacing or regenerating visual assets; existing generated images are stored under `assets/`. |

## First-Time Setup

1. Install Node.js.
2. Install Google Chrome.
3. Install FFmpeg and confirm `ffmpeg -version` works from PowerShell.
4. Copy `.env.example` to `.env.local`.
5. Put a valid OpenAI API key in `.env.local`:

```powershell
OPENAI_API_KEY=your_key_here
```

Never commit `.env.local`.

## Project Layout

| Path | Purpose |
| --- | --- |
| `assets/source/` | Original supplied video reference. |
| `assets/overlays/` | Key still backgrounds used by the new Part 1 render. |
| `assets/generated/` | Generated or selected still backgrounds used in current and legacy renders. |
| `assets/original_frames/` | Extracted original frames used as source backgrounds. |
| `assets/scene_assets_manifest.md` | Static scene asset inventory and unused-source notes. |
| `narration/` | Tracked voiceover text used by the OpenAI TTS scripts. |
| `scripts/` | Render, voiceover, timing, probing, and extraction scripts. |
| `work/` | Ignored scratch space for generated audio and browser profiles. |
| `renders/drafts/` | Preview video exports and QA frames. |
| `renders/final/` | Intended location for final approved exports. |
| `docs/video_inventory.md` | Background timing inventory from the original source video. |

## Current Scene Plan

### Part 1

| Scene | Time | Render key / asset | Narration file |
| --- | --- | --- | --- |
| 1. The Nutrient Paradox | `00:00-00:06` | `bg1`: `assets/overlays/scene_01_nutrient_paradox_corn_wheat_field.png` | `narration/part1_scene1_narration.txt` |
| 2. Fertilizing Crops | `00:06-00:21` | `tractor`: `assets/generated/scene_02_fertilizing_crops_tractor_sprayer_vivid.png` | `narration/part1_scene2_narration.txt` |
| 3. Crop Irrigation | `00:21-00:30` | `crop_irrigation`: `assets/generated/crop_irrigation.jpg` | `narration/part1_scene3_narration.txt` |
| 4. Follow One Drop | `00:30-00:55` | `bg2`: `assets/overlays/scene_02_corn_raindrop_nutrients.png` | `narration/part1_scene4_narration.txt` |
| 5. Into the Stream | `00:55-01:10` | `stream`: `assets/generated/scene_02_field_to_stream_runoff.png` | `narration/part1_scene5_narration.txt` |

Part 1 render script: `scripts/render_nur2_part1_preview.js`

### Part 2

| Scene | Time | Render key / asset | Narration file |
| --- | --- | --- | --- |
| 6. The Downstream Cascade | `01:10-01:15` | `Alge_stream`: `assets/generated/Alge_stream.png` | `narration/part2_scene6_narration.txt` |
| 7. Algal Bloom | `01:15-01:20` | `alge_with_boat`: `assets/generated/alge_with_boat.jpg` | `narration/part2_scene7_narration.txt` |
| 8. Dead Zones | `01:20-01:32` | `dead`: `assets/original_frames/scene_03_dead_zone_original_frame.png` | `narration/part2_scene8_narration.txt` |
| 9. It Goes Deeper | `01:32-01:55` | `cup`: `assets/original_frames/scene_06_dark_contamination_cup_original_frame.png` | `narration/part2_scene9_narration.txt` |
| 10. The Ogallala Aquifer | `01:55-02:02` | `ogallala`: `assets/generated/ogallala.png` | `narration/part2_scene10_narration.txt` |
| 11. Vulnerable Aquifers | `02:02-02:12` | `Vulnerable_acquifer`: `assets/generated/Vulnerable_acquifer.jpg` | `narration/part2_scene11_narration.txt` |

Part 2 render script: `scripts/render_nur2_part2_preview.js`

## Rebuild Part 1

Generate synthetic voiceover clips:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate_part1_voiceovers.ps1
```

Fit the clips to the scene timing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_part1_timed_audio.ps1
```

If FFmpeg is not on `PATH`, pass the full executable path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_part1_timed_audio.ps1 -FfmpegPath "C:\path\to\ffmpeg.exe"
```

Render the WebM:

```powershell
node .\scripts\render_nur2_part1_preview.js --stem nur2_part1_preview_rebuild
```

Convert to fixed-30-fps MP4:

```powershell
ffmpeg -y -fflags +genpts -i .\renders\drafts\nur2_part1_preview_rebuild.webm -vf fps=30 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 -r 30 -fps_mode cfr -video_track_timescale 30000 -c:a aac -b:a 160k -movflags +faststart .\renders\drafts\nur2_part1_preview_rebuild_fixed30.mp4
```

## Rebuild Part 2

Generate synthetic voiceover clips:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\generate_part2_voiceovers.ps1
```

Fit the clips to the scene timing:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_part2_timed_audio.ps1
```

If FFmpeg is not on `PATH`, pass the full executable path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build_part2_timed_audio.ps1 -FfmpegPath "C:\path\to\ffmpeg.exe"
```

Render the WebM:

```powershell
node .\scripts\render_nur2_part2_preview.js --stem nur2_part2_preview_rebuild
```

Convert to fixed-30-fps MP4:

```powershell
ffmpeg -y -fflags +genpts -i .\renders\drafts\nur2_part2_preview_rebuild.webm -vf fps=30 -c:v libx264 -pix_fmt yuv420p -preset medium -crf 20 -r 30 -fps_mode cfr -video_track_timescale 30000 -c:a aac -b:a 160k -movflags +faststart .\renders\drafts\nur2_part2_preview_rebuild_fixed30.mp4
```

## Verification Commands

Check a render script for syntax:

```powershell
node --check .\scripts\render_nur2_part1_preview.js
node --check .\scripts\render_nur2_part2_preview.js
```

Decode-check an MP4:

```powershell
ffmpeg -v error -i .\renders\drafts\nur2_part2_preview_rebuild_fixed30.mp4 -f null NUL
```

Extract a QA frame:

```powershell
ffmpeg -y -ss 00:00:15 -i .\renders\drafts\nur2_part2_preview_rebuild_fixed30.mp4 -frames:v 1 -update 1 .\renders\drafts\part2_scene8_check.png
```

## Replacing Voiceover With Human Audio

If a human voiceover replaces generated TTS:

1. Put the human audio file under `assets/references/voiceover/` or another tracked location if rights allow.
2. Convert or edit the final audio into WAV files matching the script input names expected by the render scripts:
   - `work/audio/part1_voiceover_timed.wav`
   - `work/audio/part2_voiceover_timed.wav`
3. Re-render the matching part.

The render scripts only need the final timed WAV files. They do not care whether the WAV came from OpenAI TTS, a human recording, or a manual audio editor.

## Known Polish Items

- Scene 10 `ogallala.png` is a bit soft when enlarged. Replace it with a sharper licensed/public-domain map before final export.
- Scene 11 `Vulnerable_acquifer.jpg` works for preview, but the legend and side text are partially cropped. A cleaner map image would look more professional.
- Several visual assets were generated during iteration. Confirm final rights and attribution requirements before publishing externally.
- The Part 2 Scene 10 voiceover is compressed to fit a 7-second scene. If the final video allows more time, it will sound more natural with a longer scene.

## Rights Notes

Treat this repository as an editable production workspace, not a final rights-cleared package.

- User-supplied logo/source files should be cleared by NuR2 or the project owner.
- AI-generated backgrounds under `assets/generated/` should be reviewed against the generation service terms used for the project.
- Frames under `assets/original_frames/` and `assets/source/` come from the supplied source video; confirm that the team has rights to reuse or modify them.
- If any external map or reference image is used in the final video, record its source and license in this file or in a dedicated credits file.
