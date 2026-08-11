// ④ 의미 검색 호출 — 상단 바 검색창(SemanticSearch)과 /pipeline 데모(SemanticSearchDemo)가 공유한다.
//
// 두 화면이 같은 질의에 다른 결과를 보이면 안 된다. 특히 데모는 "무엇이 왜 걸렸는지"를
// 설명하는 화면이라, 헤더 검색과 문턱이 어긋나는 순간 설명 자체가 틀린 말이 된다.
// 그래서 관련도 문턱과 호출 방식을 여기 한 곳에 둔다.
//
// 키가 필요한 임베딩은 /api/search 서버리스 함수가 처리한다(프론트에 키 노출 금지, AGENTS.md).

// 이 미만이면 '의미가 통하는 결과 없음'으로 본다(서버 MIN_SCORE 0.15 위의 2차 문턱).
export const RELEVANCE_MIN = 0.2;

// 질의를 보내고 결과 배열을 돌려준다. 실패는 예외로 던지므로 호출부가 상태를 정한다.
// AbortError 는 그대로 통과시킨다 — 새 검색으로 교체된 것이라 에러로 표시하면 안 된다.
export async function searchContents(query, { signal } = {}) {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}
