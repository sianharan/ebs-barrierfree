// 전역 상단 바 — ②번역 레이어 컨트롤 2개.
//
// AGENTS.md UX: '번역 표시'(자주 바꾸는 보기 방식)와 '내 언어'(거의 안 바꾸는 정체성)를 분리 배치.
//  - 번역 표시: 세그먼트 토글(한국어만·함께·모국어만). 활성 = Deep blue(#21649C, brand-deepblue).
//  - 내 언어: 지구본 드롭다운(ko/en/vi/zh/ja).
//
// 검색(④)·AI 도구 버튼은 이후 단계에서 이 바에 더한다.

import { useSettings, LANGUAGES, DISPLAY_MODES } from '../lib/settings.jsx';
import { useRouter } from '../lib/router.jsx';
import { t } from '../lib/i18n.js';
import SemanticSearch from './SemanticSearch.jsx';

function GlobeIcon() {
  return (
    <svg
      className="h-5 w-5 text-brand-deepblue"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  );
}

export default function TopBar() {
  const { myLang, setMyLang, displayMode, setDisplayMode } = useSettings();
  const { goList, goPipeline, route } = useRouter();
  const onPipeline = route.name === 'pipeline';

  return (
    // sticky + z-50: backdrop-blur 가 만드는 헤더 스택 컨텍스트를 본문(영상) 위로 올려,
    // 검색 결과 드롭다운(헤더 안 absolute)이 영상 플레이어에 가리지 않게 한다.
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {/* 로고 = 리스트로 돌아가기(상세에서 홈 역할). 리스트에서 눌러도 무해. */}
        <button
          type="button"
          onClick={goList}
          className="font-title text-xl text-logo-navy transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue"
        >
          EBS 배리어프리
        </button>

        {/* AI 처리 과정(/pipeline) 진입 — 로고 옆. 현재 화면이면 채워서 위치를 알려준다. */}
        <button
          type="button"
          onClick={() => goPipeline()}
          aria-current={onPipeline ? 'page' : undefined}
          className={`min-h-[44px] rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue ${
            onPipeline
              ? 'bg-brand-deepblue text-white'
              : 'text-brand-deepblue hover:bg-brand-deepblue/10'
          }`}
        >
          {t('nav.pipeline', myLang)}
        </button>

        {/* ④ 의미 검색 — 로고·컨트롤 아래 자기 줄을 통째로 쓴다(basis-full).
            헤더 안쪽은 max-w-5xl 고정폭이라 뷰포트를 넓혀도 여유가 늘지 않는데, 번역된 컨트롤 라벨은
            언어마다 469~840px 를 차지한다(실측). 같은 줄에 두면 프랑스어·러시아어에서 검색창이
            100~200px 로 찌그러졌다 — 핵심 기능이라 폭을 양보하지 않고 줄을 나눈다.
            basis-full 이라 10개 언어 전부 같은 자리에 오고, 폭에 따라 레이아웃이 달라지지 않는다. */}
        <div className="order-last basis-full">
          <div className="max-w-2xl">
            <SemanticSearch />
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* 번역 표시 모드 (세그먼트 토글) — 라벨은 내 언어 기준 t().
              캡션 텍스트는 두지 않는다: 세 버튼('한국어만·함께·모국어만')이 이미 스스로를 설명하고,
              같은 문구가 그룹 aria-label 로 남아 스크린리더에는 그대로 읽힌다. 이 캡션이 언어에 따라
              140~160px 를 먹어 핵심 기능인 검색창을 밀어내던 것이 실측으로 확인됐다. */}
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t('nav.translateDisplay', myLang)}
              className="flex items-center rounded-full border border-ink/15 bg-white p-1"
            >
              {DISPLAY_MODES.map((m) => {
                const active = displayMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDisplayMode(m.id)}
                    className={`min-h-[44px] rounded-full px-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-deepblue text-white'
                        : 'text-ink hover:bg-ink/5'
                    }`}
                  >
                    {t(m.key, myLang)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 내 언어 (지구본 드롭다운) */}
          <label className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-ink/15 bg-white pl-3 pr-2">
            <GlobeIcon />
            <span className="sr-only">{t('nav.myLanguage', myLang)}</span>
            <select
              value={myLang}
              onChange={(e) => setMyLang(e.target.value)}
              className="min-h-[44px] bg-transparent pr-1 text-sm font-medium text-ink focus:outline-none"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
