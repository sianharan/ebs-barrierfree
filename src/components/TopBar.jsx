// 전역 상단 바 — ②번역 레이어 컨트롤 2개.
//
// AGENTS.md UX: '번역 표시'(자주 바꾸는 보기 방식)와 '내 언어'(거의 안 바꾸는 정체성)를 분리 배치.
//  - 번역 표시: 세그먼트 토글(한국어만·함께·모국어만). 활성 = Deep blue(#21649C, brand-deepblue).
//  - 내 언어: 지구본 드롭다운(ko/en/vi/zh/ja).
//
// 검색(④)·AI 도구 버튼은 이후 단계에서 이 바에 더한다.

import { useSettings, LANGUAGES, DISPLAY_MODES } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

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

  return (
    <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="font-title text-xl text-logo-navy">EBS 배리어프리</span>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* 번역 표시 모드 (세그먼트 토글) — 라벨은 내 언어 기준 t() */}
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-ink/60 sm:inline">
              {t('nav.translateDisplay', myLang)}
            </span>
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
