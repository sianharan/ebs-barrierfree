// ④ 의미 검색 데모 — /pipeline 처리 흐름 아래.
//
// 이 섹션이 하려는 말은 하나다: 단어가 겹치지 않아도 뜻이 통하면 찾아낸다.
// 그래서 예시 질의를 일부러 제목과 낱말이 겹치지 않게 골랐고, 그중 둘은 아예 다른 언어다
// (베트남어·영어 질의 → 한국어 콘텐츠). 낱말 대조로는 절대 안 걸리는 조합이라야 증명이 된다.
//
// 상단 바의 SemanticSearch 와 컴포넌트를 공유하지 않는다. 그쪽은 떠 있는 패널(absolute·
// 바깥 클릭 닫기) 전용이고 결과를 밖으로 내주지 않는데, 여기서는 결과가 항상 보여야 하고
// 산점도도 같은 결과를 받아야 한다. 대신 호출과 관련도 문턱은 lib/search.js 로 공유한다 —
// 헤더와 데모가 다른 결과를 보이면 이 화면의 설명 자체가 틀린 말이 된다.
//
// 콘텐츠가 3개뿐이라 검색창 하나만 두면 화면이 휑하다. 예시 칩으로 클릭 한 번에 질의를
// 갈아 끼우게 해서, 질의가 바뀌면 순위와 거리가 함께 움직이는 걸 보여준다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSettings, displayLangsFor, LANGUAGES } from '../lib/settings.jsx';
import { useRouter } from '../lib/router.jsx';
import { CATALOG_LIST, getContentMeta } from '../lib/catalog.js';
import { RELEVANCE_MIN, searchContents } from '../lib/search.js';
import { t } from '../lib/i18n.js';
import SimilarityScatter from './SimilarityScatter.jsx';

// 예시 질의. 제목·설명과 낱말이 겹치지 않게 고른 것이라 번역하지 않는다 —
// 이 문장들이 '어느 언어로 물어도 통한다'는 증거 자체이기 때문이다.
const EXAMPLES = [
  { lang: 'ko', query: '아이가 뛰어노는 걸 좋아해요' },
  { lang: 'vi', query: 'Dạy con về cơ thể của mình' },
  { lang: 'en', query: 'what does real play mean for children?' },
];

const langLabel = (code) => LANGUAGES.find((l) => l.code === code)?.label ?? code;

function SearchIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-brand-deepblue"
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

export default function SemanticSearchDemo() {
  const { myLang, displayMode } = useSettings();
  const { goDetail } = useRouter();
  const displayLangs = displayLangsFor(displayMode, myLang);
  const [primary, ...secondary] = displayLangs;

  const [query, setQuery] = useState(EXAMPLES[0].query);
  const [asked, setAsked] = useState(EXAMPLES[0].query); // 지금 화면의 결과를 만든 질의
  const [status, setStatus] = useState('loading'); // loading | done | error
  const [results, setResults] = useState([]);
  const abortRef = useRef(null);

  const run = useCallback(async (raw) => {
    const q = raw.trim();
    if (!q) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAsked(q);
    setStatus('loading');
    try {
      setResults(await searchContents(q, { signal: controller.signal }));
      setStatus('done');
    } catch (err) {
      if (err?.name === 'AbortError') return; // 새 검색으로 교체됨 — 무시
      setResults([]);
      setStatus('error');
    }
  }, []);

  // 페이지에 들어오자마자 기본 질의로 한 번 돌린다 — 빈 화면으로 시작하면
  // 무엇을 보여주는 섹션인지 읽는 사람이 알 수 없다.
  useEffect(() => {
    run(EXAMPLES[0].query);
    return () => abortRef.current?.abort();
  }, [run]);

  // 관련도 문턱 위만 결과로 인정(헤더 검색과 같은 기준). 서버가 이미 내림차순으로 준다.
  const relevant = results.filter((r) => r.score >= RELEVANCE_MIN);
  const topId = relevant[0]?.contentId;

  // 산점도는 결과에 안 걸린 콘텐츠까지 전부 그린다 — 무엇이 멀리 있는지도 정보다.
  // 점수 순이 아니라 카탈로그 순으로 번호를 매겨야 질의가 바뀌어도 번호가 안 흔들린다.
  const points = CATALOG_LIST.map((c, i) => ({
    contentId: c.id,
    n: i + 1,
    score: results.find((r) => r.contentId === c.id)?.score ?? 0,
    isTop: c.id === topId,
  }));

  const numberOf = (contentId) => points.find((p) => p.contentId === contentId)?.n;

  return (
    <section className="mt-8" aria-labelledby="search-demo-title">
      <h2 id="search-demo-title" className="font-title text-xl text-logo-navy md:text-2xl">
        {t('pipeline.search.title', myLang)}
      </h2>
      <p className="mt-1 text-sm text-ink/70">{t('pipeline.search.hint', myLang)}</p>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        {/* 포커스 링은 input 이 아니라 감싼 label 에 준다. input 은 focus:outline-none 이라
            그대로 두면 키보드로 왔을 때 어디에 있는지 표시가 사라진다(WCAG 2.4.7). */}
        <label className="flex min-h-[44px] flex-1 basis-56 items-center gap-2 rounded-full border border-ink/15 bg-white pl-3 pr-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-deepblue">
          <SearchIcon />
          <span className="sr-only">{t('nav.search', myLang)}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder', myLang)}
            className="min-h-[44px] w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="min-h-[44px] shrink-0 rounded-full bg-brand-deepblue px-5 text-sm font-medium text-white transition-colors hover:bg-brand-deepblue/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue"
        >
          {t('pipeline.search.submit', myLang)}
        </button>
      </form>

      {/* 예시 칩 — 언어 표기를 함께 달아, 다른 언어로 물어도 걸린다는 걸 누르기 전에 알 수 있게. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink/50">{t('pipeline.search.examples', myLang)}</span>
        {EXAMPLES.map((ex) => {
          const active = asked === ex.query;
          return (
            <button
              key={ex.query}
              type="button"
              onClick={() => {
                setQuery(ex.query);
                run(ex.query);
              }}
              aria-pressed={active}
              className={`min-h-[36px] rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue ${
                active
                  ? 'border-brand-deepblue bg-brand-deepblue text-white'
                  : 'border-ink/15 bg-white text-ink/75 hover:bg-brand-blue/10'
              }`}
            >
              <span className={active ? 'text-white/70' : 'text-ink/45'}>{langLabel(ex.lang)}</span>
              <span aria-hidden="true" className={active ? 'px-1 text-white/40' : 'px-1 text-ink/25'}>
                ·
              </span>
              {ex.query}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
        {/* 산점도 — 모바일에서는 결과보다 위. 이 섹션이 무슨 말을 하는지 한눈에 보여주는 쪽이다. */}
        <div className="order-1 rounded-xl border border-ink/10 bg-white/70 p-4 shadow-sm md:order-2">
          <SimilarityScatter
            items={points}
            queryLabel={t('pipeline.search.queryPoint', myLang)}
            alt={t('pipeline.search.plotAlt', myLang)}
          />
          <p className="mt-2 text-center text-[11px] leading-snug text-ink/45">
            {t('pipeline.search.plotHint', myLang)}
          </p>
        </div>

        {/* 결과 — 상태 문구는 헤더 검색과 같은 것을 쓴다. */}
        <div className="order-2 md:order-1">
          {status === 'loading' && (
            <p className="rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink/60">
              {t('search.searching', myLang)}
            </p>
          )}

          {status === 'error' && (
            <p className="rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink/70">
              {t('search.error', myLang)}
            </p>
          )}

          {status === 'done' && relevant.length === 0 && (
            <p className="rounded-xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink/70">
              {t('search.noResults', myLang)}
            </p>
          )}

          {status === 'done' && relevant.length > 0 && (
            <ul className="flex flex-col gap-2">
              {relevant.map((r) => {
                const meta = getContentMeta(r.contentId);
                const titlePrimary = meta?.title?.[primary] ?? r.title;
                const isTop = r.contentId === topId;
                return (
                  <li key={r.contentId}>
                    <button
                      type="button"
                      onClick={() => goDetail(r.contentId)}
                      className={`flex w-full flex-col gap-1 rounded-xl border bg-white/70 px-4 py-3 text-left shadow-sm transition-colors hover:bg-brand-blue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue ${
                        isTop ? 'border-brand-deepblue/40' : 'border-ink/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 items-start gap-2">
                          {/* 산점도의 점 번호와 같은 번호 — 카드와 점을 눈으로 잇는 유일한 끈이다. */}
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                              isTop ? 'bg-brand-deepblue text-white' : 'bg-ink/10 text-ink/60'
                            }`}
                            aria-hidden="true"
                          >
                            {numberOf(r.contentId)}
                          </span>
                          <span className="font-title text-base text-logo-navy">{titlePrimary}</span>
                        </span>
                        <span className="mt-0.5 shrink-0 rounded-full bg-brand-deepblue px-2 py-0.5 text-xs font-medium text-white">
                          {(r.score * 100).toFixed(2)}%
                        </span>
                      </div>

                      {meta &&
                        secondary.map((lang) => (
                          <span key={lang} className="font-title text-sm text-ink/50">
                            {meta.title?.[lang]}
                          </span>
                        ))}

                      {/* 매칭 근거 — 헤더 검색과 같은 문구를 쓴다(인덱스는 콘텐츠당 한국어
                          제목+설명+해시태그 벡터 1개다. 자막·언어별 벡터는 없다). */}
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-snug text-ink/45">
                        <span className="font-medium text-brand-deepblue">
                          {t('search.relevance', myLang)} {r.score.toFixed(2)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{t('search.matchedOn', myLang)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
