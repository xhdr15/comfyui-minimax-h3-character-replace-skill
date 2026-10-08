#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);

function usage() {
  return [
    'Usage:',
    '  node scripts/compare_videos.mjs --original <video> --result <video> [options]',
    '',
    'Options:',
    '  --out-dir <path>       Output directory. Defaults next to the result video.',
    '  --interval <seconds>   Sampling interval. Default 0.5.',
    '  --frame-width <px>     Width of each side in the contact sheet. Default 160.',
    '  --tile-columns <n>     Pairs per contact-sheet row. Default 4.',
    '  --ffmpeg <path>        ffmpeg executable. Auto-detected from ComfyUI root when possible.',
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

function even(value) {
  return value % 2 === 0 ? value : value - 1;
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

async function runFfmpeg(ffmpeg, args) {
  try {
    return await runProcess(ffmpeg, args);
  } catch (error) {
    throw new Error(`${error.message}\nffmpeg args: ${args.join(' ')}`);
  }
}

async function readJsonUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function detectFfmpeg(opts) {
  if (opts.ffmpeg) return opts.ffmpeg;
  if (process.env.FFMPEG) return process.env.FFMPEG;

  const roots = [];
  if (opts.comfyRoot) roots.push(opts.comfyRoot);
  if (process.env.COMFYUI_ROOT) roots.push(process.env.COMFYUI_ROOT);

  if (roots.length === 0) {
    try {
      const stats = await readJsonUrl('http://127.0.0.1:8188/system_stats');
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

async function probeVideo(ffmpeg, filePath) {
  const { stderr } = await runProcess(ffmpeg, ['-hide_banner', '-i', filePath], { allowNonZero: true });
  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const videoMatch = /Video:.*?(\d{2,5})x(\d{2,5})(?:\s*\[|\s*,).*?([\d.]+)\s*fps/.exec(stderr);
  if (!durationMatch || !videoMatch) {
    throw new Error(`Could not read video metadata from ${filePath}\n${stderr.slice(-2000)}`);
  }
  const hours = Number(durationMatch[1]);
  const minutes = Number(durationMatch[2]);
  const seconds = Number(durationMatch[3]);
  return {
    duration: hours * 3600 + minutes * 60 + seconds,
    width: Number(videoMatch[1]),
    height: Number(videoMatch[2]),
    fps: Number(videoMatch[3]),
  };
}

async function listFrames(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^frame_\d+\.png$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

function scalePadFilter(width, height, fps) {
  return [
    `fps=${fps}`,
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1',
  ].join(',');
}

async function computeMetric(ffmpeg, result, original, filterName, width, height, duration) {
  const filter = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[a]`,
    `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[b]`,
    `[a][b]${filterName}`,
  ].join(';');
  const { stderr } = await runProcess(ffmpeg, [
    '-hide_banner',
    '-i', result,
    '-i', original,
    '-t', String(duration),
    '-filter_complex', filter,
    '-f', 'null',
    '-',
  ], { allowNonZero: true });
  if (filterName.startsWith('ssim')) {
    const match = /All:\s*([0-9.]+)/.exec(stderr);
    return match ? Number(match[1]) : null;
  }
  const match = /average:([0-9.]+)/.exec(stderr);
  return match ? Number(match[1]) : null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!opts.original || !opts.result) throw new Error('Both --original and --result are required');
  const original = path.resolve(opts.original);
  const result = path.resolve(opts.result);
  if (!(await stat(original)).isFile()) throw new Error(`Original is not a file: ${original}`);
  if (!(await stat(result)).isFile()) throw new Error(`Result is not a file: ${result}`);

  const interval = Number(opts.interval ?? 0.5);
  const frameWidth = even(Number(opts.frameWidth ?? 160));
  const tileColumns = Math.max(1, Math.round(Number(opts.tileColumns ?? 4)));
  if (!Number.isFinite(interval) || interval <= 0) throw new Error('--interval must be positive');
  if (!Number.isFinite(frameWidth) || frameWidth < 64) throw new Error('--frame-width must be at least 64');

  const ffmpeg = await detectFfmpeg(opts);
  const originalInfo = await probeVideo(ffmpeg, original);
  const resultInfo = await probeVideo(ffmpeg, result);
  const compareDuration = Math.min(originalInfo.duration, resultInfo.duration);
  const frameHeight = even(Math.ceil(Math.max(frameWidth * originalInfo.height / originalInfo.width, frameWidth * resultInfo.height / resultInfo.width))) + 2;
  const sampleFps = 1 / interval;
  const frameCount = Math.max(1, Math.ceil(compareDuration / interval));

  const defaultOut = path.join(path.dirname(result), `comparison_${timestamp()}`);
  let outDir = path.resolve(opts.outDir || defaultOut);
  let suffix = 1;
  while (existsSync(outDir)) {
    outDir = `${path.resolve(opts.outDir || defaultOut)}_${suffix}`;
    suffix += 1;
  }

  const originalFrames = path.join(outDir, 'original_frames');
  const resultFrames = path.join(outDir, 'result_frames');
  const pairDir = path.join(outDir, 'pairs');
  await mkdir(originalFrames, { recursive: true });
  await mkdir(resultFrames, { recursive: true });
  await mkdir(pairDir, { recursive: true });

  const extractFilter = scalePadFilter(frameWidth, frameHeight, sampleFps);
  await runFfmpeg(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', original, '-t', String(compareDuration), '-vf', extractFilter, '-frames:v', String(frameCount), path.join(originalFrames, 'frame_%04d.png')]);
  await runFfmpeg(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', result, '-t', String(compareDuration), '-vf', extractFilter, '-frames:v', String(frameCount), path.join(resultFrames, 'frame_%04d.png')]);

  const originalList = await listFrames(originalFrames);
  const resultList = await listFrames(resultFrames);
  const pairCount = Math.min(originalList.length, resultList.length);
  if (pairCount === 0) throw new Error('No frames were extracted');

  for (let i = 0; i < pairCount; i += 1) {
    const pairPath = path.join(pairDir, `pair_${String(i + 1).padStart(4, '0')}.png`);
    await runFfmpeg(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', originalList[i], '-i', resultList[i], '-filter_complex', 'hstack=inputs=2', '-frames:v', '1', pairPath]);
  }

  const rows = Math.ceil(pairCount / tileColumns);
  const contactSheet = path.join(outDir, 'contact_sheet.png');
  await runFfmpeg(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', '1', '-i', path.join(pairDir, 'pair_%04d.png'), '-vf', `tile=${tileColumns}x${rows}:padding=4:margin=4`, '-frames:v', '1', contactSheet]);

  const sideWidth = even(Number(opts.sideWidth ?? 512));
  const sideHeight = even(Math.ceil(Math.max(sideWidth * originalInfo.height / originalInfo.width, sideWidth * resultInfo.height / resultInfo.width))) + 2;
  const sideBySide = path.join(outDir, 'side_by_side.mp4');
  const sideFilter = [
    `[0:v]scale=${sideWidth}:${sideHeight}:force_original_aspect_ratio=decrease,pad=${sideWidth}:${sideHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v0]`,
    `[1:v]scale=${sideWidth}:${sideHeight}:force_original_aspect_ratio=decrease,pad=${sideWidth}:${sideHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v1]`,
    '[v0][v1]hstack=inputs=2[outv]',
  ].join(';');
  await runFfmpeg(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', original, '-i', result, '-t', String(compareDuration), '-filter_complex', sideFilter, '-map', '[outv]', '-an', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', sideBySide]);

  const ssim = await computeMetric(ffmpeg, result, original, 'ssim', sideWidth, sideHeight, compareDuration);
  const psnr = await computeMetric(ffmpeg, result, original, 'psnr', sideWidth, sideHeight, compareDuration);

  const report = {
    original,
    result,
    out_dir: outDir,
    original_info: originalInfo,
    result_info: resultInfo,
    compared_duration: compareDuration,
    sample_interval: interval,
    sampled_frames: pairCount,
    ssim,
    psnr,
    contact_sheet: contactSheet,
    side_by_side_video: sideBySide,
    pairs_dir: pairDir,
    original_frames_dir: originalFrames,
    result_frames_dir: resultFrames,
  };
  const reportPath = path.join(outDir, 'comparison.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});