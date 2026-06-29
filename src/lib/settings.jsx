// 전역 설정(②번역 레이어의 핵심 상태) — Context 로 앱 어디서나 구독/갱신.
//
// 두 가지 상태(AGENTS.md UX: 둘을 분리):
//  - myLang: 내 언어(거의 안 바꾸는 정체성). 기본 vi.
//  - displayMode: 번역 표시 모드(자주 바꾸는 보기 방식). 기본 'both'(함께).
//
// 번역 표시 모드 하나가 텍스트·이미지·자막 번역을 함께 제어한다(별도 토글 없음).
// 언어 코드는 하드코딩하지 않고 데이터(LANGUAGES)로 관리 — 추가 언어는 배열에만 넣으면 확장.

import { createContext, useContext, useState } from 'react';

// 지원 언어. label 은 각 언어의 자국어 표기(드롭다운 표시용).
export const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
];

// 번역 표시 모드.
export const DISPLAY_MODES = [
  { id: 'ko', label: '한국어만' },
  { id: 'both', label: '함께' },
  { id: 'mine', label: '모국어만' },
];

const DEFAULT_LANG = 'vi';
const DEFAULT_MODE = 'both';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [myLang, setMyLang] = useState(DEFAULT_LANG);
  const [displayMode, setDisplayMode] = useState(DEFAULT_MODE);
  return (
    <SettingsContext.Provider value={{ myLang, setMyLang, displayMode, setDisplayMode }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 는 SettingsProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}

// 모드 + 내 언어 → 표시할 자막 언어 배열(첫 번째가 주 언어=크게).
//  - 'ko'(한국어만):   [ko]
//  - 'mine'(모국어만): [myLang]
//  - 'both'(함께):     [ko, myLang]  (내 언어가 ko면 중복 제거 → [ko])
export function subtitleLangsFor(displayMode, myLang) {
  if (displayMode === 'ko') return ['ko'];
  if (displayMode === 'mine') return [myLang];
  return myLang === 'ko' ? ['ko'] : ['ko', myLang];
}
