# Quality Loop

Inspect the generated video, not only the queue status.

## Frame Comparison

Always compare the original video and the generated video at the same timestamps:

```bash
node scripts/compare_videos.mjs \
  --original <source-video> \
  --result <generated-video> \
  --out-dir <run-dir>/comparison \
  --comfy-root <comfy-root>
```

The comparison output contains:

- `contact_sheet.png`: original on the left, generated result on the right
- `side_by_side.mp4`: full side-by-side playback
- `pairs/`: one original/result pair per sampled timestamp
- `comparison.json`: duration, resolution, FPS, sample interval, SSIM, and PSNR

SSIM and PSNR are structural metrics after resolution normalization. A low value is expected when the identity is intentionally replaced. Use them to check motion, camera framing, composition, background, and silhouette retention, not identity similarity.

## Checks

1. Identity similarity: face, hair, glasses, body proportions, and skin tone.
2. Temporal stability: no face flicker, identity swap, or drift during motion.
3. Motion retention: action order, timing, body pose, and camera movement.
4. Scene retention: background layout, lighting direction, and camera framing.
5. Anatomy: hands, limbs, body joins, and contact with objects.
6. Clothing: color, material, silhouette, and accessories.
7. Output completeness: duration, frame continuity, audio, and file integrity.
8. Segment seams: check the frames immediately before and after every segment boundary.

Use the comparison contact sheet first, then inspect `side_by_side.mp4` around any suspicious sample. If the identity changes at a seam, inspect the corresponding `pairs/` frame to separate a generation error from a stitch error.

## One-Variable Iteration

| Failure | Change first |
|---|---|
| Identity is weak | Replace or add clearer reference images |
| Identity swaps between people | Make `<Picture 1>` and `<Picture 2>` roles explicit in `<Subject 1>` |
| Face flickers or drifts | Shorten the clip or simplify the action |
| Motion is weak | Shorten `<Video 1>` to one continuous action and strengthen the Video 1 instruction |
| Scene changes | Reduce unrelated prompt details and describe the preserved scene |
| Clothing drifts | Add explicit clothing-lock text inside `<Subject 1>` |
| Anatomy breaks | Avoid extreme occlusion or fast limb crossing |
| Generation is unstable | Keep the same seed and change only the prompt or reference media |
| Seam mismatch | Re-run the adjacent segment and check the overlap before stitching |

Default budget: one main run plus at most two targeted reruns. More runs require user approval.
## Jianying Professional Handoff

Only start Jianying after the frame comparison passes. Prepare the import package first:

```bash
node scripts/prepare_jianying_handoff.mjs --manifest <run-manifest.json> --out-dir <run-dir>/jianying_handoff --comfy-root <comfy-root>
```

Use Jianying for final packaging, transitions, titles, and export. Do not replace exact ffmpeg concatenation with GUI editing when frame timing must remain unchanged. After exporting from Jianying, run `compare_videos.mjs` again against the original source and the final export.