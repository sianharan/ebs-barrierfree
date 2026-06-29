// scripts/transcribe.js
// Phase 1 — 전처리(STT 단계만).
//
// source/sample-01.mp4 → ffmpeg로 음성만 추출 → 16kHz 모노 mp3(64kbps) 압축
//  → 25MB 초과 시 청크 분할 → OpenAI whisper-1(verbose_json)로 전사
//  → 청크별 시작 오프셋을 더해 원본 기준 타임코드로 병합
//  → data/sample-01/subtitles.json 에 한국어(ko)만 저장.
//
// 번역·어휘는 이후 단계(translate.js / vocabulary.js)에서 처리한다.
//
// 실행: node scripts/transcribe.js
// 필요: 로컬에 ffmpeg/ffprobe 설치, .env 의 OPENAI_API_KEY.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, rm, stat, readdir } from 'node:fs/promises';
import { existsSync, createWriteStream, openAsBlob } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

// ── 경로 설정 ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONTENT_ID = 'sample-01';
const SOURCE_MP4 = path.join(ROOT, 'source', `${CONTENT_ID}.mp4`);
const WORK_DIR = path.join(ROOT, 'source', `.cache-${CONTENT_ID}`); // source/ 는 gitignore
const AUDIO_MP3 = path.join(WORK_DIR, 'audio.mp3');
const OUT_DIR = path.join(ROOT, 'data', CONTENT_ID);
const OUT_JSON = path.join(OUT_DIR, 'subtitles.json');

// Whisper 업로드 한도는 25MB. 안전 마진을 둬 24MB 이하 청크로 나눈다.
const WHISPER_LIMIT = 25 * 1024 * 1024;
const CHUNK_TARGET = 24 * 1024 * 1024;

const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[transcribe] ${msg}`);
}

function fail(msg) {
  console.error(`\n[transcribe] ✗ ${msg}\n`);
  process.exit(1);
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

// .env 를 직접 파싱(dotenv 의존성 없이). 이미 process.env 에 있으면 그것을 우선.
async function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// 명령 존재 확인(ffmpeg/ffprobe).
async function ensureCommand(cmd) {
  try {
    await execFileAsync(cmd, ['-version']);
  } catch {
    fail(
      `'${cmd}' 를 찾을 수 없습니다. ffmpeg(ffprobe 포함)를 설치한 뒤 다시 실행하세요.\n` +
        `  Windows(winget):  winget install Gyan.FFmpeg\n` +
        `  설치 후 새 터미널에서 '${cmd} -version' 이 동작하는지 확인하세요.`
    );
  }
}

async function ffprobeDuration(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const dur = parseFloat(stdout.trim());
  if (!Number.isFinite(dur)) throw new Error(`ffprobe 가 길이를 읽지 못했습니다: ${file}`);
  return dur;
}

// ── 1) 오디오 추출 ─────────────────────────────────────────────────────────
async function extractAudio() {
  log(`오디오 추출: ${path.relative(ROOT, SOURCE_MP4)} → 16kHz 모노 mp3(64kbps)`);
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', SOURCE_MP4,
      '-vn',              // 영상 제거(음성만)
      '-ac', '1',         // 모노
      '-ar', '16000',     // 16kHz
      '-b:a', '64k',      // ~64kbps
      '-f', 'mp3',
      AUDIO_MP3,
    ],
    { maxBuffer: 1024 * 1024 * 64 }
  );
  const { size } = await stat(AUDIO_MP3);
  log(`추출 완료: ${mb(size)}MB`);
  return size;
}

// ── 2) 분할(필요 시) ───────────────────────────────────────────────────────
// 압축 mp3 가 25MB 이하면 단일 청크, 초과면 24MB 이하 길이로 시간 분할.
// 각 청크의 실제 길이를 ffprobe 로 측정해 오프셋을 누적(분할 드리프트 보정).
async function splitIfNeeded(audioSize) {
  if (audioSize <= WHISPER_LIMIT) {
    log(`25MB 이하 → 분할 불필요(단일 청크).`);
    return [{ file: AUDIO_MP3, offset: 0 }];
  }

  const totalDur = await ffprobeDuration(AUDIO_MP3);
  const bytesPerSec = audioSize / totalDur;
  const chunkSeconds = Math.max(1, Math.floor(CHUNK_TARGET / bytesPerSec));
  log(
    `${mb(audioSize)}MB > 25MB → 시간 분할(청크당 약 ${chunkSeconds}s, ` +
      `예상 ${Math.ceil(totalDur / chunkSeconds)}개)`
  );

  const pattern = path.join(WORK_DIR, 'chunk_%03d.mp3');
  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-i', AUDIO_MP3,
      '-f', 'segment',
      '-segment_time', String(chunkSeconds),
      '-c', 'copy',
      pattern,
    ],
    { maxBuffer: 1024 * 1024 * 64 }
  );

  const files = (await readdir(WORK_DIR))
    .filter((f) => /^chunk_\d{3}\.mp3$/.test(f))
    .sort()
    .map((f) => path.join(WORK_DIR, f));

  if (files.length === 0) fail('분할 결과 청크가 생성되지 않았습니다.');

  // 각 청크의 실제 길이로 오프셋 누적.
  const chunks = [];
  let offset = 0;
  for (const file of files) {
    const dur = await ffprobeDuration(file);
    const { size } = await stat(file);
    if (size > WHISPER_LIMIT) {
      fail(`청크가 여전히 25MB 초과(${mb(size)}MB): ${path.basename(file)}. 비트레이트/청크길이를 낮추세요.`);
    }
    chunks.push({ file, offset });
    offset += dur;
  }
  log(`분할 완료: ${chunks.length}개 청크.`);
  return chunks;
}

// ── 3) STT(whisper-1, verbose_json) ────────────────────────────────────────
async function transcribeChunk(file, apiKey) {
  const blob = await openAsBlob(file, { type: 'audio/mpeg' });
  const form = new FormData();
  form.append('file', blob, path.basename(file));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json'); // 세그먼트 타임코드 확보
  form.append('language', 'ko');                  // 한국어 힌트

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API ${res.status} ${res.statusText} — ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ── 4) 병합 → subtitles.json (ko 만) ───────────────────────────────────────
async function run() {
  await loadEnv();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) fail('.env 에 OPENAI_API_KEY 가 비어 있습니다.');
  if (!existsSync(SOURCE_MP4)) fail(`원본 영상을 찾을 수 없습니다: ${path.relative(ROOT, SOURCE_MP4)}`);

  await ensureCommand('ffmpeg');
  await ensureCommand('ffprobe');

  // 작업 디렉터리 초기화.
  await rm(WORK_DIR, { recursive: true, force: true });
  await mkdir(WORK_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  const audioSize = await extractAudio();
  const chunks = await splitIfNeeded(audioSize);

  const segments = [];
  let nextId = 0;
  for (let i = 0; i < chunks.length; i++) {
    const { file, offset } = chunks[i];
    log(`STT ${i + 1}/${chunks.length}: ${path.basename(file)} (offset ${offset.toFixed(2)}s)`);
    const result = await transcribeChunk(file, apiKey);
    const segs = Array.isArray(result.segments) ? result.segments : [];
    for (const s of segs) {
      const text = (s.text || '').trim();
      if (!text) continue;
      segments.push({
        id: nextId++,
        start: Number((s.start + offset).toFixed(3)),
        end: Number((s.end + offset).toFixed(3)),
        text: { ko: text }, // 이 단계는 ko 만. 다른 언어는 translate.js 에서 채운다.
      });
    }
    log(`  → 세그먼트 ${segs.length}개 누적(총 ${segments.length}개).`);
  }

  if (segments.length === 0) fail('전사 결과 세그먼트가 없습니다. 입력 오디오를 확인하세요.');

  const out = { segments };
  await writeJson(OUT_JSON, out);
  log(`✓ 저장: ${path.relative(ROOT, OUT_JSON)} (세그먼트 ${segments.length}개)`);
  log(`작업 캐시는 ${path.relative(ROOT, WORK_DIR)} 에 남겨둡니다(재실행 시 자동 정리).`);
}

async function writeJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(file);
    ws.on('error', reject);
    ws.on('finish', resolve);
    ws.end(JSON.stringify(obj, null, 2) + '\n');
  });
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
