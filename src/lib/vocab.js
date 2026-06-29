// ⑤ 어휘 매칭 유틸(순수 함수) — 대본의 한국어 텍스트에 어휘 풀이를 얹기 위한 계산.

// vocabulary.json 의 terms 를 segmentId 별로 묶는다. 단어는 등록된 segmentId 의 줄에서만
// 매칭하므로(AGENTS.md), 줄을 그릴 때 이 맵에서 해당 세그먼트의 단어만 꺼내 쓴다.
export function indexVocabBySegment(terms) {
  const map = new Map();
  for (const t of terms || []) {
    if (typeof t.segmentId !== 'number') continue;
    if (!map.has(t.segmentId)) map.set(t.segmentId, []);
    map.get(t.segmentId).push(t);
  }
  return map;
}

// text 안에서 terms 의 단어 위치를 모두 찾아, 겹치지 않는 매칭 구간을 시작 순서로 반환.
// 한국어는 조사가 붙으므로(예: '대근육을') 단어가 부분 문자열로 등장 — indexOf 로 탐색한다.
// 겹칠 땐 더 앞·더 긴 매칭을 우선한다.
export function matchTerms(text, terms) {
  if (!text || !terms || terms.length === 0) return [];

  const matches = [];
  for (const t of terms) {
    const term = t.term;
    if (!term) continue;
    let idx = text.indexOf(term);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + term.length, term: t });
      idx = text.indexOf(term, idx + term.length);
    }
  }

  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const chosen = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      chosen.push(m);
      lastEnd = m.end;
    }
  }
  return chosen;
}
