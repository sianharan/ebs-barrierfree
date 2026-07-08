// 초경량 상태 기반 라우터 — 리스트↔상세 두 화면 전환용(React Router 미도입, "간단한 쪽").
//
// 화면이 둘뿐이라 URL 라우팅 대신 Context 로 현재 화면을 들고 있는다:
//  - route: { name: 'list' } | { name: 'detail', id }
//  - goList() / goDetail(contentId): 화면 전환 + 스크롤 최상단 복귀.
//
// 상단 바(공통)의 검색 결과·로고가 어느 화면에서든 이 훅으로 이동할 수 있게 전역에 둔다.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const RouterContext = createContext(null);

function scrollTop() {
  // 화면을 바꾸면 새 화면을 위에서부터 보게 한다(모바일에서 특히 중요).
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
}

export function RouterProvider({ children }) {
  const [route, setRoute] = useState({ name: 'list' });

  const goList = useCallback(() => {
    setRoute({ name: 'list' });
    scrollTop();
  }, []);

  const goDetail = useCallback((id) => {
    setRoute({ name: 'detail', id });
    scrollTop();
  }, []);

  const value = useMemo(() => ({ route, goList, goDetail }), [route, goList, goDetail]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter 는 RouterProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
