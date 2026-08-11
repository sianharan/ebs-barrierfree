// 초경량 라우터 — 리스트·상세·AI 처리 과정 세 화면 전환용(React Router 미도입, "간단한 쪽").
//
// 화면 상태를 Context 로 들고 있되, 주소창(History API)과 동기화한다:
//  - route: { name: 'list' } | { name: 'detail', id } | { name: 'pipeline' }
//  - 경로:  '/'              | '/content/{id}'       | '/pipeline'
//  - goList() / goDetail(contentId) / goPipeline(): 화면 전환 + pushState + 스크롤 최상단 복귀.
//
// 주소를 붙인 이유: /pipeline 은 헤더 링크로만 닿는 화면이 아니라 "이 주소를 열면 이 화면"이어야
// 공유·새로고침·뒤로가기가 성립한다. 뒤로가기는 popstate 로 받아 route 를 되돌린다.
// (정적 호스팅에서는 알 수 없는 경로를 index.html 로 폴백해야 한다 — Vite dev 서버는 기본 제공.)
//
// 상단 바(공통)의 검색 결과·로고가 어느 화면에서든 이 훅으로 이동할 수 있게 전역에 둔다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

// 경로 → route. 모르는 경로는 리스트로 폴백(404 화면을 따로 두지 않는다).
// 끝 슬래시는 떼고 비교한다 — '/pipeline/' 처럼 슬래시가 붙어 들어와도(붙여 쓰는 습관·복사된 링크)
// 같은 화면이어야 한다. '/' 는 '' 가 되어 아래 매칭에 걸리지 않고 리스트로 떨어진다.
function routeFromPath(pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/pipeline') return { name: 'pipeline' };
  const detail = path.match(/^\/content\/([\w-]+)$/);
  if (detail) return { name: 'detail', id: detail[1] };
  return { name: 'list' };
}

// route → 경로. routeFromPath 의 역함수.
function pathFromRoute(route) {
  if (route.name === 'pipeline') return '/pipeline';
  if (route.name === 'detail') return `/content/${route.id}`;
  return '/';
}

function scrollTop() {
  // 화면을 바꾸면 새 화면을 위에서부터 보게 한다(모바일에서 특히 중요).
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
}

export function RouterProvider({ children }) {
  // 첫 화면은 주소창에서 읽는다 — /pipeline 을 직접 열거나 새로고침해도 그 화면이 뜬다.
  const [route, setRoute] = useState(() =>
    routeFromPath(typeof window === 'undefined' ? '/' : window.location.pathname),
  );

  // 뒤로/앞으로 — 주소가 바뀌면 화면을 따라 되돌린다(pushState 는 popstate 를 쏘지 않는다).
  useEffect(() => {
    const onPop = () => {
      setRoute(routeFromPath(window.location.pathname));
      scrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next) => {
    setRoute(next);
    const path = pathFromRoute(next);
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    scrollTop();
  }, []);

  const goList = useCallback(() => navigate({ name: 'list' }), [navigate]);
  const goDetail = useCallback((id) => navigate({ name: 'detail', id }), [navigate]);
  const goPipeline = useCallback(() => navigate({ name: 'pipeline' }), [navigate]);

  const value = useMemo(
    () => ({ route, goList, goDetail, goPipeline }),
    [route, goList, goDetail, goPipeline],
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter 는 RouterProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
