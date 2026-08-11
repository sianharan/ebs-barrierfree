// 전역 설정(②번역 레이어의 핵심 상태) — Context 로 앱 어디서나 구독/갱신.
//
// 두 가지 상태(AGENTS.md UX: 둘을 분리):
//  - myLang: 내 언어(거의 안 바꾸는 정체성). 기본 ko.
//  - displayMode: 번역 표시 모드(자주 바꾸는 보기 방식). 기본 'both'(함께).
//
// 둘 다 사용자가 고르면 localStorage 에 저장하고 다음 방문에 복원한다(STORAGE_KEYS).
//
// 번역 표시 모드 하나가 텍스트·이미지·자막 번역을 함께 제어한다(별도 토글 없음).
// 언어 코드는 하드코딩하지 않고 데이터(LANGUAGES)로 관리 — 추가 언어는 배열에만 넣으면 확장.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// 지원 언어. label 은 각 언어의 자국어 표기(드롭다운 표시용).
export const LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'th', label: 'ภาษาไทย' },
  { code: 'ru', label: 'Русский' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

// 번역 표시 모드. 버튼 라벨은 ui-strings.json 키로(한국어 하드코딩 금지, AGENTS.md ②).
export const DISPLAY_MODES = [
  { id: 'ko', key: 'mode.ko' },
  { id: 'both', key: 'mode.both' },
  { id: 'mine', key: 'mode.mine' },
];

// 기본값은 한국어다. 이 서비스는 다문화가정이 한국어 콘텐츠를 이해하도록 돕는 것이지
// 모국어 콘텐츠로 갈음하는 게 아니므로, 첫 화면은 한국어로 열고 필요한 사람이 상단 바의
// 언어 선택으로 자기 언어를 고르게 한다.
const DEFAULT_LANG = 'ko';
const DEFAULT_MODE = 'both';

// 사용자가 고른 값은 브라우저에 남겨 새로고침·재방문에도 유지한다. 언어를 고르는 사람은
// 대체로 한국어가 어려운 사용자라, 방문마다 다시 고르게 하면 그 부담이 매번 되풀이된다.
const STORAGE_KEYS = { myLang: 'ebs-bf.myLang', displayMode: 'ebs-bf.displayMode' };

// 허용 목록은 데이터에서 뽑는다(코드 하드코딩 금지, AGENTS.md ②) — 언어를 늘리면 자동으로 따라온다.
const LANG_CODES = LANGUAGES.map((l) => l.code);
const MODE_IDS = DISPLAY_MODES.map((m) => m.id);

// 저장값은 남이 넣은 값처럼 다룬다 — 지원 목록에서 빠진 옛 코드나 손으로 고친 값이 들어와도
// 화면이 깨지지 않도록, 허용 목록에 없으면 조용히 기본값으로 돌아간다.
// localStorage 접근 자체가 막힌 환경(사생활 보호 모드 등)도 있으므로 통째로 감싼다.
function readStored(key, allowed, fallback) {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

// 저장 실패는 무시한다 — 지속은 편의이지 이번 세션 동작의 조건이 아니다.
function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 못 해도 화면은 그대로 동작한다 */
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // 첫 로드에만 읽는다(이후 출처는 state) — 저장값이 없거나 못 쓰면 기본값.
  const [myLang, setMyLangState] = useState(() =>
    readStored(STORAGE_KEYS.myLang, LANG_CODES, DEFAULT_LANG),
  );
  const [displayMode, setDisplayModeState] = useState(() =>
    readStored(STORAGE_KEYS.displayMode, MODE_IDS, DEFAULT_MODE),
  );

  // 저장은 "사용자가 실제로 골랐을 때"만 한다. 기본값을 미리 적어 두면 나중에 기본값을
  // 바꿔도 한 번 다녀간 사람에게는 옛 기본값이 남는다.
  const setMyLang = useCallback((next) => {
    setMyLangState(next);
    writeStored(STORAGE_KEYS.myLang, next);
  }, []);

  const setDisplayMode = useCallback((next) => {
    setDisplayModeState(next);
    writeStored(STORAGE_KEYS.displayMode, next);
  }, []);

  const value = useMemo(
    () => ({ myLang, setMyLang, displayMode, setDisplayMode }),
    [myLang, setMyLang, displayMode, setDisplayMode],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 는 SettingsProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}

// 모드 + 내 언어 → 표시할 언어 배열(첫 번째가 주 언어). 자막·정적 텍스트가 같은 규칙을 공유한다.
//  - 'ko'(한국어만):   [ko]
//  - 'mine'(모국어만): [myLang]
//  - 'both'(함께):     [ko, myLang]  (내 언어가 ko면 중복 제거 → [ko])
export function displayLangsFor(displayMode, myLang) {
  if (displayMode === 'ko') return ['ko'];
  if (displayMode === 'mine') return [myLang];
  return myLang === 'ko' ? ['ko'] : ['ko', myLang];
}

// 자막용 별칭(의미 명확화) — 규칙은 displayLangsFor 와 동일.
export const subtitleLangsFor = displayLangsFor;

// 현재 전역 설정 기준의 표시 언어 배열을 반환하는 훅.
export function useDisplayLangs() {
  const { displayMode, myLang } = useSettings();
  return displayLangsFor(displayMode, myLang);
}
