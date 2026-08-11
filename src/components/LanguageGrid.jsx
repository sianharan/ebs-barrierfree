// 언어별 처리 현황 그리드 — /pipeline 통계 카드 아래.
//
// LANGUAGES 순서 그대로 언어마다 카드 하나. 수치는 pipelineStats.perLanguage 가 산출물에서
// 센 값이다(하드코딩 금지) — 언어를 늘리면 카드도 따라 늘어난다.
//
// 카드 안에서 **번역과 더빙을 따로** 적는다. 배지 하나에 '완료' 로 뭉치면 무엇이 완료인지
// 카드가 답하지 못한다. 특히 원본 한국어는 번역이 완료가 아니라 애초에 대상이 아니고(원문),
// 더빙은 없는 게 정상이다(원음을 그대로 쓴다) — 이걸 '미완료' 로 읽히게 하면 안 된다.
//
// 원본 카드를 구분하는 신호를 셋 겹친다 — 색만으로 구분하지 않기 위해(WCAG 1.4.1):
//  1) 배지 라벨('원본' vs '완료')  2) 아이콘 모양(체크 vs 대시)  3) 값 문구('원문'·'없음 · 원음 사용')
// 카드 배경·테두리도 원본만 다르게 해 그리드에서 한눈에 튀게 한다(네 번째 신호, 색은 보조).
//
// 더빙 없음에 X 를 쓰지 않는다. 실패가 아니라 해당 없음이다.

import { PIPELINE_STATS, formatNumber } from '../lib/pipelineStats.js';
import { useSettings } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

// 상태 아이콘 — 본문(text-xs)과 같은 줄에 서므로 h-3.5. 뜻은 옆 문구가 전달하니 aria-hidden.
const statusIconProps = {
  className: 'mt-0.5 h-3.5 w-3.5 shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '3',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

function CheckIcon() {
  return (
    <svg {...statusIconProps}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

// 해당 없음 — 대시. 실패(X)와 구분되어야 한다.
function DashIcon() {
  return (
    <svg {...statusIconProps}>
      <path d="M6 12h12" />
    </svg>
  );
}

// 한 축(번역·더빙)의 상태 한 줄. 라벨과 값을 세로로 쌓는다 — 좌우로 붙이면 단위가 긴
// 언어(러시아어 сегментов·인도네시아어 berkas audio)에서 값이 눌린다.
function AxisRow({ label, done, text }) {
  return (
    <div>
      <dt className="text-ink/60">{label}</dt>
      <dd
        className={`mt-0.5 flex items-start gap-1 font-medium ${
          done ? 'text-brand-deepblue' : 'text-ink/50'
        }`}
      >
        {done ? <CheckIcon /> : <DashIcon />}
        <span className="leading-snug">{text}</span>
      </dd>
    </div>
  );
}

function LanguageCard({ lang, uiLang }) {
  const doneLabel = t('pipeline.langs.done', uiLang);
  const segmentUnit = t('pipeline.unit.segments', uiLang);

  // 번역 축 — 원본은 '완료' 가 아니라 '원문' 이다. 세그먼트 수는 어느 쪽이든 실제 값.
  const translationText = `${
    lang.isSource ? t('pipeline.langs.original', uiLang) : doneLabel
  } · ${formatNumber(lang.segments)} ${segmentUnit}`;

  // 더빙 축 — 파일이 0 이면 '없음 · 원음 사용'. 0 은 데이터에서 나온 값이다(dubByLang 에 키가 없다).
  const dubbingText = lang.hasDub
    ? `${doneLabel} · ${formatNumber(lang.dubFiles)} ${t('pipeline.unit.files', uiLang)}`
    : t('pipeline.langs.noDub', uiLang);

  return (
    <li
      className={`flex flex-col rounded-xl border p-3 shadow-sm ${
        lang.isSource ? 'border-logo-navy/25 bg-logo-navy/5' : 'border-ink/10 bg-white/70'
      }`}
    >
      {/* 이름 영역에 두 줄 분량의 최소 높이를 준다(text-sm·leading-snug 두 줄 = 2.375rem).
          'Bahasa Indonesia' 는 카드 폭에서 두 줄이 되는데, 그대로 두면 그 카드만 구분선과
          아래 번역·더빙 줄이 밀려 같은 행의 옆 카드와 어긋난다 — 열을 훑는 눈에는 어긋난
          한 칸이 먼저 걸린다(PipelineFlow 에서 mt-auto 로 맞춘 것과 같은 이유). */}
      <div className="flex min-h-[2.375rem] items-start justify-between gap-1.5">
        {/* 언어 이름은 그 언어의 자국어 표기(LANGUAGES.label) — 자기 언어를 찾는 사람 기준. */}
        <p className="font-title text-sm leading-snug text-logo-navy">{lang.label}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            lang.isSource
              ? 'bg-logo-navy/10 text-logo-navy'
              : 'bg-brand-deepblue/10 text-brand-deepblue'
          }`}
        >
          {lang.isSource ? t('pipeline.langs.source', uiLang) : doneLabel}
        </span>
      </div>
      {/* 언어 코드 — 이름이 읽히지 않는 언어에서도 카드를 짚을 수 있게. */}
      <p className="mt-0.5 text-xs uppercase tracking-wide text-ink/40">{lang.code}</p>

      <dl className="mt-3 space-y-2 border-t border-ink/10 pt-2 text-xs">
        <AxisRow label={t('pipeline.axis.translation', uiLang)} done text={translationText} />
        <AxisRow
          label={t('pipeline.axis.dubbing', uiLang)}
          done={lang.hasDub}
          text={dubbingText}
        />
      </dl>
    </li>
  );
}

export default function LanguageGrid() {
  const { myLang } = useSettings();

  return (
    <section className="mt-8" aria-labelledby="pipeline-langs-title">
      <h2 id="pipeline-langs-title" className="font-title text-xl text-logo-navy md:text-2xl">
        {t('pipeline.langs.title', myLang)}
      </h2>
      <p className="mt-1 text-sm text-ink/70">{t('pipeline.langs.hint', myLang)}</p>

      {/* 10개 카드 — 모바일 2열, 넓은 화면 5열(두 줄로 맞아떨어진다). */}
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {PIPELINE_STATS.perLanguage.map((lang) => (
          <LanguageCard key={lang.code} lang={lang} uiLang={myLang} />
        ))}
      </ul>
    </section>
  );
}
