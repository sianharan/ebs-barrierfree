// ⑤ 어휘 즉시 풀이 — 대본의 한국어 단어에 점선 밑줄 + 호버/클릭 시 모국어 뜻풀이 툴팁.
//
// - 사전 생성된 풀이(vocabulary.json)만 사용. 풀이 언어는 내 언어(lang)를 따른다.
// - 발견성: 옅은 deep blue 배경 틴트 + 점선(dashed) 밑줄 + cursor:help 로 "누를 게 있다"를 알린다.
//   (강조는 deep blue 계열 — AI 기능 활성색. 본문 리듬을 깨지 않게 틴트는 아주 옅게.)
// - 열림 규칙: 마우스 호버 = 미리보기(떼면 닫힘) / 클릭·탭 = 고정(pinned, 다시 누르면 닫힘) /
//   키보드 포커스 = 열림. Escape·바깥 클릭으로 항상 닫힌다.
// - 키보드 접근: 단어는 <button> 이라 Tab 포커스 + Enter/Space 로 열고 닫는다.
// - 대본 줄 안에서 단어만 클릭 대상(pointer-events-auto) — 줄의 구간이동 오버레이와 충돌하지 않게.
//   툴팁 자체는 pointer-events-none — 말풍선 위를 지날 때 깜빡이지 않게.
// - 위치: 대본 패널이 스크롤 컨테이너라 말풍선이 잘릴 수 있다. [data-vocab-bounds] 를 경계로
//   위 공간이 모자라면 아래로 뒤집고(flip), 좌우로 넘치면 안쪽으로 밀어(shift) 넣는다.
// - 영상 자막 오버레이에는 쓰지 않는다(대본에서만).

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

const GAP = 8; // 단어와 말풍선 사이 간격 + 경계 여백(px)

export default function VocabularyTooltip({ term, lang }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // 클릭으로 고정 — 마우스를 떼도 유지
  const [pos, setPos] = useState({ placement: 'top', shift: 0 });
  const wrapRef = useRef(null);
  const tipRef = useRef(null);
  const tipId = useId();

  const def = term.def?.[lang] ?? term.def?.ko ?? '';

  const close = () => {
    setOpen(false);
    setPinned(false);
  };

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 열릴 때 한 번 재보정 — 경계(대본 패널) 밖으로 잘리지 않게 뒤집기/밀어넣기.
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    const tip = tipRef.current;
    if (!wrap || !tip) return;

    const bounds = wrap.closest('[data-vocab-bounds]');
    const b = bounds ? bounds.getBoundingClientRect() : null;
    const w = wrap.getBoundingClientRect();
    const t = tip.getBoundingClientRect(); // translate 는 크기에 영향 없음 — 폭·높이는 그대로 신뢰

    const top = b ? b.top : 0;
    const left = b ? b.left : 0;
    const right = b ? b.right : window.innerWidth;

    const placement = w.top - t.height - GAP < top ? 'bottom' : 'top';

    const center = w.left + w.width / 2;
    const half = t.width / 2;
    let shift = 0;
    if (center - half < left + GAP) shift = left + GAP - (center - half);
    else if (center + half > right - GAP) shift = right - GAP - (center + half);

    setPos({ placement, shift });
  }, [open, def]);

  return (
    <span
      ref={wrapRef}
      // data-vocab-open: 대본 줄(li)이 이 표시를 보고 자기 z-index 를 올린다(Transcript).
      // 줄끼리는 position:relative·z-auto 라 DOM 순서대로 쌓여, 안 올리면 말풍선이 아랫줄 글자에 덮인다.
      data-vocab-open={open ? 'true' : undefined}
      className="pointer-events-auto relative inline-block"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() =>
          setPinned((p) => {
            const next = !p;
            setOpen(next);
            return next;
          })
        }
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!pinned) setOpen(false);
        }}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        className={`cursor-help rounded-[4px] border-b-2 border-dashed px-[0.12em] font-medium text-brand-deepblue transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-deepblue ${
          open
            ? 'border-brand-deepblue bg-brand-deepblue/20'
            : 'border-brand-deepblue/60 bg-brand-deepblue/[0.08] hover:border-brand-deepblue hover:bg-brand-deepblue/20'
        }`}
      >
        {term.term}
      </button>

      {open && (
        <span
          ref={tipRef}
          id={tipId}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${pos.shift}px))` }}
          className={`pointer-events-none absolute left-1/2 z-30 w-max max-w-[260px] whitespace-normal rounded-lg bg-brand-deepblue px-3 py-2 text-left text-sm font-normal leading-snug text-white shadow-lg ${
            pos.placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          <span className="block font-semibold">{term.term}</span>
          <span className="mt-0.5 block text-white/90">{def}</span>
        </span>
      )}
    </span>
  );
}
