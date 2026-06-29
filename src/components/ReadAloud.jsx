// ③ 읽어주기 — 대본 줄 끝의 스피커 버튼. 누르면 그 줄을 현재 표시 언어로 읽어준다.
//
// 재생은 직접 하지 않고 오디오 버스(audioBus)를 거친다("한 번에 한 목소리"):
//  - 누르면 audioBus.playReadAloud → 영상 일시정지 + 이전 읽기 취소 후 재생.
//  - 재생 상태는 버스가 진실의 원천 — 이 줄(id)이 현재 읽는 줄인지 구독해 음파 아이콘으로 표시.
//  - 재생 중 다시 누르면 멈춘다(토글).
// 강조색은 AI 기능 활성색 deep blue. 탭 타깃 44px 확보(접근성).

import { useSyncExternalStore } from 'react';
import {
  subscribe,
  getState,
  playReadAloud,
  stopReadAloud,
  isReadAloudSupported,
} from '../lib/audioBus.js';

export default function ReadAloud({ id, text, lang = 'ko', label = '읽어주기', className = '' }) {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const speaking = state.source === 'read' && state.activeId === id;

  // 엔진 미지원이거나 읽을 텍스트가 없으면 버튼 자체를 숨긴다.
  if (!isReadAloudSupported() || !text) return null;

  const toggle = () => {
    if (speaking) stopReadAloud(id);
    else playReadAloud({ id, text, lang });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={speaking}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue ${
        speaking
          ? 'bg-brand-deepblue/10 text-brand-deepblue'
          : 'text-ink/40 hover:bg-ink/5 hover:text-brand-deepblue'
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 ${speaking ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      >
        {/* 스피커 본체 */}
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {/* 음파 — 재생 중에만 표시 */}
        {speaking && <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />}
      </svg>
    </button>
  );
}
