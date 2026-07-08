// scripts/translate-images.js
// ② 이미지 번역 — 전처리 단계.
//
// public/images/{contentId}.png (콘텐츠 대표 이미지/썸네일)를 Claude Vision 으로 분석해
//  (1) 이미지 속 한국어 텍스트 블록(제목·자막·화면 캡션 등)과 그 위치(bbox)를 추출
//      — bbox 는 0~1 로 정규화한 [x, y, width, height](좌상단 원점). 이미지 크기와 무관하게 오버레이.
//  (2) 각 블록을 5개 언어(ko·en·vi·zh·ja)로 번역
//  → data/{contentId}/images.json 에 저장({ images: [{ id, src, regions:[{bbox, text}] }] }).
//
// 런타임(TranslatableImage)은 원본 이미지 위에 번역 텍스트를 '덮을' 뿐 이미지를 재합성하지 않는다.
//
// 실행: node scripts/translate-images.js [contentId ...]
//   인자를 주면 그 콘텐츠만, 없으면 contents.js 의 전체 콘텐츠를 처리.
// 필요: .env 의 ANTHROPIC_API_KEY, public/images/{contentId}.png.

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENTS, contentConfig } from './contents.js';

// ── 경로 설정 ──────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images');

// 대상 콘텐츠: CLI 인자(여럿 가능). 없으면 contents.js 전체.
const IDS = process.argv.slice(2);
const TARGET_IDS = IDS.length > 0 ? IDS : Object.keys(CONTENTS);

// ── 언어 설정(하드코딩 금지: 여기서만 관리) ───────────────────────────────
const SOURCE_LANG = 'ko';
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja'];
const LANGUAGES = [SOURCE_LANG, ...TARGET_LANGS];

// ── Claude API 설정 ────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 8000;
const MAX_RETRIES = 4;

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[translate-images] ${msg}`);
}
function warn(msg) {
  console.warn(`[translate-images] ⚠ ${msg}`);
}
function fail(msg) {
  console.error(`\n[translate-images] ✗ ${msg}\n`);
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

function mediaTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return null;
}

// ── 스키마 ─────────────────────────────────────────────────────────────────
function multilingualSchema() {
  const properties = {};
  for (const lang of LANGUAGES) properties[lang] = { type: 'string' };
  return { type: 'object', properties, required: [...LANGUAGES], additionalProperties: false };
}

function regionsSchema() {
  return {
    type: 'object',
    properties: {
      regions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            // [x, y, width, height] 정규화 좌표. 길이 4 검증은 sanitizeRegions 에서
            // (구조화 출력 스키마는 minItems/maxItems>1 을 지원하지 않음).
            bbox: {
              type: 'array',
              items: { type: 'number' },
            },
            text: multilingualSchema(),
          },
          required: ['bbox', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['regions'],
    additionalProperties: false,
  };
}

// ── Claude 호출(Vision + structured output) ────────────────────────────────
// content 는 [{image}, {text}] 블록 배열. 429/5xx/네트워크/파싱 실패는 지수 백오프 재시도.
async function callClaude({ system, content, schema, apiKey, label }) {
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
          messages: [{ role: 'user', content }],
          output_config: { format: { type: 'json_schema', schema } },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
        }
        throw Object.assign(
          new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 500)}`),
          { fatal: true },
        );
      }

      const data = await res.json();
      if (data.stop_reason === 'refusal') {
        throw Object.assign(new Error(`모델이 요청을 거부했습니다(refusal).`), { fatal: true });
      }
      if (data.stop_reason === 'max_tokens') {
        throw new Error(`출력이 max_tokens 로 잘렸습니다.`);
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
function systemPrompt(topic) {
  return `당신은 EBS 교육 영상의 대표 이미지(방송 화면 캡처)에서, 화면에 표시된 한국어 텍스트를 찾아 위치와 함께 추출하고 번역하는 다국어 전문가입니다.

영상 주제: ${topic}

[작업] 입력은 이미지 한 장입니다. 이미지 속 '의미 있는' 한국어 텍스트 블록을 찾으세요.
- 대상: 화면 하단/상단의 제목·부제, 화면 자막·캡션, 도표 라벨 등 학습자가 읽고 이해해야 하는 텍스트.
- 제외: 방송사 로고·워터마크(예: 'EBS1', 채널 브랜드 표식)처럼 번역 의미가 없는 짧은 표식, 순수 장식 요소.
- 한 덩어리로 읽히는 제목은 여러 줄이어도 하나의 region 으로 묶으세요(예: '[1강] 우리 아이의 신체 발달과 놀이' 는 하나).

[좌표] 각 region 의 bbox 는 이미지를 0~1 로 정규화한 [x, y, width, height] 입니다.
- 원점은 이미지 좌상단. x=왼쪽에서의 거리 비율, y=위에서의 거리 비율, width·height=블록 크기 비율.
- 텍스트가 실제로 차지하는 사각형 영역을 감싸도록, 약간의 여백을 포함해 넉넉히 잡으세요.
- 모든 값은 0 이상 1 이하. x+width 와 y+height 가 1 을 넘지 않게 하세요.

[번역] 각 region 의 text 에 5개 언어를 채우세요.
- ko: 이미지에서 읽은 한국어 원문(강번호 대괄호 등 장식 기호는 빼고 자연스러운 제목 형태로 정리).
- en·vi·zh(간체)·ja: 같은 뜻을 각 언어로 자연스럽게 옮긴 번역.

[출력] 스키마에 맞춰 {regions:[{bbox, text:{ko,en,vi,zh,ja}}]} 를 반환합니다. 텍스트가 하나도 없으면 빈 배열을 반환하세요.`;
}

// ── region 정제/검증 ───────────────────────────────────────────────────────
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function sanitizeRegions(raw) {
  const regions = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const bb = Array.isArray(r.bbox) ? r.bbox.map(Number) : [];
    if (bb.length !== 4 || bb.some((n) => !Number.isFinite(n))) {
      warn(`  · bbox 형식이 올바르지 않아 region 건너뜀: ${JSON.stringify(r.bbox)}`);
      continue;
    }
    let [x, y, w, h] = bb.map(clamp01);
    // 폭/높이가 경계를 넘으면 잘라 맞춘다(오버레이가 이미지 밖으로 나가지 않게).
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
    if (w <= 0 || h <= 0) {
      warn(`  · 크기가 0 이하라 region 건너뜀: ${JSON.stringify(bb)}`);
      continue;
    }

    const text = r.text || {};
    const clean = {};
    let ok = true;
    for (const lang of LANGUAGES) {
      const v = typeof text[lang] === 'string' ? text[lang].trim() : '';
      if (!v) {
        ok = false;
        break;
      }
      clean[lang] = v;
    }
    if (!ok) {
      warn(`  · 일부 언어 번역이 비어 region 건너뜀: ${JSON.stringify(text).slice(0, 80)}`);
      continue;
    }

    regions.push({ bbox: [x, y, w, h], text: clean });
  }
  return regions;
}

// ── 콘텐츠 1개 처리 ────────────────────────────────────────────────────────
async function processContent(id, apiKey) {
  // 이미지 파일 탐색(png 우선, 없으면 다른 확장자).
  const candidates = ['png', 'jpg', 'jpeg', 'webp'].map((ext) =>
    path.join(IMAGES_DIR, `${id}.${ext}`),
  );
  const imagePath = candidates.find((p) => existsSync(p));
  if (!imagePath) {
    warn(`${id}: public/images/${id}.(png|jpg|webp) 이미지가 없어 건너뜁니다.`);
    return false;
  }

  const mediaType = mediaTypeFor(imagePath);
  if (!mediaType) {
    warn(`${id}: 지원하지 않는 이미지 형식(${path.basename(imagePath)}) — 건너뜁니다.`);
    return false;
  }

  const topic = contentConfig(id).topic;
  const base64 = (await readFile(imagePath)).toString('base64');
  log(`${id}: ${path.basename(imagePath)} 분석(Vision) → 텍스트+위치 추출·번역`);

  const result = await callClaude({
    system: systemPrompt(topic),
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      {
        type: 'text',
        text: '이 이미지 속 한국어 텍스트를 찾아 bbox 와 5개 언어 번역을 반환하세요.',
      },
    ],
    schema: regionsSchema(),
    apiKey,
    label: `${id} 이미지 분석`,
  });

  const regions = sanitizeRegions(result.regions);
  if (regions.length === 0) {
    warn(`${id}: 추출된 텍스트 region 이 없습니다(빈 images.json 저장).`);
  } else {
    log(`  ✓ ${id}: region ${regions.length}개 추출·번역`);
  }

  // src 는 앱(public 기준) 절대경로. id 는 대표 이미지 한 장이라 'thumb'.
  const out = {
    images: [
      {
        id: 'thumb',
        src: `/images/${path.basename(imagePath)}`,
        regions,
      },
    ],
  };
  const outFile = path.join(ROOT, 'data', id, 'images.json');
  await writeJson(outFile, out);
  log(`  ✓ 저장: ${path.relative(ROOT, outFile)}`);
  return true;
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) fail('.env 에 ANTHROPIC_API_KEY 가 비어 있습니다.');

  log(`대상 콘텐츠: ${TARGET_IDS.join(', ')}`);
  let done = 0;
  for (const id of TARGET_IDS) {
    if (!CONTENTS[id]) {
      warn(`${id}: contents.js 에 설정이 없어 건너뜁니다.`);
      continue;
    }
    const ok = await processContent(id, apiKey);
    if (ok) done += 1;
  }
  log(`완료 — ${done}/${TARGET_IDS.length}개 콘텐츠 처리.`);
  if (done === 0) fail('처리된 콘텐츠가 없습니다. 이미지 파일과 설정을 확인하세요.');
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
