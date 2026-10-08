#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);

function usage() {
  return [
    'Usage:',
    '  node scripts/prepare_jianying_handoff.mjs --manifest <manifest.json> [options]',
    '',
    'Options:',
    '  --out-dir <path>       Handoff directory. Defaults next to the manifest.',
    '  --ffmpeg <path>        ffmpeg executable.',
    '  --comfy-root <path>    ComfyUI root used to find ffmpeg.exe or ffmpeg.',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined) throw new Error(`Missing value for --${key}`);
      opts[key.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = value;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return opts;
}

function timestamp() {
  const d = new Date();
  const p = (n, width = 2) => String(n).padStart(width, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function runProcess(command, args, { allowNonZero = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && !allowNonZero) {
        reject(new Error(`${command} exited with ${code}\n${stderr.slice(-4000)}`));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function readJson(filePath) {
  return JSON.parse((await readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

async function detectFfmpeg(opts) {
  if (opts.ffmpeg) return opts.ffmpeg;
  if (process.env.FFMPEG) return process.env.FFMPEG;

  const roots = [];
  if (opts.comfyRoot) roots.push(opts.comfyRoot);
  if (process.env.COMFYUI_ROOT) roots.push(process.env.COMFYUI_ROOT);

  if (roots.length === 0) {
    try {
      const response = await fetch('http://127.0.0.1:8188/system_stats');
      const stats = await response.json();
      const argv = stats.system?.argv || stats.argv || [];
      const mainArg = argv.find((arg) => typeof arg === 'string' && /main\.py$/i.test(arg));
      if (mainArg) roots.push(path.dirname(mainArg));
    } catch {
      // Fall through to PATH lookup.
    }
  }

  for (const root of roots) {
    for (const name of ['ffmpeg.exe', 'ffmpeg']) {
      const candidate = path.join(root, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!opts.manifest) throw new Error('--manifest is required');
  const manifestPath = path.resolve(opts.manifest);
  const manifest = await readJson(manifestPath);
  const segments = Array.isArray(manifest.segments) ? manifest.segments : [];
  if (segments.length === 0) throw new Error('Manifest must contain a non-empty segments array');

  const ffmpeg = await detectFfmpeg(opts);
  const segmentFrames = Number(manifest.segment_frames || 90);
  const overlapFrames = Number(manifest.overlap_frames || 22);
  const fps = Number(manifest.fps || 24);
  const outDir = path.resolve(opts.outDir || path.join(path.dirname(manifestPath), `jianying_handoff_${timestamp()}`));
  const clipsDir = path.join(outDir, 'clips');
  await mkdir(clipsDir, { recursive: true });

  const trimSeconds = overlapFrames / fps;
  const clips = [];

  for (let i = 0; i < segments.length; i += 1) {
    const source = path.resolve(segments[i]);
    if (!(await stat(source)).isFile()) throw new Error(`Missing segment: ${source}`);
    const clipName = `${String(i + 1).padStart(2, '0')}_segment.mp4`;
    const clipPath = path.join(clipsDir, clipName);

    if (i === 0) {
      await copyFile(source, clipPath);
    } else {
      await runProcess(ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-i', source,
        '-vf', `trim=start_frame=${overlapFrames},setpts=PTS-STARTPTS`,
        '-af', `atrim=start=${trimSeconds},asetpts=PTS-STARTPTS`,
        '-r', String(fps),
        '-c:v', 'libx264',
        '-crf', '19',
        '-preset', 'medium',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        clipPath,
      ]);
    }

    clips.push({
      order: i + 1,
      source,
      handoff_clip: clipPath,
      trim_first_frames: i === 0 ? 0 : overlapFrames,
      resulting_frames: i === 0 ? segmentFrames : segmentFrames - overlapFrames,
    });
  }

  const totalFrames = clips.reduce((sum, clip) => sum + clip.resulting_frames, 0);
  const editPlan = {
    title: 'ComfyUI character replacement - Jianying handoff',
    fps,
    segment_frames: segmentFrames,
    overlap_frames: overlapFrames,
    total_frames: totalFrames,
    clips,
  };
  await writeFile(path.join(outDir, 'edit_plan.json'), JSON.stringify(editPlan, null, 2), 'utf8');

  const concat = clips.map((clip) => `file '${clip.handoff_clip.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
  await writeFile(path.join(outDir, 'ffmpeg_concat.txt'), concat, 'utf8');

  const guide = [
    '# 剪映专业版交接说明',
    '',
    '1. 打开剪映专业版，新建草稿，画布设置为 9:16。',
    '2. 导入 `clips/` 目录中的文件，按文件名数字顺序排列。',
    '3. 将 clips 按 01 → 02 → 03 → 04 → 05 的顺序拖入主时间线。',
    '4. 片段之间不要留空隙；如果使用了 22 帧重叠裁剪，交接包中的每个片段已经去掉了重叠部分。',
    '5. 如需转场，在片段连接处加很短的转场；默认建议不加，保持原始动作连续性。',
    '6. 导出为 9:16、24 FPS、H.264 MP4。',
    '7. 导出后重新运行 `compare_videos.mjs`，对原视频和剪映导出成片做最后一次帧对比。',
    '',
    `总帧数：${totalFrames}`,
    `目标 FPS：${fps}`,
    '',
  ].join('\n');
  await writeFile(path.join(outDir, 'jianying_guide.md'), guide, 'utf8');

  process.stdout.write(`${JSON.stringify({
    out_dir: outDir,
    clips_dir: clipsDir,
    edit_plan: path.join(outDir, 'edit_plan.json'),
    guide: path.join(outDir, 'jianying_guide.md'),
    ffmpeg_concat: path.join(outDir, 'ffmpeg_concat.txt'),
    total_frames: totalFrames,
    clips: clips.map((clip) => clip.handoff_clip),
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});