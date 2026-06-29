// ① 이중자막 오버레이 — Phase 2 2단계.
//
// 현재 재생시간(time)에 해당하는 세그먼트를 subtitles.json 에서 찾아
// 영상 위에 1줄차=주 언어(한국어, 크게) + 그 아래 모국어(작게)로 표시한다.
//
// 설계 원칙(AGENTS.md):
// - 영상 자막은 "보여주기 전용" — 클릭 타깃 없음. 루트에 pointer-events-none 를 줘
//   영상/네이티브 컨트롤 클릭이 그대로 통과하게 한다(상호작용은 이후 대본 패널에서).
// - 저시력 배려로 큰 글씨 + 반투명 배경으로 대비 확보.
// - 표시 언어는 langs 배열로 주입(하드코딩 금지). 첫 번째가 주 언어(크게), 나머지는 아래.
//
// 효율적 세그먼트 탐색: 매 timeupdate 마다 전체(333개)를 훑지 않고, 직전 인덱스(hintRef)
// 근처에서부터 찾는다. 정상 재생은 인접 이동이라 O(1)에 가깝고, 큰 점프(시킹)일 때만
// 그 방향으로 한 번 스캔한다.

import { useRef } from 'react';

// time 이 속하는 세그먼트 인덱스를 hint 근처에서 찾는다. 없으면 -1(자막 공백 구간).
function findActiveIndex(segments, time, hint) {
  const n = segments.length;
  if (n === 0) return -1;

  const within = (idx) => time >= segments[idx].start && time < segments[idx].end;

  let i = hint;
  if (i < 0) i = 0;
  else if (i >= n) i = n - 1;

  if (within(i)) return i;

  if (time >= segments[i].end) {
    // 앞으로 탐색.
    for (let j = i + 1; j < n; j++) {
      if (time < segments[j].start) return -1; // 세그먼트 사이 공백
      if (within(j)) return j;
    }
    return -1;
  }

  // time < segments[i].start → 뒤로 탐색.
  for (let j = i - 1; j >= 0; j--) {
    if (time >= segments[j].end) return -1; // 세그먼트 사이 공백
    if (within(j)) return j;
  }
  return -1;
}

export default function DualSubtitle({ segments, time, langs = ['ko', 'vi'] }) {
  const hintRef = useRef(0);

  const idx = findActiveIndex(segments, time, hintRef.current);
  if (idx >= 0) hintRef.current = idx;

  // 공백 구간이면 아무것도 표시하지 않는다.
  if (idx < 0) return null;

  const text = segments[idx].text || {};
  const [primaryLang, ...secondaryLangs] = langs;

  return (
    // 컨트롤 바를 가리지 않도록 아래쪽 여백(pb)으로 띄우고, 클릭은 통과(pointer-events-none).
    // 보여주기 전용이므로 보조기술에는 숨긴다(접근 가능한 텍스트는 이후 대본 패널이 제공).
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-14 md:pb-16"
      aria-hidden="true"
    >
      <div className="max-w-3xl rounded-lg bg-black/70 px-4 py-2 text-center md:px-6 md:py-3">
        {text[primaryLang] && (
          <p className="font-sans text-xl font-semibold leading-snug text-white md:text-3xl">
            {text[primaryLang]}
          </p>
        )}
        {secondaryLangs.map(
          (lang) =>
            text[lang] && (
              <p
                key={lang}
                className="mt-1 font-sans text-base leading-snug text-white/85 md:text-xl"
              >
                {text[lang]}
              </p>
            )
        )}
      </div>
    </div>
  );
}
