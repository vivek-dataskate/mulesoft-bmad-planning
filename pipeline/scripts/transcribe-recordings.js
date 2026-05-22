#!/usr/bin/env node
/**
 * Transcribes MP4 meeting recordings using Gemini File API.
 * Saves transcript as {recording-name}.txt alongside the video.
 * Skips files that already have a .txt transcript.
 * Skips duplicate files (those ending with " (N).mp4").
 *
 * Usage:
 *   node pipeline/scripts/transcribe-recordings.js               # scans _inbox/
 *   node pipeline/scripts/transcribe-recordings.js --dir <path>  # scans a specific directory
 * Requires: GEMINI_API_KEY env var
 *
 * Status: written to {dir}/transcription-status.json after every file.
 */

const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, execFileSync } = require("child_process");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("Error: GEMINI_API_KEY environment variable not set.");
  process.exit(1);
}

const fileManager = new GoogleAIFileManager(API_KEY);
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const dirArgIdx = process.argv.indexOf("--dir");
const INBOX_DIR = dirArgIdx !== -1
  ? path.resolve(process.argv[dirArgIdx + 1])
  : path.join(__dirname, "..", "_inbox");

const STATUS_FILE = path.join(INBOX_DIR, "transcription-status.json");

const PROMPT = `Transcribe this meeting recording verbatim.
Format as speaker-labeled dialogue where possible (e.g. "Speaker 1:", "Speaker 2:" or use names if mentioned).
Include approximate timestamps every 2-3 minutes (e.g. [00:05], [00:08]).
Output the full transcript only — no summary, no preamble.`;

const STAGES = ["upload", "processing", "transcribing"];

function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8")); } catch { return {}; }
}

function writeStatus(key, stageName, status, extra = {}) {
  const all = readStatus();
  if (!all[key]) all[key] = { overall: "started", stages: {}, updatedAt: null };
  if (!all[key].stages) all[key].stages = {};

  if (stageName) {
    if (!all[key].stages[stageName]) all[key].stages[stageName] = {};
    if (status === "running") all[key].stages[stageName].startedAt = new Date().toISOString();
    all[key].stages[stageName].status = status;
    if (extra.error) all[key].stages[stageName].error = extra.error;
  }

  // derive overall
  const stages = all[key].stages;
  const allDone = STAGES.every(s => stages[s]?.status === "done");
  const anyFailed = STAGES.some(s => stages[s]?.status === "failed");
  all[key].overall = allDone ? "done" : anyFailed ? "failed" : stageName ? status : all[key].overall;

  if (extra.sizeMb !== undefined) all[key].sizeMb = extra.sizeMb;
  if (extra.transcript) all[key].transcript = extra.transcript;
  all[key].updatedAt = new Date().toISOString();

  fs.writeFileSync(STATUS_FILE, JSON.stringify(all, null, 2), "utf8");
}

function extractAudio(videoPath) {
  const tmpDir = os.tmpdir();
  const audioPath = path.join(tmpDir, path.basename(videoPath).replace(/\.mp4$/i, ".mp3"));
  execFileSync("ffmpeg", ["-y", "-i", videoPath, "-vn", "-q:a", "4", audioPath], { stdio: "pipe" });
  return audioPath;
}

function toSlug(name) {
  return name
    .replace(/_Customer$/i, "").replace(/_customer$/i, "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clientScopingDir(filePath) {
  const rel = path.relative(INBOX_DIR, filePath);
  const clientFolder = rel.split(path.sep)[0];
  const slug = toSlug(clientFolder);
  const dir = path.join(__dirname, "..", "projects", slug, "scoping");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findMp4Files(dir) {
  const output = execSync(`find "${dir}" -name "*.mp4" | sort`).toString().trim();
  return output
    .split("\n")
    .filter(Boolean)
    .filter(f => !/ \(\d+\)\.mp4$/.test(f)); // skip duplicates like "Recording (1).mp4"
}

async function waitForFileActive(name) {
  let file = await fileManager.getFile(name);
  process.stdout.write("  Processing");
  while (file.state === "PROCESSING") {
    await new Promise(r => setTimeout(r, 5000));
    process.stdout.write(".");
    file = await fileManager.getFile(name);
  }
  process.stdout.write("\n");
  if (file.state !== "ACTIVE") {
    throw new Error(`File entered state ${file.state} — cannot transcribe.`);
  }
  return file;
}

async function transcribeFile(filePath) {
  const label = filePath.replace(INBOX_DIR + "/", "");
  const txtPath = filePath.replace(/\.mp4$/i, ".txt");
  const sizeMb = Number((fs.statSync(filePath).size / 1024 / 1024).toFixed(0));

  if (fs.existsSync(txtPath)) {
    console.log(`[SKIP]   ${label} — transcript already exists`);
    writeStatus(label, null, "skipped", { sizeMb, transcript: path.basename(txtPath) });
    return;
  }

  console.log(`\n[START]  ${label}`);
  console.log(`  Video: ${sizeMb} MB`);
  writeStatus(label, "upload", "running", { sizeMb });

  console.log("  Extracting audio...");
  const audioPath = extractAudio(filePath);
  const audioSizeMb = Number((fs.statSync(audioPath).size / 1024 / 1024).toFixed(0));
  console.log(`  Audio: ${audioSizeMb} MB (${Math.round((audioSizeMb / sizeMb) * 100)}% of video)`);

  const scopingDir = clientScopingDir(filePath);
  const audioDestPath = path.join(scopingDir, path.basename(audioPath));

  let uploadResult;
  try {
    console.log(`  Uploading audio to Gemini File API...`);
    uploadResult = await fileManager.uploadFile(audioPath, {
      mimeType: "audio/mpeg",
      displayName: path.basename(audioPath),
    });
  } catch (err) {
    fs.unlinkSync(audioPath);
    throw err;
  }
  fs.renameSync(audioPath, audioDestPath);
  console.log(`  Audio saved: projects/${path.relative(path.join(__dirname, "..", "projects"), audioDestPath)}`);
  writeStatus(label, "upload", "done");

  writeStatus(label, "processing", "running");
  const file = await waitForFileActive(uploadResult.file.name);
  writeStatus(label, "processing", "done");

  writeStatus(label, "transcribing", "running");
  console.log("  Transcribing...");
  let result;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      result = await model.generateContent([
        { fileData: { fileUri: file.uri, mimeType: "audio/mpeg" } },
        { text: PROMPT },
      ]);
      break;
    } catch (err) {
      const retryMatch = err.message.match(/retry in (\d+)/i);
      const waitSec = retryMatch ? parseInt(retryMatch[1]) + 5 : attempt * 30;
      if (attempt === 5) throw err;
      console.log(`  Rate limited — retrying in ${waitSec}s (attempt ${attempt}/5)...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }

  const transcript = result.response.text();
  fs.writeFileSync(txtPath, transcript, "utf8");
  console.log(`[DONE]   Saved: ${path.basename(txtPath)}`);
  writeStatus(label, "transcribing", "done", { transcript: path.basename(txtPath) });

  await fileManager.deleteFile(file.name);
}

async function main() {
  const files = findMp4Files(INBOX_DIR);

  if (files.length === 0) {
    console.log("No MP4 files found.");
    return;
  }

  console.log(`Found ${files.length} recording(s) to process:\n`);
  files.forEach(f => console.log(`  ${f.replace(INBOX_DIR + "/", "")}`));
  console.log();

  for (const f of files) {
    const label = f.replace(INBOX_DIR + "/", "");
    try {
      await transcribeFile(f);
    } catch (err) {
      console.error(`[ERROR]  ${path.basename(f)}: ${err.message}`);
      // mark whichever stage was last running as failed
      const all = readStatus();
      const stages = all[label]?.stages || {};
      const runningStage = STAGES.find(s => stages[s]?.status === "running") || "transcribing";
      writeStatus(label, runningStage, "failed", { error: err.message });
    }
  }

  console.log("\nAll done.");
  console.log(`Status: ${STATUS_FILE}`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
