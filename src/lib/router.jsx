// 초경량 라우터 — 리스트·상세·AI 처리 과정 세 화면 전환용(React Router 미도입, "간단한 쪽").
//
// 화면 상태를 Context 로 들고 있되, 주소창(History API)과 동기화한다:
//  - route: { name: 'list' } | { name: 'detail', id } | { name: 'pipeline', contentId? }
//  - 경로:  '/'              | '/content/{id}'       | '/pipeline[?content={id}]'
//  - goList() / goDetail(contentId) / goPipeline(contentId?): 화면 전환 + pushState + 스크롤 최상단 복귀.
//
// /pipeline 의 ?content= 는 "이 강의가 어떻게 처리됐는지" 로 들어오는 입구다(상세 페이지 링크).
// 경로가 아니라 쿼리로 둔 이유: 화면은 같은 현황판이고 그 안에서 어디를 볼지만 다르다.
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
function routeFromPath(pathname, search = '') {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/pipeline') {
    // 남이 넣은 값처럼 다룬다 — 형태만 걸러 넘기고, 실제로 있는 콘텐츠인지는 화면이 판단한다
    // (없는 id 면 평소대로 전부 접힌 상태로 렌더한다).
    const raw = new URLSearchParams(search).get('content');
    const contentId = raw && /^[\w-]+$/.test(raw) ? raw : undefined;
    return { name: 'pipeline', contentId };
  }
  const detail = path.match(/^\/content\/([\w-]+)$/);
  if (detail) return { name: 'detail', id: detail[1] };
  return { name: 'list' };
}

// route → 경로(+쿼리). routeFromPath 의 역함수.
function pathFromRoute(route) {
  if (route.name === 'pipeline') {
    return route.contentId ? `/pipeline?content=${encodeURIComponent(route.contentId)}` : '/pipeline';
  }
  if (route.name === 'detail') return `/content/${route.id}`;
  return '/';
}

function scrollTop() {
  // 화면을 바꾸면 새 화면을 위에서부터 보게 한다(모바일에서 특히 중요).
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' });
}

export function RouterProvider({ children }) {
  // 첫 화면은 주소창에서 읽는다 — /pipeline?content=… 를 직접 열거나 새로고침해도 그대로 뜬다.
  const [route, setRoute] = useState(() =>
    routeFromPath(
      typeof window === 'undefined' ? '/' : window.location.pathname,
      typeof window === 'undefined' ? '' : window.location.search,
    ),
  );

  // 뒤로/앞으로 — 주소가 바뀌면 화면을 따라 되돌린다(pushState 는 popstate 를 쏘지 않는다).
  useEffect(() => {
    const onPop = () => {
      setRoute(routeFromPath(window.location.pathname, window.location.search));
      scrollTop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next) => {
    setRoute(next);
    const path = pathFromRoute(next);
    // 쿼리까지 비교한다 — /pipeline 과 /pipeline?content=x 는 다른 주소다.
    if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== path) {
      window.history.pushState(null, '', path);
    }
    scrollTop();
  }, []);

  const goList = useCallback(() => navigate({ name: 'list' }), [navigate]);
  const goDetail = useCallback((id) => navigate({ name: 'detail', id }), [navigate]);
  // contentId 는 선택. onClick={goPipeline} 처럼 넘기면 첫 인자로 클릭 이벤트가 들어오므로
  // 문자열만 받아들인다 — 호출부도 () => goPipeline() 로 감싸 두었지만 여기서도 막는다.
  const goPipeline = useCallback(
    (contentId) =>
      navigate({ name: 'pipeline', contentId: typeof contentId === 'string' ? contentId : undefined }),
    [navigate],
  );

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
