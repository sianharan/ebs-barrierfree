// 온보딩 안내를 여닫는 상태 — 상단 바의 '?' 버튼과 앱 셸의 모달이 같이 봐야 하므로 Context 로 둔다.
//
// 언제 저절로 뜨는가: 이 브라우저에서 안내를 한 번도 닫은 적이 없을 때만(첫 방문). 판단은 첫
// 렌더 한 번뿐이다 — 도중에 localStorage 가 바뀌어도 뜨던 안내가 사라지거나 새로 뜨지 않는다.
//
// 언제 기록하는가: '닫힐 때'다. 뜬 것만으로 기록하면, 안내가 뜬 순간 새로고침하거나 창을 닫은
// 사람은 안내를 못 본 채로 다시는 못 보게 된다. X·배경·Esc·시작하기·처리 과정 보기 — 무엇으로
// 닫든 사용자가 안내를 지나쳤다는 뜻이므로 닫는 길을 구분하지 않고 close() 한 곳에서 적는다.
//
// 값은 존재 여부만 본다('1' 을 넣지만 내용은 읽지 않는다). 나중에 안내를 개편해 다시 보여줘야
// 하면 키 이름에 버전을 붙이는 쪽이, 값에 날짜·횟수를 넣고 해석하는 쪽보다 되돌리기 쉽다.
//
// '?' 버튼은 이 기록과 무관하게 항상 연다 — 기록은 "저절로 뜨는가" 만 정하고, 사용자가 직접
// 부르는 길은 언제나 열려 있어야 한다.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { readStored, writeStored } from './storage.js';

const SEEN_KEY = 'ebs-bf.onboardingSeen';

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [isOpen, setIsOpen] = useState(() => readStored(SEEN_KEY) === null);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    writeStored(SEEN_KEY, '1');
  }, []);

  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding 은 OnboardingProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
