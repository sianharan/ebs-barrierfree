// 콘텐츠별 처리 상세 — /pipeline 언어 그리드 아래. 강의마다 접이식 카드 하나(기본 접힘).
//
// 펼치면 다섯 단계(음성 인식 → 번역 → 어휘 → 더빙 → 검색 색인)의 산출물 수치를 보여준다.
// 수치는 pipelineStats.perContent 가 산출물에서 센 값이고, 색인만 data/search-index.json 을
// 동적 import 로 읽는다(searchIndexMeta — 130KB 를 메인 번들에 넣지 않기 위해).
//
// 상세 페이지에서 넘어올 때는 focusId(= /pipeline?content={id})를 받아 그 카드를 펼친 상태로
// 시작하고, 그 자리로 스크롤한 뒤 잠깐 강조한다. 없는 id 나 빈 값이면 평소대로 전부 접힌다.
//
// 접근성:
//  - 펼치기는 <button> 이라 마우스·Enter·Space 가 모두 그대로 동작한다(직접 키 처리 없음).
//  - aria-expanded 로 상태를, aria-controls 로 대상을 알린다. 접힌 패널도 DOM 에 두고
//    hidden 으로만 감춘다 — aria-controls 가 가리키는 요소는 존재해야 한다.
//  - 강조와 스크롤은 감속 설정(prefers-reduced-motion)을 존중한다.

import { useEffect, useMemo, useRef, useState } from 'react';
import LessonBadge from './LessonBadge.jsx';
import { CATALOG_LIST } from '../lib/catalog.js';
import { PIPELINE_STATS, formatNumber } from '../lib/pipelineStats.js';
import { loadSearchIndexMeta } from '../lib/searchIndexMeta.js';
import { useSettings, displayLangsFor } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

// 강조를 유지하는 시간. 눈이 자리를 찾을 만큼은 남기고, 계속 켜 두어 '선택됨' 으로 오해되지 않게 끈다.
const HIGHLIGHT_MS = 2000;

// 단계 정의를 데이터로 둔다 — 단계가 늘어도 마크업은 그대로.
// 단계명·기술명은 위 처리 흐름(PipelineFlow)과 같은 문자열을 쓴다. 같은 파이프라인을
// 총계로 한 번, 콘텐츠별로 한 번 보여주는 것이므로 이름이 어긋나면 다른 과정처럼 읽힌다.
const STAGES = [
  {
    key: 'pipeline.step.recognize',
    tech: 'Whisper',
    unit: 'pipeline.unit.segments',
    value: (c) => c.segments,
  },
  {
    key: 'pipeline.axis.translation',
    tech: 'Claude',
    unit: 'pipeline.unit.sentences',
    value: (c) => c.translations,
  },
  {
    key: 'pipeline.step.vocabulary',
    tech: 'Claude',
    unit: 'pipeline.unit.terms',
    value: (c) => c.vocabulary,
  },
  {
    key: 'pipeline.axis.dubbing',
    tech: 'OpenAI TTS',
    unit: 'pipeline.unit.files',
    value: (c) => c.dubFiles,
  },
  {
    key: 'pipeline.stage.index',
    tech: 'text-embedding-3-small',
    unit: 'pipeline.unit.vectors',
    // 아직 색인 파일을 못 읽었으면 null — '색인 없음' 과 구분해 표시한다(아래 StageRow).
    value: (c, indexMeta) => (indexMeta ? (indexMeta.vectorsByContent[c.id] ?? 0) : null),
  },
];

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-brand-deepblue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 text-brand-deepblue transition-transform duration-200 motion-reduce:transition-none ${
        expanded ? 'rotate-180' : ''
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// 단계 한 줄 — 상태 아이콘 + 단계명 + 기술 배지 + 수치.
function StageRow({ stage, stats, indexMeta, uiLang }) {
  const value = stage.value(stats, indexMeta);
  const pending = value === null; // 색인 파일을 아직 못 읽은 상태

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
      {pending ? (
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckIcon />
      )}
      <span className="text-sm font-medium text-ink">{t(stage.key, uiLang)}</span>
      <span className="rounded-full bg-brand-deepblue/10 px-2 py-0.5 text-xs font-medium text-brand-deepblue">
        {stage.tech}
      </span>
      {/* 수치는 오른쪽 끝에. 좁은 화면에서는 위 항목들이 먼저 줄바꿈되고 수치가 그 아래 우측에 붙는다. */}
      <span className="ml-auto text-sm text-ink/70">
        {pending ? '…' : `${formatNumber(value)} ${t(stage.unit, uiLang)}`}
      </span>
    </li>
  );
}

function ContentCard({ content, index, stats, indexMeta, langs, uiLang, expanded, onToggle, focused }) {
  const [primary, ...secondary] = langs;
  const panelId = `pipeline-content-panel-${content.id}`;
  const buttonId = `pipeline-content-button-${content.id}`;

  return (
    <li
      // 스크롤 대상을 찾는 표식. ul 의 자식은 li 여야 하므로 감싸는 div 를 두지 않는다.
      data-content-id={content.id}
      // 강조는 링(box-shadow)으로 준다 — 레이아웃을 밀지 않아 스크롤 위치가 흔들리지 않는다.
      className={`overflow-hidden rounded-xl border border-ink/10 bg-white/70 shadow-sm transition-shadow duration-500 motion-reduce:transition-none ${
        focused ? 'ring-2 ring-brand-deepblue' : 'ring-0'
      }`}
    >
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-deepblue/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-deepblue"
        >
          <LessonBadge content={content} index={index} />
          <span className="min-w-0 flex-1">
            <span className="block font-title text-base leading-snug text-logo-navy">
              {content.title?.[primary]}
            </span>
            {/* 보조 언어 제목 — 상세 페이지 제목 바와 같은 위계(작고 옅게). */}
            {secondary.map((lang) => (
              <span key={lang} className="block text-xs leading-snug text-ink/50">
                {content.title?.[lang]}
              </span>
            ))}
          </span>
          <ChevronIcon expanded={expanded} />
        </button>
      </h3>

      {/* 접혀 있어도 DOM 에 남긴다 — aria-controls 가 가리키는 대상은 존재해야 한다. */}
      <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
        <ol className="divide-y divide-ink/10 border-t border-ink/10 px-4 py-1">
          {STAGES.map((stage) => (
            <StageRow
              key={stage.key}
              stage={stage}
              stats={stats}
              indexMeta={indexMeta}
              uiLang={uiLang}
            />
          ))}
        </ol>
      </div>
    </li>
  );
}

export default function ContentProgress({ focusId }) {
  const { myLang, displayMode } = useSettings();
  const langs = useMemo(() => displayLangsFor(displayMode, myLang), [displayMode, myLang]);

  const perContent = PIPELINE_STATS.perContent;
  const statsById = useMemo(
    () => Object.fromEntries(perContent.map((c) => [c.id, c])),
    [perContent],
  );

  // 넘겨받은 id 가 실제 콘텐츠일 때만 연다. 없는 id·빈 값이면 평소대로 전부 접힌 상태.
  const validFocusId = focusId && statsById[focusId] ? focusId : null;

  // 여러 장을 동시에 펼칠 수 있게 Set 으로 둔다 — 셋뿐이라 하나만 열리게 막을 이유가 없고,
  // 비교하며 보는 쪽이 현황판의 목적에 맞는다.
  const [openIds, setOpenIds] = useState(() => new Set(validFocusId ? [validFocusId] : []));
  const [highlighted, setHighlighted] = useState(Boolean(validFocusId));

  const listRef = useRef(null);

  // 색인 수치는 별도 청크다. 마운트 때 미리 받아 둬, 펼치는 순간에 빈 값이 보이지 않게 한다.
  const [indexMeta, setIndexMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSearchIndexMeta().then((meta) => {
      if (alive) setIndexMeta(meta);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 상세에서 넘어온 경우: 그 카드로 스크롤하고 잠깐 강조한다.
  useEffect(() => {
    if (!validFocusId) return;

    const card = listRef.current?.querySelector(`[data-content-id="${validFocusId}"]`);
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (card) {
      // scrollIntoView 를 그대로 쓰면 카드 머리가 sticky 헤더 밑으로 들어간다. 헤더 높이는
      // 언어·뷰포트에 따라 달라지므로(검색줄이 통째로 한 줄을 쓴다) 그때그때 재서 뺀다.
      const header = document.querySelector('header');
      const offset = (header?.getBoundingClientRect().height ?? 0) + 12;
      const top = window.scrollY + card.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    const timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [validFocusId]);

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="mt-8" aria-labelledby="pipeline-contents-title">
      <h2 id="pipeline-contents-title" className="font-title text-xl text-logo-navy md:text-2xl">
        {t('pipeline.contents.title', myLang)}
      </h2>
      <p className="mt-1 text-sm text-ink/70">{t('pipeline.contents.hint', myLang)}</p>

      <ul ref={listRef} className="mt-3 flex flex-col gap-3">
        {CATALOG_LIST.map((content, index) => {
          const stats = statsById[content.id];
          if (!stats) return null; // 집계에 없는 콘텐츠는 건너뛴다(카탈로그와 데이터가 어긋난 경우)
          return (
            <ContentCard
              key={content.id}
              content={content}
              index={index}
              stats={stats}
              indexMeta={indexMeta}
              langs={langs}
              uiLang={myLang}
              expanded={openIds.has(content.id)}
              onToggle={() => toggle(content.id)}
              focused={highlighted && content.id === validFocusId}
            />
          );
        })}
      </ul>
    </section>
  );
}
