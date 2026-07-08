// ④ 의미 검색 런타임 — Vercel 서버리스 함수.
//
// 프론트(SemanticSearch)가 { query } 를 POST 하면, 질의를 콘텐츠 인덱스와 같은 모델
// (text-embedding-3-small)로 임베딩한 뒤 search-index.json 의 콘텐츠 벡터들과 메모리에서
// 코사인 유사도를 계산해 유사도 높은 순으로 돌려준다. API 키는 서버에서만 읽고
// (process.env.OPENAI_API_KEY) 프론트에 노출하지 않는다(AGENTS.md: 키 호출은 /api 경유).
//
// "단어 일치가 아니라 의미로 찾는다" — 모국어 질의도 같은 의미 공간에 매핑되어
// 한국어 콘텐츠와 교차언어로 매칭된다.

import { readFileSync } from 'node:fs';
import { rankBySimilarity } from '../src/lib/similarity.js';

// 전처리 산출물. new URL(..., import.meta.url) 패턴은 Vercel 파일 트레이싱이
// 정적으로 감지해 번들에 포함한다(런타임 fs 로 안전하게 읽힘). 콜드스타트 1회만 로드.
const INDEX = JSON.parse(
  readFileSync(new URL('../data/search-index.json', import.meta.url), 'utf8'),
);

const EMBED_URL = 'https://api.openai.com/v1/embeddings';
const MIN_SCORE = 0.15; // 이 미만은 노이즈로 보고 제외(관련도 판단은 프론트가 한 번 더).
const LIMIT = 8;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY 가 설정되지 않았습니다.' });
  }

  // Vercel Node 함수는 application/json 본문을 자동 파싱(req.body). 문자열로 올 때를 대비해 보강.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const query = (body?.query ?? '').toString().trim();
  if (!query) {
    return res.status(400).json({ error: 'query(문자열)가 필요합니다.' });
  }

  try {
    // 질의 임베딩 — 인덱스와 동일 모델을 써야 같은 의미 공간에 매핑된다.
    const r = await fetch(EMBED_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: INDEX.model, input: query }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'OpenAI 임베딩 요청 실패', detail });
    }

    const data = await r.json();
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      return res.status(502).json({ error: '임베딩 응답에 벡터가 없습니다.' });
    }

    // 메모리 코사인 유사도로 랭킹(embedding 은 응답에서 제거됨).
    const results = rankBySimilarity(vec, INDEX.items, { minScore: MIN_SCORE, limit: LIMIT });
    return res.status(200).json({ model: INDEX.model, query, results });
  } catch (err) {
    return res.status(500).json({ error: '검색 처리 중 오류', detail: String(err) });
  }
}
