// scripts/extend-langs.js
// 언어 10개 확장(4-1단계) — 기존 산출물에 신규 언어만 "증분" 추가.
//
// 초기 파이프라인(translate.js·vocabulary.js)은 전체를 재생성·덮어쓰며 ko를 재교정한다.
// 그대로 재실행하면 이미 검수된 en·vi·zh·ja가 다시 생성되므로, 이 스크립트는 그 helper·
// 프롬프트 방식을 재사용하되 "누락 언어만 번역하고 기존 값은 보존"하는 증분 모드로 동작한다.
//   - 대상: subtitles.json(자막) · vocabulary.json(어휘 뜻풀이) · data/ui-strings.json(UI)
//   - 신규 언어: th·ru·id·es·fr (기존 ko·en·vi·zh·ja 는 건드리지 않음)
//   - 이미 채워진 언어는 건너뜀(중복 번역 없음) → 중단돼도 재실행하면 남은 것만 처리(이어하기).
//   - 소스는 ko. 자막·UI는 ko 문장을, 어휘는 def.ko(쉬운 뜻풀이)를 번역한다.
//   - 배치·동시성·지수백오프 재시도는 translate.js 와 동일한 패턴.
//
// 실행:
//   node scripts/extend-langs.js            # 전체(ui + sample-01·02·03 자막·어휘)
//   node scripts/extend-langs.js ui         # UI 문자열만
//   node scripts/extend-langs.js sample-02  # 특정 콘텐츠 자막·어휘만
// 필요: .env 의 ANTHROPIC_API_KEY.

import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 언어 설정(하드코딩 금지: 여기서만 관리) ───────────────────────────────
const SOURCE_LANG = 'ko';
const NEW_LANGS = ['th', 'ru', 'id', 'es', 'fr'];
// 프롬프트에서 각 언어를 명확히 지칭하기 위한 이름(코드만 주면 모델이 혼동할 수 있음).
const LANG_NAMES = {
  th: '태국어(Thai)',
  ru: '러시아어(Russian)',
  id: '인도네시아어(Indonesian)',
  es: '스페인어(Spanish)',
  fr: '프랑스어(French)',
};
const CONTENTS = ['sample-01', 'sample-02', 'sample-03'];

// ── Claude API 설정 ────────────────────────────────────────────────────────
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-5'; // 비용 절감 — 자막/어휘 번역 품질에 충분.
const MAX_TOKENS = 16000;

const BATCH_SIZE = 20;   // 항목/요청
const CONCURRENCY = 4;   // 동시 요청 수
const MAX_RETRIES = 4;   // 요청당 재시도(429/5xx/네트워크/파싱)

// ── 유틸 ───────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[extend] ${msg}`);
}
function fail(msg) {
  console.error(`\n[extend] ✗ ${msg}\n`);
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// .env 직접 파싱(dotenv 없이). 이미 process.env 에 있으면 그것을 우선.
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

// ── Claude 호출(structured output) ─────────────────────────────────────────
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
          { fatal: true },
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

// ── 스키마: {results:[{key, <langs>}]} ──────────────────────────────────────
// 식별자 필드는 반드시 'key' — 'id' 는 인도네시아어 언어코드(id)와 충돌한다.
function resultsSchema(langs) {
  const itemProps = { key: { type: 'string' } };
  for (const lang of langs) itemProps[lang] = { type: 'string' };
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: itemProps,
          required: ['key', ...langs],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

// ── 범용 증분 번역 ─────────────────────────────────────────────────────────
// entries: [{ id, source, context? , missing:[lang...] }]  (missing 언어만 채운다)
// merge(id, lang, value): 결과를 원본에 반영하는 콜백.
// 같은 missing 조합끼리 묶어(그룹) 스키마를 그 언어들로 고정 → 이어하기 시에도 정확.
async function extendEntries({ entries, systemFor, unitLabel, apiKey, merge }) {
  const todo = entries.filter((e) => e.missing.length > 0);
  if (todo.length === 0) {
    log(`  · ${unitLabel}: 추가할 언어 없음(이미 10개 완비) — 건너뜀`);
    return 0;
  }

  // missing 언어 조합별 그룹화(대부분 첫 실행이면 전부 동일 조합 → 그룹 1개).
  const groups = new Map();
  for (const e of todo) {
    const key = e.missing.join(',');
    if (!groups.has(key)) groups.set(key, { langs: e.missing.slice(), entries: [] });
    groups.get(key).entries.push(e);
  }

  let filled = 0;
  for (const { langs, entries: groupEntries } of groups.values()) {
    const batches = [];
    for (let i = 0; i < groupEntries.length; i += BATCH_SIZE) {
      batches.push(groupEntries.slice(i, i + BATCH_SIZE));
    }
    log(`  ${unitLabel}: ${groupEntries.length}개 × [${langs.join('·')}] → ${batches.length}개 배치(배치당 ${BATCH_SIZE}, 동시 ${CONCURRENCY})`);

    const system = systemFor(langs);
    let done = 0;

    // 한 배치를 호출→검증까지 하고, 병합할 값 목록을 반환. 항목/언어 누락이면 throw.
    // 검증 실패도 재시도 대상이 되도록 callClaude 재시도 루프와 별개로 배치 전체를 다시 돈다
    // (모델이 이따금 한 항목의 한 언어를 빠뜨리는 것을 흡수).
    async function attemptBatch(batch, idx) {
      const input = batch.map((e) => {
        const o = { key: e.id, ko: e.source };
        if (e.context) o.context = e.context;
        return o;
      });
      const user =
        `다음 항목들의 ko 를 ${langs.map((l) => LANG_NAMES[l]).join('·')} 로 번역하세요.\n` +
        `입력 JSON:\n${JSON.stringify(input, null, 2)}`;

      const result = await callClaude({
        system,
        user,
        schema: resultsSchema(langs),
        apiKey,
        label: `${unitLabel} 배치 ${idx + 1}/${batches.length}`,
      });

      const got = new Map((Array.isArray(result.results) ? result.results : []).map((r) => [String(r.key), r]));
      const pending = [];
      for (const e of batch) {
        const r = got.get(String(e.id));
        if (!r) throw new Error(`${unitLabel} 배치 ${idx + 1}: key '${e.id}' 응답 누락`);
        for (const lang of langs) {
          if (typeof r[lang] !== 'string' || !r[lang].trim()) {
            throw new Error(`${unitLabel} 배치 ${idx + 1}: key '${e.id}' 의 '${lang}' 누락/빈값`);
          }
          pending.push({ e, lang, val: r[lang].trim() });
        }
      }
      return pending;
    }

    await mapPool(batches, CONCURRENCY, async (batch, idx) => {
      let pending;
      let lastErr;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          pending = await attemptBatch(batch, idx);
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_RETRIES) {
            const backoff = 1000 * 2 ** (attempt - 1);
            log(`    ⟳ ${unitLabel} 배치 ${idx + 1} 재시도 ${attempt}/${MAX_RETRIES - 1} (${String(err.message).slice(0, 100)}) — ${backoff}ms`);
            await sleep(backoff);
          }
        }
      }
      if (!pending) throw new Error(`${unitLabel} 배치 ${idx + 1} 실패: ${lastErr?.message || lastErr}`);

      // 전체 검증 통과 후에만 병합.
      for (const { e, lang, val } of pending) {
        merge(e, lang, val);
        filled++;
      }
      done += batch.length;
      log(`    ✓ ${unitLabel} 배치 ${idx + 1}/${batches.length} 완료(누적 ${done}/${groupEntries.length})`);
    });
  }
  return filled;
}

// 어떤 다국어 객체에서 아직 비어 있는 신규 언어를 반환.
function missingLangs(obj) {
  return NEW_LANGS.filter((l) => typeof obj?.[l] !== 'string' || !obj[l].trim());
}

// ── 프롬프트(대상별 시스템) ────────────────────────────────────────────────
function subtitleSystem(langs) {
  return `당신은 EBS 교육 영상의 다국어 자막 번역 전문가입니다.
입력은 교정 완료된 한국어(ko) 자막 세그먼트 배열입니다(각 {id, ko}). ko 를 기준으로 각 언어로 번역하세요.
- 대상 언어: ${langs.map((l) => LANG_NAMES[l]).join(', ')}.
- 강의의 구어체 어조를 유지하되 각 언어로 자연스럽게 옮기고, 전문용어(유아 발달·놀이 등)는 일관되게 사용합니다.
- 세그먼트 경계·의미·분량을 보존합니다(문장을 합치거나 나누지 마세요). 내용을 새로 추가·삭제하지 않습니다.
- ko 는 번역하지 말고 참고만 하세요. 출력에는 요청한 언어만 담습니다.
[출력] 스키마에 맞춰 입력의 모든 key 에 대해 {key, ${langs.join(', ')}} 를 반환합니다. key 는 입력과 정확히 일치해야 합니다.`;
}

function vocabSystem(langs) {
  return `당신은 한국어 학습 어휘 사전을 만드는 다국어 전문가입니다.
입력은 단어의 "쉬운 한국어 뜻풀이(ko)"와 참고 문맥(context)입니다(각 {id, ko, context}). ko 뜻풀이를 각 언어로 옮기세요.
- 대상 언어: ${langs.map((l) => LANG_NAMES[l]).join(', ')}.
- ko 는 이미 학습자(다문화가정·외국인)를 위한 쉬운 설명입니다. 같은 의미를 해당 언어로 자연스럽고 간결하게(한 문장 권장) 옮기세요.
- context 문장 자체를 번역하지 말고, 어디까지나 뜻풀이(ko)를 옮깁니다.
- key 는 단어 표제어입니다. 출력에는 요청한 언어만 담습니다.
[출력] 스키마에 맞춰 입력의 모든 key 에 대해 {key, ${langs.join(', ')}} 를 반환합니다. key 는 입력과 정확히 일치해야 합니다.`;
}

function uiSystem(langs) {
  return `당신은 교육 웹앱의 UI 문자열을 다국어로 번역하는 전문가입니다.
입력은 UI 라벨/버튼/문구의 한국어(ko)입니다(각 {id, ko}). 짧고 명확한 UI 문구로 각 언어에 옮기세요.
- 대상 언어: ${langs.map((l) => LANG_NAMES[l]).join(', ')}.
- 화면 버튼·메뉴·라벨이므로 간결하게. 문장부호를 임의로 늘리지 말고, 원문의 길이·톤을 유지합니다.
- key 는 문자열 키(예: nav.search)입니다. 출력에는 요청한 언어만 담습니다.
[출력] 스키마에 맞춰 입력의 모든 key 에 대해 {key, ${langs.join(', ')}} 를 반환합니다. key 는 입력과 정확히 일치해야 합니다.`;
}

// ── 대상별 처리 ────────────────────────────────────────────────────────────
async function extendSubtitles(contentId, apiKey) {
  const file = path.join(ROOT, 'data', contentId, 'subtitles.json');
  if (!existsSync(file)) {
    log(`  · ${contentId} subtitles.json 없음 — 건너뜀`);
    return;
  }
  const json = JSON.parse(await readFile(file, 'utf8'));
  const segments = Array.isArray(json.segments) ? json.segments : [];
  const entries = segments
    .filter((s) => typeof s.text?.ko === 'string' && s.text.ko.trim())
    .map((s) => ({ id: String(s.id), source: s.text.ko, missing: missingLangs(s.text), _seg: s }));

  const filled = await extendEntries({
    entries,
    systemFor: subtitleSystem,
    unitLabel: `${contentId} 자막`,
    apiKey,
    merge: (e, lang, val) => { e._seg.text[lang] = val; },
  });
  if (filled > 0) {
    await writeJson(file, json);
    log(`  ✓ 저장 ${path.relative(ROOT, file)} (+${filled} 값)`);
  }
}

async function extendVocabulary(contentId, apiKey) {
  const file = path.join(ROOT, 'data', contentId, 'vocabulary.json');
  if (!existsSync(file)) {
    log(`  · ${contentId} vocabulary.json 없음 — 건너뜀`);
    return;
  }
  const json = JSON.parse(await readFile(file, 'utf8'));
  const terms = Array.isArray(json.terms) ? json.terms : [];
  const entries = terms
    .filter((t) => typeof t.def?.ko === 'string' && t.def.ko.trim())
    .map((t) => ({ id: t.term, source: t.def.ko, context: t.term, missing: missingLangs(t.def), _term: t }));

  const filled = await extendEntries({
    entries,
    systemFor: vocabSystem,
    unitLabel: `${contentId} 어휘`,
    apiKey,
    merge: (e, lang, val) => { e._term.def[lang] = val; },
  });
  if (filled > 0) {
    await writeJson(file, json);
    log(`  ✓ 저장 ${path.relative(ROOT, file)} (+${filled} 값)`);
  }
}

async function extendUiStrings(apiKey) {
  const file = path.join(ROOT, 'data', 'ui-strings.json');
  if (!existsSync(file)) {
    log(`  · ui-strings.json 없음 — 건너뜀`);
    return;
  }
  const json = JSON.parse(await readFile(file, 'utf8'));
  const entries = Object.entries(json)
    .filter(([, v]) => typeof v?.ko === 'string' && v.ko.trim())
    .map(([key, v]) => ({ id: key, source: v.ko, missing: missingLangs(v), _val: v }));

  const filled = await extendEntries({
    entries,
    systemFor: uiSystem,
    unitLabel: `UI 문자열`,
    apiKey,
    merge: (e, lang, val) => { e._val[lang] = val; },
  });
  if (filled > 0) {
    await writeJson(file, json);
    log(`  ✓ 저장 ${path.relative(ROOT, file)} (+${filled} 값)`);
  }
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function run() {
  await loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) fail('.env 에 ANTHROPIC_API_KEY 가 비어 있습니다.');

  const target = (process.argv[2] || 'all').trim();
  log(`신규 언어 ${NEW_LANGS.join('·')} 증분 추가 시작 (모델 ${MODEL}, 대상: ${target})`);

  if (target === 'ui') {
    await extendUiStrings(apiKey);
  } else if (CONTENTS.includes(target)) {
    await extendSubtitles(target, apiKey);
    await extendVocabulary(target, apiKey);
  } else if (target === 'all') {
    await extendUiStrings(apiKey);
    for (const c of CONTENTS) {
      log(`── ${c} ──`);
      await extendSubtitles(c, apiKey);
      await extendVocabulary(c, apiKey);
    }
  } else {
    fail(`알 수 없는 대상: '${target}'. 가능: all | ui | ${CONTENTS.join(' | ')}`);
  }

  log(`완료.`);
}

run().catch((err) => fail(err?.stack || err?.message || String(err)));
