// ⑥ 더빙 토글 — 플레이어 바(영상 위 오른쪽 위) 버튼. A방식(사전 생성 mp3).
//
// 누르면 audioBus.setDub 으로 더빙을 켜고/끈다("한 번에 한 목소리"를 위해 더빙 음성도 버스를 거친다):
//  - ON: 원음 20% 더킹 + 영상 타임코드에 맞춰 현재 구간의 mp3 자동 재생(구간 바뀌면 다음 mp3).
//  - 읽어주기(③)가 시작되면 버스가 더빙도 멈춘다(우선순위: 읽어주기 > 더빙 > 원음).
//  - 재생 상태는 버스가 진실의 원천 — dubOn 으로 버튼 활성, source==='dub' 로 "더빙 중" 배지 표시.
//
// 강조색은 AI 기능 활성색 deep blue(AGENTS.md). 해당 언어 더빙 데이터가 없으면 버튼을 숨긴다.

import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { subscribe, getState, setDub } from '../lib/audioBus.js';
import { t } from '../lib/i18n.js';

export default function DubbingControl({ segments, uiLang = 'ko' }) {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const on = state.dubOn;
  const speaking = state.source === 'dub';

  // 언마운트 시 더빙을 꺼 더킹/예약된 재생이 남지 않게 한다.
  useEffect(() => () => setDub(false), []);

  // 해당 언어의 더빙 음성이 없으면 토글을 노출하지 않는다.
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const label = t('player.dubbing', uiLang);
  const toggle = () => (on ? setDub(false) : setDub(true, segments));

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-2">
      {/* "더빙 중" 배지 — 더빙 음성이 실제로 나는 동안만 표시(시각 신호) */}
      {speaking && (
        <span
          role="status"
          className="flex items-center gap-1 rounded-full bg-brand-deepblue/90 px-2.5 py-1 text-xs font-medium text-white shadow-sm"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
          {t('player.dubbingNow', uiLang)}
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-pressed={on}
        title={label}
        className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
          on
            ? 'bg-brand-deepblue text-white'
            : 'bg-black/55 text-white/90 hover:bg-black/70'
        }`}
      >
        {/* 입 모양(더빙) 아이콘 */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-4 w-4 ${speaking ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        >
          <path d="M3 9v6h4l5 4V5L7 9H3z" />
          {on && <path d="M16 9a3 3 0 0 1 0 6" />}
        </svg>
        {label}
      </button>
    </div>
  );
}
