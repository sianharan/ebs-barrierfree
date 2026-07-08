// 앱 셸 — 상태 기반 라우터로 리스트↔상세 두 화면을 전환한다(useRouter).
//
// 상단 바(번역 표시·검색·내 언어)는 각 페이지가 공통으로 렌더한다(리스트·상세 모두 TopBar 포함).
// 상세는 contentId 로 key 를 줘, 콘텐츠가 바뀌면 재생시간·오디오 상태가 깨끗이 리셋되게 한다.
import ListPage from './pages/ListPage.jsx';
import DetailPage from './pages/DetailPage.jsx';
import { useRouter } from './lib/router.jsx';

export default function App() {
  const { route } = useRouter();

  if (route.name === 'detail') {
    return <DetailPage key={route.id} contentId={route.id} />;
  }
  return <ListPage />;
}
