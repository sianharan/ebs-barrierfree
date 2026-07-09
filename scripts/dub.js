// scripts/dub.js
// ⑥ 더빙 0단계 — 더빙 음성 사전 생성.
//
// data/sample-01/subtitles.json 의 특정 언어(기본 vi) 자막 텍스트를 OpenAI TTS 로
// 세그먼트마다 음성 합성해 mp3 로 저장한다.
//  → public/dub/sample-01/{lang}/{segmentId}.mp3 (segmentId 로 매칭)
//  → 각 mp3 의 실제 길이를 ffprobe 로 측정해 data/sample-01/dub-{lang}.json 에 저장
//     (플레이어가 원본 자막 구간 대비 더빙 길이를 알아 배속·정렬에 사용).
//
// 특징(translate.js 와 동일한 운영 방식):
//  - 배치/동시성: 세그먼트를 동시성 풀로 처리(요청당 1세그먼트 — TTS 는 텍스트 묶음 불가).
//  - 재시도: 429/5xx/네트워크 는 지수 백오프로 재시도.
//  - 진행 로그: 누적 진행 상황을 주기적으로 출력.
//  - 이어하기: 이미 만들어진 mp3(>0B)는 건너뛰고 없는 것만 생성.
//
// 실행:   node scripts/dub.js <lang>               (콘텐츠 sample-01 기본)
//         node scripts/dub.js <contentId> <lang>   (콘텐츠 확장 — 예: sample-02 en)
//         인자 생략 시 sample-01 vi.
// 필요:   .env 의 OPENAI_API_KEY, 로컬에 ffprobe(ffmpeg) 설치.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

// ── 경로 설정 ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// (콘텐츠별 경로 DATA_DIR/SUBTITLES_JSON 와 CONTENT_ID 는 인자 파싱 후 run() 에서 결정)

// ── 언어 설정(데이터로 관리 — 다른 언어 확장 시 여기만 보강) ──────────────────
// 자막 text 에 존재하는 언어면 인자로 받아 처리 가능.
const SUPPORTED_LANGS = ['ko', 'en', 'vi', 'zh', 'ja', 'es', 'fr', 'ru', 'id'];
const DEFAULT_LANG = 'vi';
// OpenAI gpt-4o 계열 instructions 용 언어 표기(api/tts.js 와 일치).
const LANG_NAMES = {
  ko: 'Korean',
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese',
  ja: 'Japanese',
  es: 'Spanish',
  fr: 'French',
  ru: 'Russian',
  id: 'Indonesian',
};

// ── OpenAI TTS 설정(api/tts.js 와 동일 기본값) ──────────────────────────────
const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';

const CONCURRENCY = 6;   // 동시 TTS 요청 수
const MAX_RETRIES = 4;   // 요청당 재시도(429/5xx/네트워크)
const LOG_EVERY = 10;    // 진행 로그 출력 간격(세그먼트)

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[dub] ${msg}`);
}
function fail(msg) {
  console.error(`\n[dub] ✗ ${msg}\n`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// .env 직접 파싱(dotenv 의존성 없이). 이미 process.env 에 있으면 그것을 우선.
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

// Windows: winget 등으로 설치한 ffprobe 가 현재 셸 PATH 에 안 잡힐 때, 레지스트리에
// 등록된 Machine+User PATH 를 다시 읽어 process.env.PATH 에 병합한다(PATH-reload).
async function reloadWindowsPath() {
  if (process.platform !== 'win32') return;
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile',
      '-Command',
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')",
    ]);
    const merged = stdout.trim();
    if (merged) {
      const existing = process.env.PATH || '';
      process.env.PATH = merged + path.delimiter + existing;
    }
  } catch {
    // PATH 재로딩 실패는 치명적이지 않음 — ensureFfprobe 에서 최종 판단.
  }
}

// ffprobe 존재 확인. 처음 실패하면 PATH 재로딩 후 1회 재시도.
async function ensureFfprobe() {
  try {
    await execFileAsync('ffprobe', ['-version']);
    return;
  } catch {
    await reloadWindowsPath();
  }
  try {
    await execFileAsync('ffprobe', ['-version']);
  } catch {
    fail(
      `'ffprobe' 를 찾을 수 없습니다. ffmpeg(ffprobe 포함)를 설치한 뒤 새 터미널에서 다시 실행하세요.\n` +
        `  Windows(winget):  winget install Gyan.FFmpeg`
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

// 동시성 제한 map(입력 순서 보존). translate.js 와 동일.
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runOne() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, runOne);
  await Promise.all(runners);
  return results;
}

// ── OpenAI TTS 호출(mp3 바이너리 반환) ──────────────────────────────────────
// 429/5xx/네트워크 는 지수 백오프로 재시도, 그 외 4xx 는 즉시 실패.
async function synthesize({ text, lang, apiKey, label }) {
  const payload = {
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    response_format: 'mp3',
  };
  // gpt-4o 계열만 instructions 를 받는다(tts-1 은 무시/거부). 발음 언어를 명시해 품질 보강.
  if (TTS_MODEL.startsWith('gpt-4o') && LANG_NAMES[lang]) {
    payload.instructions = `Read the text aloud naturally and clearly in ${LANG_NAMES[lang]}.`;
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(OPENAI_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
        }
        throw Object.assign(
          new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`),
          { fatal: true }
        );
      }

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('빈 오디오 응답');
      return buf;
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      if (attempt < MAX_RETRIES) {
        const backoff = 1000 * 2 ** (attempt - 1);
        log(`  ⟳ ${label} 재시도 ${attempt}/${MAX_RETRIES - 1} (${String(err.message).slice(0, 120)}) — ${backoff}ms 대기`);
        await sleep(backoff);
      }
    }
  }
  throw new Error(`${label} 실패: ${lastErr?.message || lastErr}`);
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();

  // 인자 파싱 — `dub.js <lang>`(콘텐츠 sample-01 기본) 또는 `dub.js <contentId> <lang>`.
  const argv = process.argv.slice(2);
  let contentId = 'sample-01';
  let lang;
  if (argv.length >= 2) {
    contentId = argv[0].trim();
    lang = argv[1].trim();
  } else {
    lang = (argv[0] || DEFAULT_LANG).trim();
  }
  if (!SUPPORTED_LANGS.includes(lang)) {
    fail(`지원하지 않는 언어 코드: '${lang}'. 가능: ${SUPPORTED_LANGS.join(', ')}`);
  }

  // 콘텐츠별 경로 결정(하위 코드가 쓰는 이름 그대로 로컬로 둔다).
  const CONTENT_ID = contentId;
  const DATA_DIR = path.join(ROOT, 'data', CONTENT_ID);
  const SUBTITLES_JSON = path.join(DATA_DIR, 'subtitles.json');
  if (!existsSync(DATA_DIR)) fail(`콘텐츠 폴더가 없습니다: data/${CONTENT_ID}`);

  // 키 확인.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) fail('.env 에 OPENAI_API_KEY 가 비어 있습니다.');

  // 입력 확인.
  if (!existsSync(SUBTITLES_JSON)) {
    fail(`자막 파일을 찾을 수 없습니다: ${path.relative(ROOT, SUBTITLES_JSON)} (먼저 transcribe.js → translate.js 실행)`);
  }
  await ensureFfprobe();

  const subtitles = JSON.parse(await readFile(SUBTITLES_JSON, 'utf8'));
  const segments = Array.isArray(subtitles.segments) ? subtitles.segments : [];
  if (segments.length === 0) fail('subtitles.json 에 세그먼트가 없습니다.');

  // 대상 언어 텍스트가 있는 세그먼트만.
  const items = [];
  for (const s of segments) {
    const text = s.text?.[lang];
    if (typeof text === 'string' && text.trim()) {
      items.push({ id: s.id, start: s.start, end: s.end, text: text.trim() });
    } else {
      log(`  ⚠ id ${s.id}: '${lang}' 텍스트 없음 → 건너뜀`);
    }
  }

  const outDir = path.join(ROOT, 'public', 'dub', CONTENT_ID, lang);
  await mkdir(outDir, { recursive: true });

  // 이어하기: 이미 존재(>0B)하는 mp3 는 제외.
  const todo = [];
  for (const it of items) {
    const file = path.join(outDir, `${it.id}.mp3`);
    let has = false;
    try {
      has = (await stat(file)).size > 0;
    } catch {
      has = false;
    }
    if (!has) todo.push(it);
  }

  log(
    `언어 '${lang}' / 모델 ${TTS_MODEL} / voice ${TTS_VOICE}\n` +
      `      세그먼트 ${items.length}개 중 생성 대상 ${todo.length}개(이미 있음 ${items.length - todo.length}개), ` +
      `동시 ${CONCURRENCY}, 재시도 ${MAX_RETRIES - 1}`
  );

  // 1) TTS 생성(없는 것만).
  let done = 0;
  if (todo.length > 0) {
    await mapPool(todo, CONCURRENCY, async (it) => {
      const file = path.join(outDir, `${it.id}.mp3`);
      const buf = await synthesize({
        text: it.text,
        lang,
        apiKey,
        label: `id ${it.id}`,
      });
      await writeFile(file, buf);
      done += 1;
      if (done % LOG_EVERY === 0 || done === todo.length) {
        log(`  ✓ 생성 ${done}/${todo.length} (방금 id ${it.id}, ${(buf.length / 1024).toFixed(1)}KB)`);
      }
    });
    log(`TTS 생성 완료: ${todo.length}개.`);
  } else {
    log(`생성할 새 음성 없음(전부 존재). duration 측정만 진행.`);
  }

  // 2) duration 측정 → dub-{lang}.json (모든 대상 세그먼트 기준).
  log(`ffprobe 로 ${items.length}개 음성 길이 측정 중…`);
  const measured = await mapPool(items, CONCURRENCY, async (it) => {
    const file = path.join(outDir, `${it.id}.mp3`);
    const duration = await ffprobeDuration(file);
    return {
      id: it.id,
      start: it.start,
      end: it.end,
      duration: Number(duration.toFixed(3)),
      audio: `/dub/${CONTENT_ID}/${lang}/${it.id}.mp3`,
    };
  });

  const dubJson = {
    contentId: CONTENT_ID,
    lang,
    model: TTS_MODEL,
    voice: TTS_VOICE,
    count: measured.length,
    segments: measured,
  };
  const outFile = path.join(DATA_DIR, `dub-${lang}.json`);
  await writeFile(outFile, JSON.stringify(dubJson, null, 2) + '\n');
  log(`✓ 저장: ${path.relative(ROOT, outFile)} (세그먼트 ${measured.length}개)`);

  const totalDur = measured.reduce((a, b) => a + b.duration, 0);
  log(`완료. 더빙 총 길이 약 ${totalDur.toFixed(1)}s, mp3 위치: public/dub/${CONTENT_ID}/${lang}/`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
