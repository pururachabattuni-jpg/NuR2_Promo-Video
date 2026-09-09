# NuR2 Video Static Scene Assets

This manifest lists the static image assets used by the current NuR2 video render scripts:

- `scripts\render_nur2_part1_preview.js`
- `scripts\render_nur2_part2_preview.js`
- `scripts\render_nur2_until_cup.js` for the earlier longer draft

Historical render metadata files may still contain older filenames from earlier drafts. Going forward, use this manifest and the active render scripts as the source of truth.

| Render key | Scene | File | Purpose |
| --- | --- | --- | --- |
| `bg1` | Scene 1, The Nutrient Paradox | `assets\overlays\scene_01_nutrient_paradox_corn_wheat_field.png` | Vibrant corn/wheat field background. |
| `tractor` | New Part 1 Scene 2, Fertilizing Crops | `assets\generated\scene_02_fertilizing_crops_tractor_sprayer_vivid.png` | Vivid tractor sprayer background for the new Part 1 preview. |
| `crop_irrigation` | New Part 1 Scene 3, Crop Irrigation | `assets\generated\crop_irrigation.jpg` | Irrigation pivot background for the new Part 1 preview. |
| `bg2` | Scene 2, Follow One Raindrop | `assets\overlays\scene_02_corn_raindrop_nutrients.png` | Close crop/raindrop background with visible nutrients. |
| `stream` | Scenes 2, 8, and 9 | `assets\generated\scene_02_field_to_stream_runoff.png` | Field-to-stream runoff image reused for transitions, filtration, and NuR2 identity scene. |
| `algae` | Scene 3, Downstream Cascade | `assets\generated\scene_03_downstream_algae_cascade.png` | Stream/algae cascade background. |
| `Alge_stream` | New Part 2 Scene 6, The Downstream Cascade | `assets\generated\Alge_stream.png` | Algae-filled stream background for the new Part 2 preview. |
| `alge_with_boat` | New Part 2 Scene 7, Algal Bloom | `assets\generated\alge_with_boat.jpg` | Aerial algal bloom with boat background for the new Part 2 preview. |
| `dead` | Scene 3, Dead Zone transition | `assets\original_frames\scene_03_dead_zone_original_frame.png` | Original dead-zone background frame. |
| `punjab` | Scene 4, It Goes Deeper | `assets\generated\scene_04_punjab_rice_field.png` | Punjab rice field background. |
| `valley` | Scene 5, Central Valley | `assets\generated\scene_05_central_valley_aerial.png` | Central Valley aerial background. |
| `cup` | Scene 6, Dark Contamination | `assets\original_frames\scene_06_dark_contamination_cup_original_frame.png` | Original dark contamination/cup frame. |
| `ogallala` | New Part 2 Scene 10, The Ogallala Aquifer | `assets\generated\ogallala.png` | Ogallala/High Plains aquifer map for the new Part 2 preview. |
| `Vulnerable_acquifer` | New Part 2 Scene 11, Vulnerable Aquifers | `assets\generated\Vulnerable_acquifer.jpg` | U.S. vulnerable aquifers map for the new Part 2 preview. |
| `half` | Scene 7, We Built Half the System | `assets\original_frames\scene_07_half_system_original_frame.png` | Original half-system background frame. |
| `logo` | Scene 9 source/reference | `assets\generated\scene_09_nur2_logo_source_full_scene.png` | NuR2 logo source image; the current scene uses a drawn logo mark, but this stays available as source material. |
| `finalBadge` | Scene 10, Final end card | `assets\generated\scene_10_final_end_card_nur2_logo_badge.png` | Cropped NuR2 logo badge shown below `nur2.org`. |
| `future` | Scene 10, Final end card | `assets\original_frames\scene_10_final_aerial_future_end_card.png` | Aerial landscape background behind `nur2.org`. |

Related source/reference files that are not currently wired into the render script:

| File | Comment | Note |
| --- | --- | --- |
| `assets\generated\scene_09_nur2_logo_source_full_scene.webp` | unused | WebP version of the NuR2 logo source image. |
| `assets\original_frames\bg8_capture_recover_return.png` | unused | Reference/original frame from an earlier capture-recover-return scene. |
| `assets\original_frames\bg9_nur2_logo_original.png` | unused | Reference/original frame from an earlier NuR2 logo scene. |
