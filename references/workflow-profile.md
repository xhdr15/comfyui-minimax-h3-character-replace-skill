# H3 VRAM-Optimized Profile

Source workflow: `MINIMAX-H3 显存终极优化工作流(1).json`

The API template was exported from the running local ComfyUI frontend on 2026-10-05. The original frontend workflow is not modified.

## Bindings

| Skill input | Node | Input | Purpose |
|---|---:|---|---|
| `character_image_1` | 97 | `image` | First identity reference |
| `character_image_2` | 101 | `image` | Second identity reference |
| `source_video` | 135 | `video` | Motion and scene reference |
| `duration_seconds` | 84 | `value` | Input to node 92 frame-length expression |
| `source_frames` | 135 | `frame_load_cap` | Frames loaded from source video |
| `source_start_frame` | 135 | `skip_first_frames` | Zero-based offset for segmented runs |
| `prompt` | 346 | `value` | MiniMax H3 replacement prompt |
| `aspect_ratio` | 105 | `aspect_ratio` | ResolutionSelector ratio |
| `megapixels` | 105 | `megapixels` | ResolutionSelector target size |
| `seed` | 243 | `noise_seed` | RandomNoise seed |
| `output_prefix` | 299 | `filename_prefix` | Final output filename prefix |

`source_frames` is computed as:

```text
frames = max(5, round(duration_seconds * 24))
length = frames + ((5 - (frames % 17)) % 17)
```

This matches the graph's node 92 expression. The model's valid clip lengths are `5 + 17n` frames at 24 FPS.

## Long Video Segmentation

For a 362-frame source, use five 90-frame segments with 22-frame overlaps:

| Segment | start frame | frame count |
|---|---:|---:|
| 1 | 0 | 90 |
| 2 | 68 | 90 |
| 3 | 136 | 90 |
| 4 | 204 | 90 |
| 5 | 272 | 90 |

After generation, trim the first 22 frames from segments 2–5 and concatenate:

```text
90 + 68 * 4 = 362 frames
```

Always compare the original and result around each seam using `scripts/compare_videos.mjs`.

## Locked Nodes

Do not patch nodes outside the binding table. In particular, keep these graph decisions locked:

- model and text encoder loaders: nodes 4, 8
- video and audio VAE loaders: nodes 5, 6
- H3 reference-to-video conditioning: node 108
- Turbo LoRA and strength: node 186
- sampler, scheduler, noise, guider, and sigma refiner: nodes 243, 246, 248, 249, 295, 390, 391
- low-VRAM attention and feed-forward chunking: nodes 412, 413
- reserved VRAM policy: node 409
- preview and latent upscaler: nodes 372, 400, 415

## Updating the Template

When the workflow graph changes:

1. Open the updated workflow in the local ComfyUI frontend.
2. Export it with `Workflow Operations -> 导出 (API)`.
3. Replace `assets/workflows/h3-vram-optimized.api.json`.
4. Re-check the node IDs in the binding table.
5. Re-check dynamic combo values, especially `MinimaxH3LatentUpscaler3D.device`, which must be `cuda`, `rocm`, or `cpu`.
6. Run the runner with `--plan` before any execution.