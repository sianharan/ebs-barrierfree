// ⑤ 어휘 즉시 풀이 — 대본의 한국어 단어에 점선 밑줄 + 클릭/탭 시 모국어 뜻풀이 툴팁.
//
// - 사전 생성된 풀이(vocabulary.json)만 사용. 풀이 언어는 내 언어(lang)를 따른다.
// - 키보드 접근: 단어는 <button> 이라 Tab 포커스 + Enter/Space 로 열고, Escape·바깥 클릭·재클릭으로 닫힘.
// - 대본 줄 안에서 단어만 클릭 대상(pointer-events-auto) — 줄의 구간이동 오버레이와 충돌하지 않게.
// - 영상 자막 오버레이에는 쓰지 않는다(대본에서만). 강조는 deep blue 계열(brand-deepblue).

import { useEffect, useId, useRef, useState } from 'react';

export default function VocabularyTooltip({ term, lang }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const tipId = useId();

  const def = term.def?.[lang] ?? term.def?.ko ?? '';

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="pointer-events-auto relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        className="rounded font-medium text-brand-deepblue underline decoration-brand-deepblue decoration-dotted decoration-2 underline-offset-2 hover:bg-brand-deepblue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue"
      >
        {term.term}
      </button>

      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[260px] -translate-x-1/2 whitespace-normal rounded-lg bg-brand-deepblue px-3 py-2 text-left text-sm font-normal leading-snug text-white shadow-lg"
        >
          <span className="block font-semibold">{term.term}</span>
          <span className="mt-0.5 block text-white/90">{def}</span>
        </span>
      )}
    </span>
  );
}
