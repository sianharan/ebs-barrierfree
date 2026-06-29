// 자막 세그먼트 공용 유틸 — 자막 오버레이(①)와 대본 패널(⑤)이 함께 쓴다.

// time 이 속하는 세그먼트 인덱스를 hint 근처에서 찾는다. 없으면 -1(자막 공백 구간).
// 매 timeupdate 마다 전체(수백 개)를 훑지 않고 직전 인덱스에서부터 탐색 — 정상 재생은
// 인접 이동이라 O(1)에 가깝고, 큰 점프(시킹)일 때만 그 방향으로 한 번 스캔한다.
export function findActiveIndex(segments, time, hint) {
  const n = segments.length;
  if (n === 0) return -1;

  const within = (idx) => time >= segments[idx].start && time < segments[idx].end;

  let i = hint;
  if (i < 0) i = 0;
  else if (i >= n) i = n - 1;

  if (within(i)) return i;

  if (time >= segments[i].end) {
    for (let j = i + 1; j < n; j++) {
      if (time < segments[j].start) return -1; // 세그먼트 사이 공백
      if (within(j)) return j;
    }
    return -1;
  }

  for (let j = i - 1; j >= 0; j--) {
    if (time >= segments[j].end) return -1; // 세그먼트 사이 공백
    if (within(j)) return j;
  }
  return -1;
}

// 초 → "m:ss" 타임코드 문자열(대본 줄 표시용).
export function formatTimecode(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
