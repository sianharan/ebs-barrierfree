// ④ 의미 기반 검색 — 상단 바 검색창.
//
// 모국어로 입력 → /api/search 가 질의를 임베딩해 콘텐츠 벡터들과 코사인 유사도로 랭킹 →
// 유사도 높은 순으로 결과를 표시한다. 제목·설명은 '번역 표시 모드'(displayLangs)를 따른다.
// 결과가 없거나(관련도 낮음 포함) 유사도가 낮으면 안내 메시지를 보여준다.
//
// 키가 필요한 임베딩은 /api/search 서버리스 함수가 처리(프론트에 키 노출 금지, AGENTS.md).
// 검색은 AI 접근성 기능이므로 활성 강조·배지는 Deep blue(#21649C, brand-deepblue)로 통일.

import { useEffect, useRef, useState } from 'react';
import { useSettings, displayLangsFor } from '../lib/settings.jsx';
import { getContentMeta } from '../lib/catalog.js';
import { t } from '../lib/i18n.js';

// 이 미만이면 '의미가 통하는 결과 없음'으로 보고 안내 메시지를 띄운다(서버 MIN_SCORE 위 2차 문턱).
const RELEVANCE_MIN = 0.2;

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5 text-brand-deepblue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export default function SemanticSearch() {
  const { myLang, displayMode } = useSettings();
  const displayLangs = displayLangsFor(displayMode, myLang);
  const [primary, ...secondary] = displayLangs;

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  const boxRef = useRef(null);
  const abortRef = useRef(null);

  // 바깥 클릭/ESC 로 결과 패널 닫기.
  useEffect(() => {
    function onDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
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
  }, []);

  async function runSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setOpen(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
      const data = await res.json();
      setResults(Array.isArray(data.results) ? data.results : []);
      setStatus('done');
    } catch (err) {
      if (err?.name === 'AbortError') return; // 새 검색으로 교체됨 — 무시
      setResults([]);
      setStatus('error');
    }
  }

  // 관련도 문턱 위 결과만 노출. 그 외(빈 결과·모두 낮음)는 안내 메시지로 처리.
  const relevant = results.filter((r) => r.score >= RELEVANCE_MIN);
  const showPanel = open && (status === 'loading' || status === 'error' || status === 'done');

  return (
    <div ref={boxRef} className="relative w-full">
      <form onSubmit={runSearch} role="search" className="flex items-center">
        <label className="flex min-h-[44px] w-full items-center gap-2 rounded-full border border-ink/15 bg-white pl-3 pr-2">
          <SearchIcon />
          <span className="sr-only">{t('nav.search', myLang)}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder={t('search.placeholder', myLang)}
            className="min-h-[44px] w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
            // 브라우저 기본 검색 X 버튼은 두되, 엔터로 검색 실행.
          />
        </label>
      </form>

      {showPanel && (
        // z-50 + 불투명 흰 배경 + 강한 그림자: 영상 위에 확실히 뜨고, 뒤가 비쳐 안 읽히는 일이 없게.
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-ink/15 bg-white shadow-xl ring-1 ring-black/5">
          {status === 'loading' && (
            <p className="px-4 py-3 text-sm text-ink/60">{t('search.searching', myLang)}</p>
          )}

          {status === 'error' && (
            <p className="px-4 py-3 text-sm text-ink/70">{t('search.error', myLang)}</p>
          )}

          {status === 'done' && relevant.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink/70">{t('search.noResults', myLang)}</p>
          )}

          {status === 'done' && relevant.length > 0 && (
            <ul className="max-h-96 divide-y divide-ink/5 overflow-y-auto">
              {relevant.map((r) => {
                const meta = getContentMeta(r.contentId);
                // 제목·설명은 표시 모드(displayLangs)를 따른다. 카탈로그에 없으면 API 의 ko 제목으로 폴백.
                const titlePrimary = meta?.title?.[primary] ?? r.title;
                const pct = Math.round(r.score * 100);
                return (
                  <li key={r.contentId}>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-brand-blue/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-title text-base text-logo-navy">{titlePrimary}</span>
                        <span
                          className="mt-0.5 shrink-0 rounded-full bg-brand-deepblue px-2 py-0.5 text-xs font-medium text-white"
                          title={`${t('search.relevance', myLang)} ${pct}%`}
                        >
                          {pct}%
                        </span>
                      </div>

                      {/* 보조 언어 제목 */}
                      {meta &&
                        secondary.map((lang) => (
                          <span key={lang} className="font-title text-sm text-ink/50">
                            {meta.title?.[lang]}
                          </span>
                        ))}

                      {/* 설명 — 주 언어, 보조 언어 순 */}
                      {meta?.description?.[primary] && (
                        <span className="mt-0.5 text-sm leading-snug text-ink/80">
                          {meta.description[primary]}
                        </span>
                      )}
                      {meta &&
                        secondary.map((lang) =>
                          meta.description?.[lang] ? (
                            <span key={lang} className="text-xs leading-snug text-ink/50">
                              {meta.description[lang]}
                            </span>
                          ) : null,
                        )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
