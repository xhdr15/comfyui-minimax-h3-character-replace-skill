#!/usr/bin/env node
import { randomInt, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.dirname(scriptDir);

function usage() {
  return [
    'Usage:',
    '  node scripts/run_h3_workflow.mjs --plan --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path> [options]',
    '  node scripts/run_h3_workflow.mjs --execute --character-image-1 <path> --character-image-2 <path> --source-video <path> --prompt-file <path> [options]',
    '',
    'Options:',
    '  --profile <path>             Profile JSON. Defaults to h3-vram-optimized.',
    '  --duration <seconds>         Output duration. Defaults to profile value.',
    '  --source-frames <frames>     Override VHS_LoadVideo frame_load_cap.',
    '  --source-start-frame <n>    Zero-based source frame offset. Default 0.',
    '  --aspect-ratio <value>       ResolutionSelector aspect_ratio.',
    '  --megapixels <number>        ResolutionSelector megapixels.',
    '  --seed <integer>             RandomNoise seed. Defaults to random.',
    '  --output-prefix <text>       VHS_VideoCombine filename_prefix.',
    '  --run-dir <path>             Run directory. Defaults to ./character-replace-runs/<run>.',
    '  --comfy-root <path>          ComfyUI root. Auto-detected from /system_stats when possible.',
    '  --server <url>               Local ComfyUI server. Defaults to profile server.',
    '  --poll-seconds <number>      History polling interval. Default 3.',
    '  --timeout-minutes <number>   Execution timeout. Default 120.',
  ].join('\n');
}

function parseArgs(argv) {
  const opts = { plan: false, execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') opts.plan = true;
    else if (arg === '--execute') opts.execute = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
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
  if (opts.plan && opts.execute) throw new Error('Use only one of --plan or --execute');
  if (!opts.plan && !opts.execute) opts.plan = true;
  return opts;
}

async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveFrom(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value);
}

function requireOption(opts, key, label) {
  const value = opts[key];
  if (!value) throw new Error(`Missing required ${label}`);
  return value;
}

function computeH3FrameLength(seconds) {
  const frames = Math.max(5, Math.round(seconds * 24));
  return frames + ((5 - (frames % 17)) % 17);
}

function safeTimestamp(date = new Date()) {
  const p = (n, width = 2) => String(n).padStart(width, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function normalizeNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`);
  return n;
}

function setInput(workflow, profile, bindingName, value) {
  const binding = profile.bindings[bindingName];
  if (!binding) throw new Error(`Profile is missing binding ${bindingName}`);
  const node = workflow[binding.node];
  if (!node) throw new Error(`Workflow is missing node ${binding.node} for ${bindingName}`);
  node.inputs[binding.input] = value;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} returned non-JSON response (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`);
  return data;
}

async function detectComfyRoot(server, explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (process.env.COMFYUI_ROOT) return path.resolve(process.env.COMFYUI_ROOT);

  try {
    const stats = await fetchJson(`${server}/system_stats`);
    const argv = stats.system?.argv || stats.argv || [];
    const mainArg = argv.find((arg) => typeof arg === 'string' && /main\.py$/i.test(arg));
    if (mainArg) return path.dirname(mainArg);
  } catch {
    return null;
  }
  return null;
}

async function validateServerWorkflow(server, workflow, profile) {
  const objectInfo = await fetchJson(`${server}/object_info`);
  for (const [nodeId, expectedType] of Object.entries(profile.required_nodes || {})) {
    const node = workflow[nodeId];
    if (!node || node.class_type !== expectedType) {
      throw new Error(`Workflow node ${nodeId} is not ${expectedType}`);
    }
    if (!objectInfo[expectedType]) {
      throw new Error(`ComfyUI server does not expose node type ${expectedType}`);
    }
  }
}

function stageName(runId, label, sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || '.bin';
  return `codex_h3_${runId}_${label}${ext}`;
}

async function validateLocalFile(filePath, label) {
  if (!(await fileExists(filePath))) throw new Error(`${label} does not exist: ${filePath}`);
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  return info;
}

function collectOutputAssets(outputs) {
  const assets = [];
  const seen = new Set();

  function walk(value, nodeId) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.filename === 'string') {
      const key = `${nodeId}|${value.subfolder || ''}|${value.type || ''}|${value.filename}`;
      if (!seen.has(key)) {
        seen.add(key);
        assets.push({
          node_id: nodeId,
          filename: value.filename,
          subfolder: value.subfolder || '',
          type: value.type || 'output',
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) walk(child, nodeId || key);
  }

  for (const [nodeId, value] of Object.entries(outputs || {})) walk(value, nodeId);
  return assets;
}

async function downloadAsset(server, asset, outputDir) {
  const url = new URL('/view', `${server}/`);
  url.searchParams.set('filename', asset.filename);
  url.searchParams.set('subfolder', asset.subfolder);
  url.searchParams.set('type', asset.type);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${asset.filename}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileName = path.basename(`${asset.node_id}_${asset.filename}`);
  const outputPath = path.join(outputDir, fileName);
  await writeFile(outputPath, bytes);
  return outputPath;
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const profilePath = opts.profile
    ? path.resolve(opts.profile)
    : path.join(skillRoot, 'assets', 'profiles', 'h3-vram-optimized.json');
  const profile = await readJson(profilePath);
  const workflowPath = resolveFrom(skillRoot, profile.workflow);
  const workflow = await readJson(workflowPath);

  const characterImage1 = path.resolve(requireOption(opts, 'characterImage1', '--character-image-1'));
  const characterImage2 = path.resolve(requireOption(opts, 'characterImage2', '--character-image-2'));
  const sourceVideo = path.resolve(requireOption(opts, 'sourceVideo', '--source-video'));
  const image1Info = await validateLocalFile(characterImage1, 'Character image 1');
  const image2Info = await validateLocalFile(characterImage2, 'Character image 2');
  const videoInfo = await validateLocalFile(sourceVideo, 'Source video');

  let prompt = opts.prompt;
  if (opts.promptFile) prompt = await readFile(path.resolve(opts.promptFile), 'utf8');
  if (!prompt) prompt = workflow[profile.bindings.prompt.node]?.inputs?.[profile.bindings.prompt.input];
  if (!prompt || !String(prompt).trim()) throw new Error('A non-empty prompt is required');

  const durationSeconds = opts.duration
    ? normalizeNumber(opts.duration, '--duration')
    : Number(profile.defaults?.duration_seconds ?? 8);
  const sourceFrames = opts.sourceFrames
    ? normalizeNumber(opts.sourceFrames, '--source-frames')
    : computeH3FrameLength(durationSeconds);
  const sourceStartFrame = opts.sourceStartFrame
    ? normalizeNumber(opts.sourceStartFrame, '--source-start-frame')
    : 0;
  const aspectRatio = opts.aspectRatio || profile.defaults?.aspect_ratio;
  const megapixels = opts.megapixels
    ? normalizeNumber(opts.megapixels, '--megapixels')
    : Number(profile.defaults?.megapixels ?? 0.3);
  const seed = opts.seed ? Number(opts.seed) : randomInt(0, 2147483647);
  if (!Number.isSafeInteger(seed)) throw new Error('--seed must be an integer');

  const server = (opts.server || profile.server || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  const runId = `${safeTimestamp()}_${randomUUID().slice(0, 8)}`;
  const outputPrefix = opts.outputPrefix || `H3_character_replace_${runId}`;
  const runDir = path.resolve(opts.runDir || path.join(process.cwd(), 'character-replace-runs', runId));
  const outputDir = path.join(runDir, 'output');
  await mkdir(outputDir, { recursive: true });

  const staged = {
    characterImage1: stageName(runId, 'image_1', characterImage1),
    characterImage2: stageName(runId, 'image_2', characterImage2),
    sourceVideo: stageName(runId, 'source_video', sourceVideo),
  };

  const patched = structuredClone(workflow);
  setInput(patched, profile, 'character_image_1', staged.characterImage1);
  setInput(patched, profile, 'character_image_2', staged.characterImage2);
  setInput(patched, profile, 'source_video', staged.sourceVideo);
  setInput(patched, profile, 'duration_seconds', durationSeconds);
  setInput(patched, profile, 'source_frames', sourceFrames);
  setInput(patched, profile, 'source_start_frame', sourceStartFrame);
  setInput(patched, profile, 'prompt', String(prompt));
  if (aspectRatio) setInput(patched, profile, 'aspect_ratio', aspectRatio);
  setInput(patched, profile, 'megapixels', megapixels);
  setInput(patched, profile, 'seed', seed);
  setInput(patched, profile, 'output_prefix', outputPrefix);

  const comfyRoot = await detectComfyRoot(server, opts.comfyRoot);
  let serverAvailable = false;
  try {
    await validateServerWorkflow(server, patched, profile);
    serverAvailable = true;
  } catch (error) {
    if (opts.execute) throw error;
    if (opts.comfyRoot) throw error;
  }

  const plan = {
    mode: opts.execute ? 'execute' : 'plan',
    profile: profile.name,
    profile_path: profilePath,
    workflow_path: workflowPath,
    server,
    server_available: serverAvailable,
    comfy_root: comfyRoot,
    run_dir: runDir,
    duration_seconds: durationSeconds,
    source_frames: sourceFrames,
    source_start_frame: sourceStartFrame,
    aspect_ratio: aspectRatio,
    megapixels,
    seed,
    output_prefix: outputPrefix,
    staged_inputs: {
      character_image_1: { source: characterImage1, staged: staged.characterImage1, bytes: image1Info.size },
      character_image_2: { source: characterImage2, staged: staged.characterImage2, bytes: image2Info.size },
      source_video: { source: sourceVideo, staged: staged.sourceVideo, bytes: videoInfo.size },
    },
    patched_inputs: {
      character_image_1: staged.characterImage1,
      character_image_2: staged.characterImage2,
      source_video: staged.sourceVideo,
      duration_seconds: durationSeconds,
      source_frames: sourceFrames,
      source_start_frame: sourceStartFrame,
      prompt,
      aspect_ratio: aspectRatio,
      megapixels,
      seed,
      output_prefix: outputPrefix,
    },
  };

  await writeFile(path.join(runDir, 'workflow.api.json'), JSON.stringify(patched, null, 2), 'utf8');
  await writeFile(path.join(runDir, 'plan.json'), JSON.stringify(plan, null, 2), 'utf8');

  if (!opts.execute) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  if (!comfyRoot) throw new Error('Could not detect ComfyUI root. Pass --comfy-root.');
  const inputDir = path.join(comfyRoot, 'input');
  if (!(await fileExists(inputDir))) throw new Error(`ComfyUI input directory not found: ${inputDir}`);

  await copyFile(characterImage1, path.join(inputDir, staged.characterImage1));
  await copyFile(characterImage2, path.join(inputDir, staged.characterImage2));
  await copyFile(sourceVideo, path.join(inputDir, staged.sourceVideo));

  const startedAt = new Date();
  const submit = await fetchJson(`${server}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: patched, client_id: runId }),
  });
  const promptId = submit.prompt_id;
  if (!promptId) throw new Error(`Submit response did not include prompt_id: ${JSON.stringify(submit)}`);

  const timeoutMs = normalizeNumber(opts.timeoutMinutes ?? 120, '--timeout-minutes') * 60 * 1000;
  const pollMs = normalizeNumber(opts.pollSeconds ?? 3, '--poll-seconds') * 1000;
  const deadline = Date.now() + timeoutMs;
  let historyEntry = null;

  while (Date.now() < deadline) {
    const history = await fetchJson(`${server}/history/${promptId}`);
    historyEntry = history[promptId] || null;
    if (historyEntry) {
      const status = historyEntry.status || {};
      if (status.status_str === 'error') {
        throw new Error(`ComfyUI execution failed: ${JSON.stringify(status.messages || status)}`);
      }
      if (status.completed === true || historyEntry.outputs) break;
    }
    await delay(pollMs);
  }

  if (!historyEntry) throw new Error(`Timed out waiting for prompt ${promptId}`);

  const assets = collectOutputAssets(historyEntry.outputs);
  const downloaded = [];
  for (const asset of assets) downloaded.push(await downloadAsset(server, asset, outputDir));

  if (downloaded.length === 0) {
    const outputRoot = path.join(comfyRoot, 'output');
    const entries = await readdir(outputRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith(outputPrefix)) continue;
      const source = path.join(outputRoot, entry.name);
      const info = await stat(source);
      if (info.mtimeMs < startedAt.getTime() - 5000) continue;
      const target = path.join(outputDir, entry.name);
      await copyFile(source, target);
      downloaded.push(target);
    }
  }

  const manifest = {
    ...plan,
    mode: 'execute',
    status: 'completed',
    prompt_id: promptId,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    outputs: downloaded,
    history: historyEntry,
  };
  await writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});