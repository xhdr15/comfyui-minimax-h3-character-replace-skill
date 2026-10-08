# Dependencies and Compatibility

## Runtime

- Node.js 18+
- Python is not required by the skill scripts.
- `ffmpeg`
- Running local ComfyUI instance
- Optional: Jianying Professional on Windows

## Workflow Asset

The bundled profile expects the custom node classes present in `assets/workflows/h3-vram-optimized.api.json`. If a class is missing, use ComfyUI Manager to install the corresponding node pack, then re-export the API workflow and update the profile.

Expected class types include:

```text
BasicGuider
BasicScheduler
CLIPLoader
ComfyMathExpression
H3SigmaRefiner
KSamplerSelect
LayerUtility: ImageScaleByAspectRatio V2
LoadImage
LoraLoaderModelOnly
LTXVConcatAVLatent
LTXVSeparateAVLatent
MiniMaxChunkFeedForward
MinimaxH3LatentUpscaler3D
MiniMaxH3MemoryEfficientSageAttentionPatch
MiniMaxH3ReferenceToVideo
MiniMaxH3SigmaShift
MiniMaxLowVRAMAttention
ModelPreviewOverrideKJ
PreviewImage
PrimitiveFloat
PrimitiveStringMultiline
RandomNoise
ReservedVRAMSetter
ResolutionSelector
SamplerCustomAdvanced
SplitSigmas
UNETLoader
VAEDecode
VAEDecodeAudio
VAELoader
VHS_LoadVideo
VHS_VideoCombine
```

## Model Filenames in the Bundled Profile

```text
qwen3vl_32b_minimax_h3_int8_convrot.safetensors
minimax_h3_video_vae_fp16.safetensors
minimax_h3_audio_vae_fp32.safetensors
minimax_h3_ref2va_pruned_int8_convrot.safetensors
minimax_h3_fl2v_turbo_4step_v1.2_768p_comfyui_bf16.safetensors
minimax_h3_latent_upscaler_3d_fp16.safetensors
taeh3.safetensors
```

These names can differ by installation. Do not assume the profile is portable without checking the loaders.

## Prompt Compatibility

Use MiniMax H3 full-reference tags:

```text
<Picture 1>
<Picture 2>
<Video 1>
<Audio 1>
```

Use the six-section structure documented in `references/prompt-recipes.md`.