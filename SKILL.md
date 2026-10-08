---
name: comfyui-character-replace
description: 使用本地 ComfyUI 中已成熟的 MiniMax H3 显存优化工作流执行人物替换。适用于用户提供角色参考图、源视频和替换要求，希望先 dry-run、再提交本地 /prompt、最后保存成片与 manifest 的请求。不用于云端 H3 API 节点、训练 LoRA，或从头重建模型工作流。
metadata:
  short-description: 本地 ComfyUI H3 人物替换
---

# ComfyUI Character Replace

Use the user's existing `MINIMAX-H3 显存终极优化工作流(1)` as the authoritative local generation graph. Do not rebuild or optimize the graph unless the user explicitly asks.

## Baseline

- Profile: `assets/profiles/h3-vram-optimized.json`
- API workflow: `assets/workflows/h3-vram-optimized.api.json`
- Runner: `scripts/run_h3_workflow.mjs`
- Video comparison: `scripts/compare_videos.mjs`
- Optional Jianying handoff: `scripts/prepare_jianying_handoff.mjs`

The profile exposes only these inputs:

- `character_image_1` -> node `97`
- `character_image_2` -> node `101`
- `source_video` -> node `135`
- `duration_seconds` -> node `84`
- derived `source_frames` -> node `135.frame_load_cap`
- `source_start_frame` -> node `135.skip_first_frames`
- `prompt` -> node `346`
- `aspect_ratio` and `megapixels` -> node `105`
- `seed` -> node `243`
- `output_prefix` -> node `299`

All model loaders, LoRA, low-VRAM attention, Sigma refiner, sampler, VAE, upscaler, and node graph links stay locked.

## Required Inputs

Ask for or locate:

1. Character reference images.
2. One source video containing the motion and scene to preserve.
3. A replacement prompt in the official MiniMax H3 full-reference format.

For a single-character replacement, provide one full-body reference and optionally one face/head crop, and explain that both pictures define the same `<Subject 1>`.

## Prompt Rules

- Write the prompt in English.
- Use exact tags: `<Picture 1>`, `<Picture 2>`, `<Video 1>`, `<Audio 1>`.
- Use the official six-section structure: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`.
- Assign every reference a role. For replacement: `<Subject 1>` defines identity and clothing; `<Video 1>` defines motion, camera, timing, composition, and background.
- Prefer positive descriptions. H3 has no effective negative-prompt branch.

See `references/prompt-recipes.md` for the full template.

## Workflow

1. Run the runner in plan mode first.

```bash
node scripts/run_h3_workflow.mjs --plan --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path>
```

2. Inspect the generated `plan.json` and `workflow.api.json` in the run directory. Confirm the profile, staged inputs, duration, frame length, seed, and output prefix.

3. Execute only after the user authorizes the local run.

```bash
node scripts/run_h3_workflow.mjs --execute --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path>
```

4. Read `manifest.json`, then inspect the generated video and report the actual output paths.

5. Always run frame comparison after generation.

```bash
node scripts/compare_videos.mjs --original <source-video> --result <generated-video> --out-dir <run-dir>/comparison --comfy-root <comfy-root>
```

Inspect `contact_sheet.png` and `side_by_side.mp4`. The contact sheet places the original frame on the left and the generated frame on the right at the same timestamps.

6. Only when the user explicitly requests Jianying Professional after comparison passes, prepare the import package.

```bash
node scripts/prepare_jianying_handoff.mjs --manifest <run-manifest.json> --out-dir <run-dir>/jianying_handoff --comfy-root <comfy-root>
```

Then follow `references/jianying-workflow.md`. Use Jianying for packaging, transitions, titles, and export. Keep ffmpeg concatenation as the exact frame-timing reference.

## Long Video

For videos longer than one H3 clip, split on valid H3 lengths (`5 + 17n` frames). A 362-frame, 15-second source can use five 90-frame segments with 22-frame overlaps:

- starts: `0, 68, 136, 204, 272`
- each segment: 90 frames
- trim the first 22 frames from segments 2–5 before concatenation
- final coverage: `90 + 68 * 4 = 362` frames

Check the comparison sheet around every segment seam, not only at the start and end.

## Hard Rules

- Keep the original workflow JSON untouched. The runner writes a patched copy per run.
- Do not patch a node input that is not listed in the profile.
- Do not change sampling steps, LoRA strength, attention settings, Sigma refiner values, VAE choices, or upscale behavior.
- Keep execution local to `127.0.0.1`.
- If the API workflow is re-exported or the graph is edited, update the profile node bindings before running.
- Do not run another full generation after a failure without a specific reason and a one-variable change.
- In Jianying, always create a new draft. Never modify existing user drafts or `draft_content.json` directly.

## QC

After generation, inspect the actual output using `references/quality-loop.md`. Report:

- identity similarity
- temporal face stability
- motion and camera retention
- anatomy and hand artifacts
- clothing consistency
- output completeness
- segment seam continuity
- original/result frame comparison

Do not claim success from a successful queue submission alone. Inspect the output video and the comparison sheet.

## References

- Build prompts with `references/prompt-recipes.md`.
- Check node bindings and locked nodes in `references/workflow-profile.md`.
- Use `references/quality-loop.md` for post-generation review and one-variable retries.
- Use `references/jianying-workflow.md` for optional Jianying Professional handoff and export.