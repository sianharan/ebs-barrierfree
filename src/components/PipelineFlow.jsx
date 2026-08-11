// AI 처리 파이프라인 가로 플로우 — /pipeline 히어로 아래.
//
// 여섯 단계(오디오 추출 → 음성 인식 → 자막 교정 → 다국어 번역 → 어휘 추출 → 더빙 생성)를
// 순서대로 늘어놓고 화살표로 잇는다. 각 칸은 아이콘 + 단계명 + 기술명 + 실제 수치.
//
// 수치는 pipelineStats 가 산출물에서 센 값이다(하드코딩 금지) — 콘텐츠·언어가 늘면 따라 올라간다.
// 같은 수가 두 번 나오는 건 사실 그대로다: 교정은 인식된 세그먼트 전부를 손보고,
// 더빙은 번역된 문장마다 mp3 를 하나씩 만든다.
//
// 접근성:
//  - 순서가 의미이므로 ol/li. 화살표는 장식이라 aria-hidden(순서는 목록 구조가 이미 전달한다).
//  - 좁은 화면에서 가로 스크롤되는 영역은 키보드로도 스크롤할 수 있어야 한다(WCAG 2.1.1) —
//    tabindex=0 + role=group + aria-label 을 주고 포커스 링을 남긴다.
//  - 화살표를 li 안에 넣어 목록 항목 수가 6개로 읽히게 한다(칸 6 + 화살표 5 = 11 이 되지 않도록).

import { PIPELINE_STATS, formatNumber } from '../lib/pipelineStats.js';
import { useSettings } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

// 아이콘은 상단 바 GlobeIcon 과 같은 규격(24 그리드·stroke 2·aria-hidden).
const iconProps = {
  className: 'h-6 w-6 text-brand-deepblue',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// 영상에서 소리를 떼어낸다 — 필름 조각.
function FilmIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5v14M17 5v14M3 12h4M17 12h4" />
    </svg>
  );
}

// 말을 글로 받아 적는다 — 마이크.
function MicIcon() {
  return (
    <svg {...iconProps}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

// 받아쓴 자막을 손본다 — 문서 + 확인 표시.
function CheckDocIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M9 14l2 2 4-4" />
    </svg>
  );
}

// 한 문장을 여러 언어로 — 말풍선 둘.
function TranslateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8l-3 3v-3a2 2 0 0 1-2-2z" />
      <path d="M17 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2v3l-3-3h-3" />
    </svg>
  );
}

// 어려운 말을 골라 풀이한다 — 책.
function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M8 7h7M8 11h5" />
    </svg>
  );
}

// 번역문을 목소리로 — 스피커 + 음파.
function SpeakerIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

// 칸 사이 이음 — 장식이라 aria-hidden(순서는 목록 구조가 전달한다).
function ArrowIcon() {
  return (
    <svg
      className="mx-1 h-5 w-5 shrink-0 text-ink/30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

// 단계 정의를 데이터로 둔다 — 단계가 늘어도 마크업은 그대로.
// value 는 stats 에서 꺼내는 함수라 집계 방식이 바뀌어도 이 표만 고치면 된다.
const STEPS = [
  { key: 'pipeline.step.extract', tech: 'ffmpeg', unit: 'pipeline.unit.minutes', Icon: FilmIcon, value: (s) => s.durationMinutes },
  { key: 'pipeline.step.recognize', tech: 'Whisper', unit: 'pipeline.unit.segments', Icon: MicIcon, value: (s) => s.segments },
  { key: 'pipeline.step.correct', tech: 'Claude', unit: 'pipeline.unit.segments', Icon: CheckDocIcon, value: (s) => s.segments },
  { key: 'pipeline.step.translate', tech: 'Claude', unit: 'pipeline.unit.sentences', Icon: TranslateIcon, value: (s) => s.translations },
  { key: 'pipeline.step.vocabulary', tech: 'Claude', unit: 'pipeline.unit.terms', Icon: BookIcon, value: (s) => s.vocabulary },
  { key: 'pipeline.step.dub', tech: 'OpenAI TTS', unit: 'pipeline.unit.files', Icon: SpeakerIcon, value: (s) => s.dubbingFiles },
];

export default function PipelineFlow() {
  const { myLang } = useSettings();
  const stats = PIPELINE_STATS;

  return (
    <section className="mt-6" aria-labelledby="pipeline-flow-title">
      <h2 id="pipeline-flow-title" className="font-title text-xl text-logo-navy md:text-2xl">
        {t('pipeline.flow.title', myLang)}
      </h2>
      <p className="mt-1 text-sm text-ink/70">{t('pipeline.flow.hint', myLang)}</p>

      {/* 넓은 화면에서는 여섯 칸이 한 줄에 들어가고, 좁아지면 이 영역만 옆으로 스크롤된다. */}
      <div
        tabIndex={0}
        role="group"
        aria-label={t('pipeline.flow.title', myLang)}
        className="mt-3 overflow-x-auto rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue"
      >
        <ol className="flex min-w-max items-stretch py-1">
          {STEPS.map((step, i) => (
            <li key={step.key} className="flex shrink-0 items-center">
              {/* 칸 폭은 넓은 화면에서도 키우지 않는다 — 여섯 칸 + 화살표 다섯이 본문 폭(max-w-5xl)
                  안에 들어가야 데스크톱에서 마지막 칸이 잘리지 않는다(128×6 + 28×5 = 908 < 992). */}
              <div className="flex h-full w-32 flex-col items-center rounded-xl border border-ink/10 bg-white/70 px-3 py-4 text-center shadow-sm">
                <step.Icon />
                <p className="mt-2 text-sm font-medium leading-snug text-ink">
                  {t(step.key, myLang)}
                </p>
                {/* 배지와 수치는 칸 아래에 붙인다 — 단계명이 한 줄인 언어(한국어)든 두 줄인
                    언어(러시아어·인도네시아어)든 칸끼리 같은 높이에서 만나야 한 줄로 읽힌다. */}
                <div className="mt-auto flex flex-col items-center pt-2">
                  <p className="rounded-full bg-brand-deepblue/10 px-2 py-0.5 text-xs font-medium text-brand-deepblue">
                    {step.tech}
                  </p>
                  {/* 단위는 늘 제 줄에 둔다. 숫자와 한 줄에 이어 두면 단위가 긴 언어에서 줄이
                      밀리면서 숫자 위치가 칸마다 달라지고, 한국어는 '음성 파/일' 처럼
                      낱말 가운데서 끊긴다(CJK 는 아무 데서나 줄바꿈되므로). */}
                  <p className="mt-2 leading-tight">
                    <span className="block font-title text-xl text-brand-deepblue">
                      {formatNumber(step.value(stats))}
                    </span>
                    <span className="block text-xs text-ink/60">{t(step.unit, myLang)}</span>
                  </p>
                </div>
              </div>
              {i < STEPS.length - 1 && <ArrowIcon />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
