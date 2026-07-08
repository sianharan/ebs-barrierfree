// scripts/build-search-index.js
// ④ 의미 기반 검색 1단계 — 검색 인덱스 생성.
//
// 콘텐츠(sample-01·02·03)의 제목+설명+해시태그를 OpenAI text-embedding-3-small 로
// 임베딩해 data/search-index.json 에 저장한다(AGENTS.md search-index 스키마).
//
// 원리(전처리): 콘텐츠 메타 → 임베딩(문장 → 숫자 배열) → 인덱스에 벡터로 저장.
//   런타임(별도): 사용자 질의 → 같은 모델로 임베딩 → 이 벡터들과 코사인 유사도 비교 →
//   가장 가까운 콘텐츠 반환. "단어 일치가 아니라 의미로 찾는다."
//
// 임베딩 대상 텍스트는 콘텐츠의 한국어(원문) 메타다. text-embedding-3-small 은 다국어라
// 런타임의 모국어 질의도 같은 의미 공간에 매핑되어 교차언어 검색이 된다.
//
// 실행: node scripts/build-search-index.js
// 필요: .env 의 OPENAI_API_KEY.

import { mkdir, readFile } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 경로 ───────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUT_FILE = path.join(DATA_DIR, 'search-index.json');

// ── 대상 콘텐츠(데이터로 관리) ─────────────────────────────────────────────
const CONTENT_IDS = ['sample-01', 'sample-02', 'sample-03'];

// ── OpenAI 임베딩 설정 ─────────────────────────────────────────────────────
const EMBED_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL = 'text-embedding-3-small';
const MAX_RETRIES = 4;

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[search-index] ${msg}`);
}
function fail(msg) {
  console.error(`\n[search-index] ✗ ${msg}\n`);
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

// ko 우선, 없으면 첫 언어 값. 문자열 다국어 필드에서 한국어 원문을 꺼낸다.
function ko(field) {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') return field.ko ?? Object.values(field)[0] ?? '';
  return '';
}

// 콘텐츠 메타 → 임베딩 입력 텍스트(제목 + 설명 + 해시태그, 한국어 원문).
function embedText(content) {
  const title = ko(content.title);
  const desc = ko(content.description);
  const tags = Array.isArray(content.hashtags) ? content.hashtags.map(ko).filter(Boolean) : [];
  return [title, desc, tags.join(', ')].filter(Boolean).join('. ');
}

// ── OpenAI 임베딩 호출 ─────────────────────────────────────────────────────
async function embed(text, apiKey, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(EMBED_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: text }),
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
      const vec = data?.data?.[0]?.embedding;
      if (!Array.isArray(vec) || vec.length === 0) {
        throw new Error(`임베딩 응답에 벡터가 없습니다: ${JSON.stringify(data).slice(0, 200)}`);
      }
      return vec;
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
  throw new Error(`${label} 임베딩 실패: ${lastErr?.message || lastErr}`);
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) fail('.env 에 OPENAI_API_KEY 가 비어 있습니다.');

  log(`대상 콘텐츠 ${CONTENT_IDS.length}개, 모델 ${EMBED_MODEL}`);
  const items = [];

  for (const id of CONTENT_IDS) {
    const file = path.join(DATA_DIR, id, 'content.json');
    if (!existsSync(file)) {
      fail(`content.json 없음: ${path.relative(ROOT, file)} (먼저 build-content.js 를 실행하세요)`);
    }
    let content;
    try {
      content = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      fail(`${id}/content.json 파싱 실패: ${err.message}`);
    }

    const text = embedText(content);
    if (!text.trim()) fail(`${id}: 임베딩할 텍스트가 비어 있습니다.`);
    log(`${id} 임베딩 중 — "${text.slice(0, 50)}${text.length > 50 ? '…' : ''}"`);

    const vec = await embed(text, apiKey, id);
    items.push({
      contentId: id,
      type: content.type || 'video',
      title: ko(content.title),
      embedding: vec,
    });
    log(`  ✓ ${id} — 차원 ${vec.length}`);
  }

  await writeJson(OUT_FILE, { model: EMBED_MODEL, items });
  log(`✓ 저장: ${path.relative(ROOT, OUT_FILE)} (콘텐츠 ${items.length}개 × ${items[0]?.embedding.length ?? 0}차원)`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
