// AI 처리 과정 페이지 (/pipeline) — 전처리 산출물이 무엇을 만들어냈는지 보여주는 현황판.
//
// 히어로 → 처리 흐름(여섯 단계) → 통계 카드 4개 → 언어별 현황 → 콘텐츠별 상세 → 의미 검색 데모.
// 총계에서 축(언어)으로, 축에서 개별(콘텐츠)로 좁혀 가고, 마지막에 그 산출물을 실제로 써 본다.
// 숫자는 pipelineStats 가 실제 데이터에서 센 값이라 콘텐츠·언어가 늘면 그대로 따라 올라간다
// (하드코딩 금지). 레이아웃·색·카드 스타일은 리스트 페이지와 공유한다 — 새 화면처럼 보이지 않게.
//
// ?content={id} 로 들어오면(상세 페이지 링크) 그 콘텐츠 카드를 펼친 채 시작한다 — route 에서
// 받아 ContentProgress 로 넘기고, 스크롤·강조는 그쪽이 맡는다.

import TopBar from '../components/TopBar.jsx';
import PipelineFlow from '../components/PipelineFlow.jsx';
import LanguageGrid from '../components/LanguageGrid.jsx';
import ContentProgress from '../components/ContentProgress.jsx';
import SemanticSearchDemo from '../components/SemanticSearchDemo.jsx';
import { PIPELINE_STATS, formatNumber } from '../lib/pipelineStats.js';
import { useRouter } from '../lib/router.jsx';
import { useSettings } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

function StatCard({ value, label }) {
  return (
    <li className="rounded-xl border border-ink/10 bg-white/70 p-4 shadow-sm">
      <p className="font-title text-2xl text-brand-deepblue md:text-3xl">{formatNumber(value)}</p>
      <p className="mt-1 text-sm leading-snug text-ink/70">{label}</p>
    </li>
  );
}

export default function PipelinePage() {
  const { myLang } = useSettings();
  const { route } = useRouter();
  const stats = PIPELINE_STATS;

  // 카드 정의를 데이터로 둔다 — 이후 단계에서 항목이 늘어도 마크업은 그대로.
  const cards = [
    { key: 'pipeline.stat.segments', value: stats.segments },
    { key: 'pipeline.stat.languages', value: stats.languages },
    { key: 'pipeline.stat.vocabulary', value: stats.vocabulary },
    { key: 'pipeline.stat.dubbing', value: stats.dubbingFiles },
  ];

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <TopBar />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* 히어로 — 리스트 페이지와 같은 카드 톤(bg-white/60). 배경색은 전역 토큰 그대로. */}
        <section className="rounded-2xl bg-white/60 px-6 py-8 text-center shadow-sm">
          <p className="text-sm font-medium text-brand-deepblue">{t('nav.pipeline', myLang)}</p>
          <h1 className="mt-2 font-title text-3xl text-logo-navy md:text-4xl">
            {t('pipeline.hero.title', myLang)}
          </h1>
          <p className="mt-2 text-base text-ink/70 md:text-lg">
            {t('pipeline.hero.subtitle', myLang)}
          </p>
        </section>

        {/* 처리 흐름 — 여섯 단계를 순서대로. 아래 통계 카드는 그 결과의 총계다. */}
        <PipelineFlow />

        {/* 통계 카드 — 모바일 2×2, 넓은 화면 4열. 흐름 바로 아래에 둔다(그 결과의 총계이므로). */}
        <ul className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.key} value={card.value} label={t(card.key, myLang)} />
          ))}
        </ul>

        {/* 언어별 현황 — 위 총계를 언어 축으로 펼친 것. 번역과 더빙이 서로 다른 단계임을 여기서 드러낸다. */}
        <LanguageGrid />

        {/* 콘텐츠별 상세 — 언어 축 다음에 콘텐츠 축. 기본은 접힘(현황판이 목록으로 시작하게). */}
        <ContentProgress focusId={route.contentId} />

        {/* 의미 검색 데모 — 여기까지가 '무엇을 만들었나'라면, 이 아래는 '그래서 무엇이 되나'다.
            산출물을 실제로 검색해 보이는 유일한 대화형 구간이라 페이지 끝에 둔다. */}
        <SemanticSearchDemo />
      </main>
    </div>
  );
}
