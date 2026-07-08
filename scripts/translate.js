// scripts/translate.js
// Phase 1 — 교정 + 번역 단계.
//
// data/sample-01/subtitles.json 의 한국어(ko) STT 자막을
//  → Claude(claude-opus-4-8)로 (1) 한국어 교정(STT 오류·구두점·고유명사·전문용어)
//     (2) 교정된 한국어 기준으로 en·vi·zh·ja 번역 을 배치 단위로 동시에 수행
//  → id/타임코드는 그대로 두고 각 세그먼트 text 에 5개 언어를 채워 다시 저장.
//  → data/sample-01/content.json 생성(제목·강사·설명·해시태그를 5개 언어로).
//
// 어휘(vocabulary)는 이후 단계(vocabulary.js)에서 처리한다.
//
// 실행: node scripts/translate.js [contentId]   (기본 sample-01)
// 필요: .env 의 ANTHROPIC_API_KEY.

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentConfig } from './contents.js';

// ── 경로 설정 ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 대상 콘텐츠는 CLI 인자로(기본 sample-01). 예: node scripts/translate.js sample-02
const CONTENT_ID = process.argv[2] || 'sample-01';
const CONFIG = contentConfig(CONTENT_ID);
const DATA_DIR = path.join(ROOT, 'data', CONTENT_ID);
const SUBTITLES_JSON = path.join(DATA_DIR, 'subtitles.json');
const CONTENT_JSON = path.join(DATA_DIR, 'content.json');

// ── 언어 설정(하드코딩 금지: 여기서만 관리) ───────────────────────────────
const SOURCE_LANG = 'ko';
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja'];
const LANGUAGES = [SOURCE_LANG, ...TARGET_LANGS];

// ── Claude API 설정 ────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 16000;

const BATCH_SIZE = 20;   // 세그먼트/요청
const CONCURRENCY = 4;   // 동시 요청 수
const MAX_RETRIES = 4;   // 요청당 재시도(429/5xx/네트워크/파싱)

// 콘텐츠 메타데이터(한국어 원문)와 영상 URL 은 콘텐츠 레지스트리(scripts/contents.js)에서.
// content.json 이 아직 없을 때만 CONTENT_META_KO 로 새로 생성한다(있으면 보존).
const CONTENT_META_KO = CONFIG.meta;
const VIDEO_URL = CONFIG.videoUrl;
const TOPIC = CONFIG.topic;
const INSTRUCTOR_NAMES = CONFIG.instructors || [];

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[translate] ${msg}`);
}

function fail(msg) {
  console.error(`\n[translate] ✗ ${msg}\n`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function writeJson(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(file);
    ws.on('error', reject);
    ws.on('finish', resolve);
    ws.end(JSON.stringify(obj, null, 2) + '\n');
  });
}

// 동시성 제한 map. 입력 순서를 보존해 결과를 반환한다.
async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

// ── 스키마 빌더 ────────────────────────────────────────────────────────────
// {ko,en,vi,zh,ja} 형태의 다국어 객체 스키마.
function multilingualSchema() {
  const properties = {};
  for (const lang of LANGUAGES) properties[lang] = { type: 'string' };
  return {
    type: 'object',
    properties,
    required: [...LANGUAGES],
    additionalProperties: false,
  };
}

// 자막 배치 응답 스키마: {segments:[{id, ko, en, vi, zh, ja}, ...]}
function subtitlesBatchSchema() {
  const segProps = { id: { type: 'integer' } };
  for (const lang of LANGUAGES) segProps[lang] = { type: 'string' };
  return {
    type: 'object',
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: segProps,
          required: ['id', ...LANGUAGES],
          additionalProperties: false,
        },
      },
    },
    required: ['segments'],
    additionalProperties: false,
  };
}

// content.json 메타 응답 스키마.
function contentMetaSchema() {
  const ml = multilingualSchema();
  return {
    type: 'object',
    properties: {
      title: ml,
      instructors: { type: 'array', items: ml },
      description: ml,
      hashtags: { type: 'array', items: ml },
    },
    required: ['title', 'instructors', 'description', 'hashtags'],
    additionalProperties: false,
  };
}

// ── Claude 호출(structured output) ─────────────────────────────────────────
// 구조화 출력으로 강제하고, 텍스트 블록의 JSON 을 파싱해 반환한다.
// 429/5xx/네트워크/파싱 실패는 지수 백오프로 재시도한다.
async function callClaude({ system, user, schema, apiKey, label }) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: { format: { type: 'json_schema', schema } },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 429/5xx 는 재시도, 그 외(4xx)는 즉시 실패.
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
        }
        throw Object.assign(
          new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 500)}`),
          { fatal: true }
        );
      }

      const data = await res.json();
      if (data.stop_reason === 'refusal') {
        throw Object.assign(new Error(`모델이 요청을 거부했습니다(refusal).`), { fatal: true });
      }
      if (data.stop_reason === 'max_tokens') {
        // 배치를 줄이면 해결되지만, 우선 재시도로 처리.
        throw new Error(`출력이 max_tokens 로 잘렸습니다. 배치 크기를 줄이세요.`);
      }

      const text = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error(`JSON 파싱 실패: ${text.slice(0, 200)}`);
      return parsed;
    } catch (err) {
      lastErr = err;
      if (err.fatal) break;
      if (attempt < MAX_RETRIES) {
        const backoff = 1000 * 2 ** (attempt - 1);
        log(`  ⟳ ${label} 재시도 ${attempt}/${MAX_RETRIES - 1} (${err.message.slice(0, 120)}) — ${backoff}ms 대기`);
        await sleep(backoff);
      }
    }
  }
  throw new Error(`${label} 실패: ${lastErr?.message || lastErr}`);
}

// 구조화 출력이면 순수 JSON 이지만, 혹시 모를 잡텍스트에 대비해 느슨히 파싱.
function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── 프롬프트 ───────────────────────────────────────────────────────────────
const namesForPrompt = INSTRUCTOR_NAMES.map((n) => `'${n}'`).join(', ');

const SUBTITLE_SYSTEM = `당신은 EBS 교육 영상의 한국어 STT(음성인식) 자막을 교정하고 다국어로 번역하는 전문 번역가입니다.

영상 주제: ${TOPIC}

[작업] 입력은 한국어 자막 세그먼트 배열(각 {id, ko})입니다. 각 세그먼트마다 다음을 수행합니다.
1) 한국어 교정: STT 오인식 단어, 띄어쓰기, 구두점을 자연스럽게 바로잡습니다. 의미와 분량은 최대한 보존하고, 내용을 새로 추가하거나 삭제하지 않습니다. 세그먼트 경계는 그대로 둡니다(문장을 합치거나 나누지 마세요).
2) 고유명사: 강사 이름은 ${namesForPrompt} 입니다. STT가 유사 발음으로 잘못 적었다면 올바른 이름으로 교정하세요.
3) 전문용어: 유아 발달·놀이 관련 용어(예: 대근육/소근육 운동, 운동 발달, 협응, 균형감각, 정서 발달 등)를 정확하게 교정합니다.
4) 번역: 교정된 한국어를 기준으로 영어(en), 베트남어(vi), 중국어 간체(zh), 일본어(ja)로 번역합니다. 강의의 구어체 어조를 유지하되 각 언어로 자연스럽게 옮기고, 전문용어는 일관되게 사용합니다.

[출력] 주어진 스키마에 맞춰 입력의 모든 id에 대해 {id, ko(교정본), en, vi, zh, ja}를 반환합니다. id는 입력과 정확히 일치해야 합니다.`;

const CONTENT_SYSTEM = `당신은 EBS 교육 영상의 메타데이터를 다국어로 번역하는 전문 번역가입니다.

한국어 원문을 영어(en)·베트남어(vi)·중국어 간체(zh)·일본어(ja)로 번역하고, 한국어(ko)는 원문 그대로 둡니다.
- 강사 이름(person name)은 번역하지 말고 각 언어 표기 관습에 맞게 음역(transliterate)합니다(en은 로마자, ja는 가타카나/한자 관습, zh는 한자 표기, vi는 로마자). ko는 한글 원문 그대로 둡니다.
- 해시태그는 단어 단위로 자연스럽게 번역합니다.
- 제목과 설명은 교육적이고 자연스러운 어조로 번역합니다.
영상 주제: ${TOPIC}`;

// ── 자막 교정+번역 ─────────────────────────────────────────────────────────
async function translateSubtitles(segments, apiKey) {
  // 배치로 분할.
  const batches = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }
  log(`자막 ${segments.length}개 → ${batches.length}개 배치(배치당 ${BATCH_SIZE}, 동시 ${CONCURRENCY})로 교정+번역`);

  let done = 0;
  const byId = new Map();

  await mapPool(batches, CONCURRENCY, async (batch, idx) => {
    const input = batch.map((s) => ({ id: s.id, ko: s.text.ko }));
    const user =
      `다음 한국어 자막 세그먼트를 교정하고 번역하세요.\n` +
      `입력 JSON:\n${JSON.stringify(input, null, 2)}`;

    const result = await callClaude({
      system: SUBTITLE_SYSTEM,
      user,
      schema: subtitlesBatchSchema(),
      apiKey,
      label: `배치 ${idx + 1}/${batches.length}`,
    });

    const segs = Array.isArray(result.segments) ? result.segments : [];
    const got = new Map(segs.map((s) => [s.id, s]));
    // 요청한 모든 id가 응답에 있는지 확인(누락 시 throw → mapPool 밖에서 처리됨).
    for (const s of batch) {
      const r = got.get(s.id);
      if (!r) throw new Error(`배치 ${idx + 1}: id ${s.id} 응답 누락`);
      for (const lang of LANGUAGES) {
        if (typeof r[lang] !== 'string' || !r[lang].trim()) {
          throw new Error(`배치 ${idx + 1}: id ${s.id} 의 '${lang}' 누락/빈값`);
        }
      }
      byId.set(s.id, r);
    }

    done += batch.length;
    log(`  ✓ 배치 ${idx + 1}/${batches.length} 완료(누적 ${done}/${segments.length})`);
  });

  // 원본 순서/타임코드를 유지하며 text 만 갱신.
  return segments.map((s) => {
    const r = byId.get(s.id);
    const text = {};
    for (const lang of LANGUAGES) text[lang] = r[lang].trim();
    return { id: s.id, start: s.start, end: s.end, text };
  });
}

// ── content.json 생성 ──────────────────────────────────────────────────────
// content.json 이 이미 있으면 보존한다(예: sample-02 는 10개 언어가 이미 채워져 있어
// 5개 언어로 재생성하면 오히려 데이터가 줄어든다). null 을 반환하면 저장하지 않는다.
async function buildContent(apiKey) {
  if (existsSync(CONTENT_JSON)) {
    let langs = '?';
    try {
      langs = JSON.parse(await readFile(CONTENT_JSON, 'utf8')).languages?.length ?? '?';
    } catch {
      /* 파싱 실패해도 보존 결정에는 영향 없음 */
    }
    log(`content.json 이미 존재 → 보존(재생성 안 함, 언어 ${langs}개).`);
    return null;
  }
  if (!CONTENT_META_KO) {
    fail(
      `content.json 이 없고 scripts/contents.js 의 '${CONTENT_ID}'.meta 도 비어 있습니다. ` +
        `한국어 메타(title·instructors·description·hashtags)를 채우세요.`,
    );
  }
  log(`content.json 메타데이터 번역(제목·강사 ${CONTENT_META_KO.instructors.length}명·설명·해시태그 ${CONTENT_META_KO.hashtags.length}개)`);

  const user =
    `다음 한국어 메타데이터를 ${TARGET_LANGS.join('·')} 로 번역하고, ko는 원문 그대로 두세요.\n` +
    `입력 JSON:\n${JSON.stringify(CONTENT_META_KO, null, 2)}`;

  const meta = await callClaude({
    system: CONTENT_SYSTEM,
    user,
    schema: contentMetaSchema(),
    apiKey,
    label: 'content 메타',
  });

  // 검증 + ko 원문 강제(번역 단계가 ko를 바꾸지 않도록 원문으로 덮어씀).
  const checkML = (obj, where) => {
    for (const lang of LANGUAGES) {
      if (typeof obj?.[lang] !== 'string' || !obj[lang].trim()) {
        throw new Error(`content ${where}: '${lang}' 누락/빈값`);
      }
    }
  };
  checkML(meta.title, 'title');
  checkML(meta.description, 'description');

  if (!Array.isArray(meta.instructors) || meta.instructors.length !== CONTENT_META_KO.instructors.length) {
    throw new Error(`content instructors 개수 불일치(${meta.instructors?.length} != ${CONTENT_META_KO.instructors.length})`);
  }
  if (!Array.isArray(meta.hashtags) || meta.hashtags.length !== CONTENT_META_KO.hashtags.length) {
    throw new Error(`content hashtags 개수 불일치(${meta.hashtags?.length} != ${CONTENT_META_KO.hashtags.length})`);
  }
  meta.instructors.forEach((m, i) => {
    checkML(m, `instructors[${i}]`);
    m.ko = CONTENT_META_KO.instructors[i]; // ko 원문 보장
  });
  meta.hashtags.forEach((m, i) => {
    checkML(m, `hashtags[${i}]`);
    m.ko = CONTENT_META_KO.hashtags[i]; // ko 원문 보장
  });
  meta.title.ko = CONTENT_META_KO.title;
  meta.description.ko = CONTENT_META_KO.description;

  return {
    id: CONTENT_ID,
    type: 'video',
    title: meta.title,
    instructors: meta.instructors,
    description: meta.description,
    hashtags: meta.hashtags,
    videoUrl: VIDEO_URL,
    languages: LANGUAGES,
  };
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  log(`대상 콘텐츠: ${CONTENT_ID}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) fail('.env 에 ANTHROPIC_API_KEY 가 비어 있습니다.');
  if (!existsSync(SUBTITLES_JSON)) {
    fail(`자막 파일을 찾을 수 없습니다: ${path.relative(ROOT, SUBTITLES_JSON)} (먼저 transcribe.js 를 실행하세요)`);
  }

  const subtitles = JSON.parse(await readFile(SUBTITLES_JSON, 'utf8'));
  const segments = Array.isArray(subtitles.segments) ? subtitles.segments : [];
  if (segments.length === 0) fail('subtitles.json 에 세그먼트가 없습니다.');

  // 1) 자막 교정 + 번역
  const translated = await translateSubtitles(segments, apiKey);
  await writeJson(SUBTITLES_JSON, { segments: translated });
  log(`✓ 저장: ${path.relative(ROOT, SUBTITLES_JSON)} (세그먼트 ${translated.length}개 × ${LANGUAGES.length}개 언어)`);

  // 2) content.json (이미 있으면 buildContent 가 null 을 반환 → 보존)
  const content = await buildContent(apiKey);
  if (content) {
    await writeJson(CONTENT_JSON, content);
    log(`✓ 저장: ${path.relative(ROOT, CONTENT_JSON)}`);
  }

  log(`완료. 어휘 풀이는 vocabulary.js 에서 처리합니다.`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
