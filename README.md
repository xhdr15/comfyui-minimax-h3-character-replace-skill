# ComfyUI MiniMax H3 人物替换 Skill

这是一个实验性的 Codex Skill，用于在本地 ComfyUI 中执行 MiniMax H3 人物替换，并支持长视频分段、原视频与结果视频帧对比，以及可选的剪映专业版导出流程。

## 当前状态

这是一个预览版 Skill，绑定特定的本地工作流模板。它不是独立的 ComfyUI 模型包，也不会自动下载模型。

## 主要功能

- 通过本地 ComfyUI 接口执行 MiniMax H3 参考转视频工作流。
- 绑定角色参考图、源视频、提示词、时长、帧数、分辨率比例、像素量、随机种子和输出前缀。
- 锁定模型、LoRA、低显存注意力、Sigma 精修、VAE、采样器和放大节点。
- 正式执行前先生成计划文件，便于检查。
- 按 H3 合法帧数规则进行长视频分段。
- 生成原视频与结果视频的抽帧对照图、并排对比视频、结构相似度和峰值信噪比。
- 生成按顺序排列的剪映专业版导入包。
- 可选通过 Computer Use 操作剪映专业版导出，并再次做帧对比。

## 环境要求

- 剪映相关流程需要 Windows。
- Node.js 18 或更高版本。
- 本地 ComfyUI 服务，默认地址为 `http://127.0.0.1:8188`。
- `ffmpeg` 已加入系统路径，或位于 ComfyUI 根目录下。
- 需要与 `assets/workflows/h3-vram-optimized.api.json` 匹配的自定义节点类和模型文件。
- 可选：剪映专业版。

具体依赖见 `references/dependencies.md`。

## 安装

把本仓库复制到 Codex Skills 目录：

```text
<CODEX_HOME>/skills/comfyui-character-replace
```

在 Windows 上，默认位置通常是：

```text
C:\Users\<用户名>\.codex\skills\comfyui-character-replace
```

## 快速开始

先执行计划模式：

```bash
node scripts/run_h3_workflow.mjs --plan --character-image-1 <角色图1> --character-image-2 <角色图2> --source-video <源视频> --prompt-file <提示词文件>
```

确认计划无误后，再执行生成：

```bash
node scripts/run_h3_workflow.mjs --execute --character-image-1 <角色图1> --character-image-2 <角色图2> --source-video <源视频> --prompt-file <提示词文件>
```

对比原视频与结果视频：

```bash
node scripts/compare_videos.mjs --original <源视频> --result <结果视频> --out-dir <运行目录>/comparison --comfy-root <ComfyUI根目录>
```

生成可选的剪映导入包：

```bash
node scripts/prepare_jianying_handoff.mjs --manifest <运行清单> --out-dir <运行目录>/jianying_handoff --comfy-root <ComfyUI根目录>
```

## 工作流配置

运行器由以下文件控制：

- `assets/profiles/h3-vram-optimized.json`
- `assets/workflows/h3-vram-optimized.api.json`

如果源工作流发生变化，需要重新导出接口格式工作流，并更新配置中的节点编号和输入名称。

## 已知限制

- 内置工作流绑定特定的本地 H3 图结构和节点集合。
- 仓库不包含模型文件和自定义节点版本。
- 剪映流程只支持 Windows，并且受剪映版本变化影响。
- 剪映默认可能导出为 30 帧每秒；需要严格保持原始帧率时，应手动设置导出帧率。
- 本 Skill 以本地运行为主，不包含遥测、统计上报、分析或后台更新检查。

## 许可证

当前尚未授予许可证。如果要公开分发并允许他人复用代码，请先补充许可证。