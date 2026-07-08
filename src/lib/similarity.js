// ④ 의미 검색 — 코사인 유사도 계산(메모리).
//
// 콘텐츠가 소수라 벡터 DB 없이 메모리에서 유사도를 계산한다(AGENTS.md ④).
// 프론트(SemanticSearch)와 서버리스 함수(api/search.js)가 같은 모듈을 공유해
// 랭킹 규칙을 한 곳에서 관리한다. 브라우저·Node 양쪽에서 도는 순수 함수만 둔다.
//
// text-embedding-3-small 벡터는 단위 벡터로 정규화돼 나오지만(코사인 = 내적),
// 인덱스가 다른 방식으로 만들어져도 안전하도록 크기까지 나눠 정식으로 계산한다.

export function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

export function magnitude(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

// 두 벡터의 코사인 유사도(-1~1). 빈 벡터·0벡터는 0으로 처리(NaN 방지).
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const denom = magnitude(a) * magnitude(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

// 질의 벡터를 인덱스 항목(items[].embedding)들과 비교해 유사도 내림차순으로 반환.
// 각 결과에 score 를 붙이고, 무거운 embedding 배열은 응답에서 제거한다.
//  - minScore: 이 미만은 노이즈로 보고 제외.
//  - limit: 상위 몇 개까지.
export function rankBySimilarity(queryVec, items, { minScore = 0, limit = Infinity } = {}) {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryVec, item.embedding) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ embedding, ...rest }) => rest);
}
