// scripts/vocabulary.js
// Phase 1 — 어휘 풀이 사전 생성 단계.
//
// data/sample-01/subtitles.json 의 교정된 한국어(ko)에서
//  → Claude(claude-opus-4-8)로 (1) 학습자(다문화가정·외국인)가 어려워할 주요 단어를
//     전체 자막을 한 번에 보고 추출(유아 신체발달·놀이 관련 전문용어 위주, 쉬운 일상어 제외, 중복 없이)
//     (2) 추출된 단어를 배치 단위로 5개 언어(ko·en·vi·zh·ja) 뜻풀이
//  → 각 단어에 그 단어가 등장하는 segmentId 를 붙여
//  → data/sample-01/vocabulary.json 에 저장({ terms: [{ term, segmentId, def }] }).
//
// 추출을 전체 단위로 하는 이유: 배치로 쪼개면 단어가 중복되고, segmentId 를 실제 자막에서
// 정확히 고르기 어렵다. 출력이 가벼운 추출은 한 번에, 무거운 뜻풀이만 배치+동시성으로 처리한다.
//
// 실행: node scripts/vocabulary.js [contentId]   (기본 sample-01)
// 필요: .env 의 ANTHROPIC_API_KEY, 그리고 먼저 translate.js 로 교정된 subtitles.json.

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentConfig } from './contents.js';

// ── 경로 설정 ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 대상 콘텐츠는 CLI 인자로(기본 sample-01). 예: node scripts/vocabulary.js sample-02
const CONTENT_ID = process.argv[2] || 'sample-01';
const TOPIC = contentConfig(CONTENT_ID).topic;
const DATA_DIR = path.join(ROOT, 'data', CONTENT_ID);
const SUBTITLES_JSON = path.join(DATA_DIR, 'subtitles.json');
const VOCABULARY_JSON = path.join(DATA_DIR, 'vocabulary.json');

// ── 언어 설정(하드코딩 금지: 여기서만 관리) ───────────────────────────────
const SOURCE_LANG = 'ko';
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja'];
const LANGUAGES = [SOURCE_LANG, ...TARGET_LANGS];

// ── Claude API 설정 ────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 16000;

const MAX_TERMS = 40;     // 추출 상한(툴팁 사전이 비대해지지 않게)
const BATCH_SIZE = 12;    // 뜻풀이 단어/요청
const CONCURRENCY = 4;    // 동시 요청 수
const MAX_RETRIES = 4;    // 요청당 재시도(429/5xx/네트워크/파싱)

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[vocabulary] ${msg}`);
}

function fail(msg) {
  console.error(`\n[vocabulary] ✗ ${msg}\n`);
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

// 추출 응답 스키마: {terms:[{term, segmentId}]}
function extractSchema() {
  return {
    type: 'object',
    properties: {
      terms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            term: { type: 'string' },
            segmentId: { type: 'integer' },
          },
          required: ['term', 'segmentId'],
          additionalProperties: false,
        },
      },
    },
    required: ['terms'],
    additionalProperties: false,
  };
}

// 뜻풀이 배치 응답 스키마: {terms:[{term, def:{ko,en,vi,zh,ja}}]}
function defineBatchSchema() {
  return {
    type: 'object',
    properties: {
      terms: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            term: { type: 'string' },
            def: multilingualSchema(),
          },
          required: ['term', 'def'],
          additionalProperties: false,
        },
      },
    },
    required: ['terms'],
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
const EXTRACT_SYSTEM = `당신은 EBS 교육 영상의 한국어 자막에서, 한국어가 모국어가 아닌 학습자(다문화가정·외국인)가 어려워할 주요 단어를 골라내는 한국어 교육 전문가입니다.

영상 주제: ${TOPIC}

[작업] 입력은 전체 자막 세그먼트 배열(각 {id, ko})입니다. 자막 전체를 보고, 학습자에게 풀이가 필요한 핵심 단어를 추출하세요.
- 우선 대상: 유아 신체발달·놀이 관련 전문용어와 학습 핵심어(예: 대근육, 소근육, 발달 단계, 운동 발달, 협응, 균형감각, 감각통합, 정서 발달 등).
- 제외: 너무 쉬운 일상어(예: 아이, 엄마, 놀이터, 좋다, 많다), 조사·어미·일반 동사, 강사 이름 같은 고유명사.
- 표제어 형태로 적습니다(조사·어미를 떼고 사전 기본형으로. 예: 자막에 '대근육을'이면 term 은 '대근육').
- 같은 단어를 중복해서 넣지 마세요.
- segmentId 는 그 단어가 실제로 등장하는 세그먼트의 id 여야 합니다(여러 곳이면 가장 먼저/대표적으로 나오는 곳).
- 개수는 의미 있는 핵심어 위주로 최대 ${MAX_TERMS}개까지. 억지로 채우지 말고 정말 풀이가 필요한 것만 고르세요.

[출력] 스키마에 맞춰 {term, segmentId} 배열을 반환합니다.`;

const DEFINE_SYSTEM = `당신은 한국어 학습 어휘 사전을 만드는 다국어 전문가입니다. 한국어 단어 각각에 대해 학습자(다문화가정·외국인)를 위한 짧고 쉬운 뜻풀이를 5개 언어로 작성합니다.

영상 주제: ${TOPIC} 단어의 의미는 이 맥락에 맞게 풀이합니다.

[작업] 입력은 단어 배열입니다(각 {term, context} — context 는 그 단어가 쓰인 자막 문장으로, 의미를 정확히 잡기 위한 참고용입니다).
각 단어마다 def 를 작성하세요.
- ko: 한국어로 된 쉬운 뜻풀이(초등 수준의 평이한 한국어, 한두 문장).
- en·vi·zh(간체)·ja: 같은 뜻풀이를 해당 언어로 자연스럽게 옮긴 설명.
- 단어를 그대로 번역만 하지 말고, '무엇인지 설명'하는 뜻풀이로 작성합니다. 간결하게(한 문장 권장).
- context 문장 자체를 번역하지 마세요. 어디까지나 단어의 뜻을 풀이합니다.

[출력] 스키마에 맞춰 입력의 모든 term 에 대해 {term, def:{ko,en,vi,zh,ja}} 를 반환합니다. term 은 입력과 정확히 일치해야 합니다.`;

// ── 1) 어휘 추출(전체 자막 한 번에) ────────────────────────────────────────
async function extractTerms(segments, apiKey) {
  const input = segments.map((s) => ({ id: s.id, ko: s.text.ko }));
  log(`자막 ${segments.length}개에서 주요 단어 추출(최대 ${MAX_TERMS}개)`);

  const user =
    `다음 한국어 자막 전체에서 풀이가 필요한 주요 단어를 추출하세요.\n` +
    `입력 JSON:\n${JSON.stringify(input, null, 2)}`;

  const result = await callClaude({
    system: EXTRACT_SYSTEM,
    user,
    schema: extractSchema(),
    apiKey,
    label: '어휘 추출',
  });

  const raw = Array.isArray(result.terms) ? result.terms : [];
  const validIds = new Set(segments.map((s) => s.id));
  // id -> ko 본문(맥락 제공 및 segmentId 보정용).
  const koById = new Map(segments.map((s) => [s.id, s.text.ko]));

  // 정제: 빈 단어 제거, 중복 제거, segmentId 검증/보정.
  const seen = new Set();
  const terms = [];
  for (const t of raw) {
    const term = typeof t.term === 'string' ? t.term.trim() : '';
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;

    let segmentId = Number.isInteger(t.segmentId) ? t.segmentId : -1;
    // segmentId 가 유효하지 않거나 그 세그먼트에 단어가 없으면, 단어가 실제 등장하는
    // 첫 세그먼트로 보정한다(조사 결합으로 부분일치할 수 있어 substring 으로 탐색).
    const here = koById.get(segmentId);
    if (!validIds.has(segmentId) || (here && !here.includes(term))) {
      const found = segments.find((s) => s.text.ko.includes(term));
      if (found) {
        if (validIds.has(segmentId) && here) {
          log(`  · '${term}' segmentId ${segmentId}→${found.id} 보정(해당 세그먼트에 없음)`);
        }
        segmentId = found.id;
      } else if (!validIds.has(segmentId)) {
        log(`  · '${term}' 건너뜀(유효한 segmentId 없음, 자막에서도 못 찾음)`);
        continue;
      }
    }

    seen.add(key);
    terms.push({ term, segmentId });
    if (terms.length >= MAX_TERMS) break;
  }

  if (terms.length === 0) fail('추출된 단어가 없습니다. 프롬프트/입력을 확인하세요.');
  log(`  ✓ ${terms.length}개 단어 추출`);
  return terms;
}

// ── 2) 뜻풀이(배치+동시성) ─────────────────────────────────────────────────
async function defineTerms(terms, koById, apiKey) {
  const batches = [];
  for (let i = 0; i < terms.length; i += BATCH_SIZE) {
    batches.push(terms.slice(i, i + BATCH_SIZE));
  }
  log(`단어 ${terms.length}개 → ${batches.length}개 배치(배치당 ${BATCH_SIZE}, 동시 ${CONCURRENCY})로 5개 언어 뜻풀이`);

  let done = 0;
  const defByTerm = new Map();

  await mapPool(batches, CONCURRENCY, async (batch, idx) => {
    const input = batch.map((t) => ({
      term: t.term,
      context: koById.get(t.segmentId) || '',
    }));
    const user =
      `다음 단어들의 뜻풀이를 ${LANGUAGES.join('·')} 5개 언어로 작성하세요.\n` +
      `입력 JSON:\n${JSON.stringify(input, null, 2)}`;

    const result = await callClaude({
      system: DEFINE_SYSTEM,
      user,
      schema: defineBatchSchema(),
      apiKey,
      label: `뜻풀이 배치 ${idx + 1}/${batches.length}`,
    });

    const got = new Map((Array.isArray(result.terms) ? result.terms : []).map((t) => [t.term, t]));
    for (const t of batch) {
      const r = got.get(t.term);
      if (!r || !r.def) throw new Error(`뜻풀이 배치 ${idx + 1}: '${t.term}' 응답 누락`);
      for (const lang of LANGUAGES) {
        if (typeof r.def[lang] !== 'string' || !r.def[lang].trim()) {
          throw new Error(`뜻풀이 배치 ${idx + 1}: '${t.term}' 의 '${lang}' 누락/빈값`);
        }
      }
      defByTerm.set(t.term, r.def);
    }

    done += batch.length;
    log(`  ✓ 뜻풀이 배치 ${idx + 1}/${batches.length} 완료(누적 ${done}/${terms.length})`);
  });

  // 추출 순서를 유지하되, 툴팁 사전이 읽기 순서를 따르도록 segmentId 오름차순 정렬.
  return terms
    .map((t) => {
      const def = {};
      const src = defByTerm.get(t.term);
      for (const lang of LANGUAGES) def[lang] = src[lang].trim();
      return { term: t.term, segmentId: t.segmentId, def };
    })
    .sort((a, b) => a.segmentId - b.segmentId || a.term.localeCompare(b.term));
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  log(`대상 콘텐츠: ${CONTENT_ID}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) fail('.env 에 ANTHROPIC_API_KEY 가 비어 있습니다.');
  if (!existsSync(SUBTITLES_JSON)) {
    fail(`자막 파일을 찾을 수 없습니다: ${path.relative(ROOT, SUBTITLES_JSON)} (먼저 translate.js 를 실행하세요)`);
  }

  const subtitles = JSON.parse(await readFile(SUBTITLES_JSON, 'utf8'));
  const segments = Array.isArray(subtitles.segments) ? subtitles.segments : [];
  if (segments.length === 0) fail('subtitles.json 에 세그먼트가 없습니다.');
  // 교정된 한국어가 있어야 한다(translate.js 선행 확인).
  if (segments.some((s) => typeof s.text?.ko !== 'string' || !s.text.ko.trim())) {
    fail('일부 세그먼트에 한국어(ko) 텍스트가 없습니다. translate.js 를 먼저 실행하세요.');
  }
  const koById = new Map(segments.map((s) => [s.id, s.text.ko]));

  // 1) 어휘 추출
  const terms = await extractTerms(segments, apiKey);

  // 2) 5개 언어 뜻풀이
  const defined = await defineTerms(terms, koById, apiKey);

  // 3) 저장
  await writeJson(VOCABULARY_JSON, { terms: defined });
  log(`✓ 저장: ${path.relative(ROOT, VOCABULARY_JSON)} (단어 ${defined.length}개 × ${LANGUAGES.length}개 언어)`);
  log(`완료.`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
