# Jianying Professional Handoff

This optional stage is Windows-only. Use it only after frame comparison passes and the user explicitly requests Jianying Professional editing or export.

## Principle

Keep exact frame assembly in ffmpeg. Jianying is for final packaging, transitions, titles, audio polish, and export. Do not replace deterministic ffmpeg concatenation with GUI editing when exact frame timing matters.

Do not write or patch `draft_content.json` directly. The Jianying draft format is undocumented, version-specific, and may contain encrypted state. Create a new draft through the Jianying UI instead.

## Configuration

Set the executable and export directories for the current machine:

```text
<JIANYING_EXE>
<JIANYING_DRAFT_DIR>
<EXPORT_DIR>
```

Never modify existing user drafts. Create a new draft for each handoff.

## Prepare the Handoff Package

Run after segment comparison passes:

```bash
node scripts/prepare_jianying_handoff.mjs \
  --manifest <run-manifest.json> \
  --out-dir <run-dir>/jianying_handoff \
  --comfy-root <comfy-root>
```

The package contains:

- `clips/01_segment.mp4` ... `NN_segment.mp4`: already trimmed clips in timeline order
- `edit_plan.json`: order, trim frames, resulting frame count, FPS
- `jianying_guide.md`: import and export instructions
- `ffmpeg_concat.txt`: deterministic fallback concatenation list

## Computer Use Steps

1. Ask for confirmation before opening Jianying if the user has unsaved work.
2. Launch `<JIANYING_EXE>` through Computer Use.
3. Create a new draft named `comfyui_character_replace_<timestamp>`.
4. Set the canvas to 9:16 and 24 FPS when the source uses 24 FPS.
5. Import every file in `clips/` and keep numeric filename order.
6. Put clips on the timeline in order. Do not leave gaps.
7. Add transitions only when the user asks. Use very short transitions at seams; the default is no transition.
8. Export H.264 MP4. Check the frame rate and enable audio export when the source contains audio.
9. Save a new draft and report its name.
10. Run `compare_videos.mjs` again against the original source and the Jianying export.

## UI Notes

- Use `Ctrl+E` to open the export dialog.
- Do not click the top-right share control; Share and Export can be adjacent.
- If a share dialog opens, cancel it. Do not publish or generate a share link unless the user explicitly requests it.
- Multi-item timeline drag can be unreliable in some Jianying versions. A stable fallback is to concatenate frame-accurate segments with ffmpeg, import the single completed MP4, create a new timeline, and export from Jianying.

## Failure Handling

- If Computer Use is unavailable, stop at the handoff package and tell the user to import `clips/` manually.
- If Jianying changes its UI, use the accessibility tree or a fresh screenshot instead of fixed coordinates.
- If the exported video has a duration or frame-count mismatch, compare it with the ffmpeg concatenated reference before claiming success.