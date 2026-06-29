// ⑤ 대본 패널 — Phase 2 1단계: 표시 + 따라가기 + 구간 이동.
//
// subtitles.json 세그먼트를 리스트로 보여준다(번역 표시 모드에 따라 ko/모국어/둘 다).
// - 활성 줄(현재 재생시간) 하이라이트 + 패널 안에서 자동 스크롤(따라가기).
// - 줄 클릭 = 그 세그먼트 start 로 구간 이동(onSeek).
// - 각 줄에 타임코드를 작게 표시.
// 어휘 클릭(⑤ 풀이)·읽어주기(③)는 다음 단계에서 이 줄 위에 얹는다.
//
// activeId(경계에서만 바뀜)로 구동하고 memo 로 감싸, 매 timeupdate 마다 333줄을 다시
// 그리지 않는다(activeId·langs 가 바뀔 때만 재렌더).

import { memo, useEffect, useRef } from 'react';
import { formatTimecode } from '../lib/segments.js';

function Transcript({ segments, langs = ['ko', 'vi'], activeId, onSeek }) {
  const containerRef = useRef(null);

  // 활성 줄이 바뀌면 패널 내부에서 가운데로 부드럽게 스크롤(페이지는 건드리지 않는다).
  // getBoundingClientRect 차이로 계산해 offsetParent 와 무관하게 정확히 동작한다.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const el = c.querySelector('[data-active="true"]');
    if (!el) return;
    const cRect = c.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = eRect.top - cRect.top - (c.clientHeight - el.clientHeight) / 2;
    c.scrollTo({ top: c.scrollTop + delta, behavior: 'smooth' });
  }, [activeId]);

  const [primary, ...secondary] = langs;

  return (
    <div
      ref={containerRef}
      className="h-[320px] overflow-y-auto rounded-xl border border-ink/10 bg-white/70"
    >
      <ul className="divide-y divide-ink/5">
        {segments.map((seg) => {
          const active = seg.id === activeId;
          return (
            <li key={seg.id}>
              <button
                type="button"
                data-active={active ? 'true' : undefined}
                onClick={() => onSeek?.(seg.start)}
                aria-current={active ? 'true' : undefined}
                className={`flex w-full gap-3 px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-l-4 border-brand-deepblue bg-brand-deepblue/10'
                    : 'border-l-4 border-transparent hover:bg-ink/5'
                }`}
              >
                <time className="mt-0.5 shrink-0 font-sans text-xs tabular-nums text-ink/50">
                  {formatTimecode(seg.start)}
                </time>
                <div className="min-w-0">
                  <p
                    className={`font-sans leading-snug ${
                      active ? 'font-medium text-brand-deepblue' : 'text-ink'
                    }`}
                  >
                    {seg.text?.[primary]}
                  </p>
                  {secondary.map((lang) => (
                    <p key={lang} className="mt-0.5 font-sans text-sm leading-snug text-ink/60">
                      {seg.text?.[lang]}
                    </p>
                  ))}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default memo(Transcript);
