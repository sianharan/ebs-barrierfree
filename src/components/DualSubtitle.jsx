// ① 이중자막 오버레이 — Phase 2.
//
// 활성 세그먼트(현재 재생시간에 해당, App 이 공용 유틸로 계산해 내려줌)를
// 영상 위에 주 언어(크게) + 보조 언어(작게)로 표시한다.
//
// 설계 원칙(AGENTS.md):
// - 영상 자막은 "보여주기 전용" — 클릭 타깃 없음. 루트에 pointer-events-none 로 클릭을 통과시키고,
//   보조기술에는 숨긴다(접근 가능한 텍스트/상호작용은 대본 패널이 담당).
// - 저시력 배려로 큰 글씨 + 반투명 배경으로 대비 확보. 표시 언어는 langs 로 주입(하드코딩 금지).

import { memo } from 'react';

function DualSubtitle({ segment, langs = ['ko', 'vi'] }) {
  if (!segment) return null;

  const text = segment.text || {};
  const [primaryLang, ...secondaryLangs] = langs;

  return (
    // 컨트롤 바를 가리지 않도록 아래쪽 여백(pb)으로 띄우고, 클릭은 통과(pointer-events-none).
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

export default memo(DualSubtitle);
