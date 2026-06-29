// ③ 읽어주기 — 대본 줄 끝의 스피커 버튼. 누르면 그 줄을 현재 표시 언어로 읽어준다.
//
// - 엔진은 lib/tts.js(브라우저 TTS → 추후 OpenAI). 이 컴포넌트는 버튼 UI·재생 상태만 갖는다.
// - 재생 중 다시 누르면 멈춘다(토글). 다른 줄을 누르면 tts 가 이전 음성을 취소하고 시작한다.
// - 오디오 충돌 제어("한 번에 한 목소리")는 다음 단계에서 audioBus 로 얹는다 — 지금은 소리부터.
// - 강조색은 AI 기능 활성색 deep blue(brand-deepblue). 탭 타깃 44px 확보(접근성).

import { useEffect, useState } from 'react';
import { speak, cancel, isSupported } from '../lib/tts.js';

export default function ReadAloud({ text, lang = 'ko', label = '읽어주기', className = '' }) {
  const [speaking, setSpeaking] = useState(false);

  // 언마운트 시 재생 중이면 멈춘다(다른 화면으로 떠나도 소리가 남지 않게).
  useEffect(() => {
    return () => {
      if (speaking) cancel();
    };
  }, [speaking]);

  // 엔진 미지원이거나 읽을 텍스트가 없으면 버튼 자체를 숨긴다.
  if (!isSupported() || !text) return null;

  const toggle = () => {
    if (speaking) {
      cancel();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak({
      text,
      lang,
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
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
