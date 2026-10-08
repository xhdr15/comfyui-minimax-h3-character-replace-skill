# ComfyUI MiniMax H3 Character Replace Skill

Experimental Codex skill for local ComfyUI character replacement with MiniMax H3, long-video segmentation, frame comparison, and optional Jianying Professional export.

## Status

This is a preview skill tied to a specific local workflow profile. It is not a standalone ComfyUI model package and it does not download models.

## Features

- Run a local ComfyUI MiniMax H3 reference-to-video workflow through the local API.
- Bind reference images, source video, prompt, duration, frames, aspect ratio, megapixels, seed, and output prefix.
- Keep model, LoRA, attention, sigma, VAE, sampler, and upscaler nodes locked.
- Generate an ordered plan before execution.
- Split long videos on valid H3 frame lengths (`5 + 17n`).
- Compare original and generated videos with a contact sheet, side-by-side video, SSIM, and PSNR.
- Prepare an ordered Jianying Professional handoff package.
- Optionally drive Jianying Professional through Computer Use and re-compare the final export.

## Requirements

- Windows for the optional Jianying stage.
- Node.js 18 or later.
- A running local ComfyUI instance at `http://127.0.0.1:8188` by default.
- `ffmpeg` in PATH or available as `ffmpeg.exe` under the ComfyUI root.
- The same custom node classes and model files expected by `assets/workflows/h3-vram-optimized.api.json`.
- Optional: Jianying Professional.

See `references/dependencies.md`.

## Install

Copy this repository into the Codex skills directory:

```text
<CODEX_HOME>/skills/comfyui-character-replace
```

On Windows the default location is usually:

```text
C:\Users\<user>\.codex\skills\comfyui-character-replace
```

## Quick Start

Plan first:

```bash
node scripts/run_h3_workflow.mjs --plan --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path>
```

Execute only after reviewing the plan:

```bash
node scripts/run_h3_workflow.mjs --execute --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path>
```

Compare original and result:

```bash
node scripts/compare_videos.mjs --original <source-video> --result <generated-video> --out-dir <run-dir>/comparison --comfy-root <comfy-root>
```

Prepare optional Jianying handoff:

```bash
node scripts/prepare_jianying_handoff.mjs --manifest <run-manifest.json> --out-dir <run-dir>/jianying_handoff --comfy-root <comfy-root>
```

## Workflow Profile

The runner is controlled by:

- `assets/profiles/h3-vram-optimized.json`
- `assets/workflows/h3-vram-optimized.api.json`

If the source workflow graph changes, re-export the API workflow and update the profile node IDs and input names.

## Known Limitations

- The bundled workflow is specific to one local H3 graph and node set.
- Model filenames and custom-node versions are not bundled.
- Jianying integration is Windows-only and version-sensitive.
- Jianying default export may be 30 FPS; set 24 FPS manually when exact timing is required.
- The skill is local-first. No telemetry, analytics, or background update checks are included.

## License

No license has been granted yet. Add one before public distribution if you want others to reuse the code.