# MiniMax H3 R2V Prompt Recipes

Official references:

- ComfyUI R2V tags: https://docs.comfy.org/tutorials/video/minimax/minimax-h3-native
- ComfyUI prompt guide: https://docs.comfy.org/tutorials/video/minimax/minimax-h3-prompt-guide
- MiniMax full-reference guide: https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md

## Hard Requirements

- Write the prompt in English.
- Reference connected media with exact tags: `<Picture 1>`, `<Picture 2>`, `<Video 1>`, `<Audio 1>`.
- Assign each reference a job: identity, clothing, motion, camera, scene, or style.
- Do not use negative instructions. H3 uses a single conditioning branch and has no negative-prompt effect.
- For video editing, describe `<Video 1>` as the source video being edited.
- Use `<Subject N>` for visible content reused from a reference. If a picture only defines a character, cite it inside the subject definition instead of creating a standalone picture entry.

## Full-Reference Structure

Use these sections in order:

```text
subject_definitions:
<Subject 1> ...
<Video 1> ...

summary:
[video editing + reference generation] ...

retention_analysis:
<Subject 1> (appears in [Shot 1]-[Shot N]): attribute_transfer - ...
<Video 1> (...): fully_preserved - ...

detailed_description:
[Shot 1] ...
[Shot 2] At 00:05.000, ...
[Shot 3] At 00:10.000, ...

overall_soundscape: ...

non_diegetic_music: ...
```

## Character Replacement Pattern

```text
subject_definitions:
<Subject 1> is the female character whose face, hair, body proportions, and clothing are defined by <Picture 1> and <Picture 2>. She has pink twin tails, pink eyes, cat-ear headphones, a pink glossy bodysuit, a red-and-white jacket, black gloves, and sneakers.
<Video 1> is the source video for the target video edit and provides the original woman's motion, hand position, camera movement, timing, composition, and indoor background.

summary:
[video editing + reference generation] The target video is an edited version of <Video 1>. The original woman holding the baby bottle is replaced by <Subject 1>, while <Video 1>'s motion, camera, timing, composition, and background are preserved.

retention_analysis:
<Subject 1> (appears in [Shot 1]-[Shot 3]): attribute_transfer - <Subject 1>'s identity, hairstyle, clothing, and body proportions replace the original woman's appearance.
<Video 1> (motion, hand action, camera, timing, composition, background): fully_preserved - the edited video follows the original motion and framing.

detailed_description:
[Shot 1] The scene opens in a warm indoor room. <Subject 1> stands in a close-up frame, holding a baby bottle close to the left side of the image. She smiles at the camera and keeps the bottle steady in her hand. The camera remains close to her face and upper body.
[Shot 2] At 00:05.000, <Subject 1> continues holding the bottle and makes a small head movement. Her expression stays calm and natural. The bottle remains in the same hand, and the camera framing and background do not change.
[Shot 3] At 00:10.000, <Subject 1> keeps the same posture and facial expression while the bottle remains in the lower part of the frame. The shot ends with the same composition and lighting as <Video 1>.

overall_soundscape: Quiet indoor room tone with subtle bottle handling sounds.

non_diegetic_music: N/A
```

## Positive Phrasing

Replace negative lines with positive statements:

- Instead of "do not keep black hair", write the target characteristics: "use the pink twin tails and pink eyes from <Subject 1>."
- Instead of "no extra people", write: "the frame contains only <Subject 1>."
- Instead of "no flicker", write: "the identity and clothing remain stable across every frame."