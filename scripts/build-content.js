// scripts/build-content.js
// ④ 의미 기반 검색 1단계 — 콘텐츠 메타 생성.
//
// sample-02(2강)·sample-03(3강)의 content.json 을 생성한다.
// 제목·강사·설명·해시태그를 Claude(claude-opus-4-8)로 10개 언어
//  (ko·en·vi·zh·ja·th·ru·id·es·fr)로 번역해 data/{id}/content.json 에 저장.
// type:video. 자막·어휘·더빙은 이후 단계에서 처리한다(여기선 메타만).
//
// 실행: node scripts/build-content.js
// 필요: .env 의 ANTHROPIC_API_KEY.

import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 경로 ───────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 언어(하드코딩 금지: 여기서만 관리) ────────────────────────────────────
const SOURCE_LANG = 'ko';
const TARGET_LANGS = ['en', 'vi', 'zh', 'ja', 'th', 'ru', 'id', 'es', 'fr'];
const LANGUAGES = [SOURCE_LANG, ...TARGET_LANGS];

// 언어 코드 → 영어 표기(프롬프트용). 언어 추가 시 여기만 보강.
const LANG_NAMES = {
  ko: 'Korean', en: 'English', vi: 'Vietnamese', zh: 'Simplified Chinese',
  ja: 'Japanese', th: 'Thai', ru: 'Russian', id: 'Indonesian',
  es: 'Spanish', fr: 'French',
};

// ── 생성 대상 콘텐츠(한국어 원문) ─────────────────────────────────────────
// subject: 번역 어조/전문용어 힌트로만 쓰는 주제 설명(데이터엔 저장 안 함).
const CONTENTS = [
  {
    id: 'sample-02',
    subject: '영유아(유아)의 놀이 — 진정한 놀이의 의미와 종류. 아이를 올바르게 성장시키는 놀이 교육 강의.',
    videoUrl: 'https://ebsvod.ebs.co.kr/ebsvod/cul/2024/40049780/2m/20241014_094000_5bd1d211_m20.mp4',
    meta: {
      title: '2강 진정한 놀이란 무엇일까?',
      instructors: ['박소영', '손수예'],
      description: '아이들을 올바른 방향으로 성장시키는 진정한 놀이의 의미와 종류에 대해 이야기한다',
      hashtags: ['유아', '교육', '놀이', '신체'],
    },
  },
  {
    id: 'sample-03',
    subject: '영유아(유아)의 성교육 — 아이가 몸에 대해 바르게 배우는 첫 성교육의 중요성과 방법. 유아 성교육 강의.',
    videoUrl: 'https://ebsvod.ebs.co.kr/ebsvod/cul/2024/40049780/2m/20241021_094000_a47ed521_m20.mp4',
    meta: {
      title: '3강 우리 아이 첫 성교육',
      instructors: ['박소영', '손수예'],
      description: '아이들이 몸에 대해 바르게 배우고 성장할 수 있는 첫 성교육의 중요성과 방법에 대해 이야기한다',
      hashtags: ['유아', '성교육', '신체', '성', '유아교육'],
    },
  },
];

// ── Claude API 설정 ────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-opus-4-8';
const MAX_TOKENS = 8000;
const MAX_RETRIES = 4;

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[build-content] ${msg}`);
}
function fail(msg) {
  console.error(`\n[build-content] ✗ ${msg}\n`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// .env 를 직접 파싱(dotenv 의존성 없이). 이미 process.env 에 있으면 우선.
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

// ── 스키마 ─────────────────────────────────────────────────────────────────
function multilingualSchema() {
  const properties = {};
  for (const lang of LANGUAGES) properties[lang] = { type: 'string' };
  return { type: 'object', properties, required: [...LANGUAGES], additionalProperties: false };
}
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
function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

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
        throw Object.assign(new Error('모델이 요청을 거부했습니다(refusal).'), { fatal: true });
      }
      if (data.stop_reason === 'max_tokens') {
        throw new Error('출력이 max_tokens 로 잘렸습니다.');
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

// ── 프롬프트 ───────────────────────────────────────────────────────────────
const CONTENT_SYSTEM = `당신은 EBS 교육 영상의 메타데이터를 다국어로 번역하는 전문 번역가입니다.

한국어 원문을 ${TARGET_LANGS.map((l) => LANG_NAMES[l]).join(' · ')} 로 번역하고, 한국어(ko)는 원문 그대로 둡니다.
- 강사 이름(person name)은 번역하지 말고 각 언어 표기 관습에 맞게 음역(transliterate)합니다(로마자권은 로마자, ja는 가타카나/한자 관습, zh는 한자 표기). ko는 한글 원문 그대로 둡니다.
- 해시태그는 단어 단위로 자연스럽게 번역합니다.
- 제목과 설명은 교육적이고 자연스러운 어조로 번역합니다.
- 유아 교육 강의로서 성교육 등 민감할 수 있는 주제도 학술적·중립적으로 정확히 번역합니다.`;

// ── content.json 생성 ──────────────────────────────────────────────────────
async function buildOne(content, apiKey) {
  const { id, subject, videoUrl, meta } = content;
  log(`${id} 메타 번역(제목·강사 ${meta.instructors.length}명·설명·해시태그 ${meta.hashtags.length}개 → ${LANGUAGES.length}개 언어)`);

  const user =
    `영상 주제: ${subject}\n\n` +
    `다음 한국어 메타데이터를 ${TARGET_LANGS.join('·')} 로 번역하고, ko는 원문 그대로 두세요.\n` +
    `입력 JSON:\n${JSON.stringify(meta, null, 2)}`;

  const out = await callClaude({
    system: CONTENT_SYSTEM,
    user,
    schema: contentMetaSchema(),
    apiKey,
    label: `${id} 메타`,
  });

  // 검증 + ko 원문 강제(번역이 ko를 바꾸지 않도록 원문으로 덮어씀).
  const checkML = (obj, where) => {
    for (const lang of LANGUAGES) {
      if (typeof obj?.[lang] !== 'string' || !obj[lang].trim()) {
        throw new Error(`${id} ${where}: '${lang}' 누락/빈값`);
      }
    }
  };
  checkML(out.title, 'title');
  checkML(out.description, 'description');
  if (!Array.isArray(out.instructors) || out.instructors.length !== meta.instructors.length) {
    throw new Error(`${id} instructors 개수 불일치(${out.instructors?.length} != ${meta.instructors.length})`);
  }
  if (!Array.isArray(out.hashtags) || out.hashtags.length !== meta.hashtags.length) {
    throw new Error(`${id} hashtags 개수 불일치(${out.hashtags?.length} != ${meta.hashtags.length})`);
  }
  out.instructors.forEach((m, i) => { checkML(m, `instructors[${i}]`); m.ko = meta.instructors[i]; });
  out.hashtags.forEach((m, i) => { checkML(m, `hashtags[${i}]`); m.ko = meta.hashtags[i]; });
  out.title.ko = meta.title;
  out.description.ko = meta.description;

  const contentJson = {
    id,
    type: 'video',
    title: out.title,
    instructors: out.instructors,
    description: out.description,
    hashtags: out.hashtags,
    videoUrl,
    languages: LANGUAGES,
  };

  const file = path.join(ROOT, 'data', id, 'content.json');
  await writeJson(file, contentJson);
  log(`  ✓ 저장: ${path.relative(ROOT, file)}`);
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) fail('.env 에 ANTHROPIC_API_KEY 가 비어 있습니다.');

  log(`대상 ${CONTENTS.length}개 콘텐츠, 언어 ${LANGUAGES.length}개(${LANGUAGES.join('·')})`);
  // 콘텐츠 수가 적으니 순차 처리(레이트리밋 여유). 하나 실패해도 원인 파악이 쉽다.
  for (const c of CONTENTS) {
    await buildOne(c, apiKey);
  }
  log(`완료. 자막·어휘·더빙은 이후 단계에서 처리합니다.`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
