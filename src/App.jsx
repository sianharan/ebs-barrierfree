// 앱 셸 — 라우터로 리스트·상세·AI 처리 과정 화면을 전환한다(useRouter).
//
// 상단 바(번역 표시·검색·내 언어)는 각 페이지가 공통으로 렌더한다(모든 화면이 TopBar 포함).
// 상세는 contentId 로 key 를 줘, 콘텐츠가 바뀌면 재생시간·오디오 상태가 깨끗이 리셋되게 한다.
//
// 온보딩 안내는 화면 밖(라우트와 무관)에 있다 — 어느 화면에서 '?' 를 눌러도 같은 안내가 뜨고,
// 화면을 옮겨도 상태가 초기화되지 않는다. 열려 있을 때만 마운트한다: 그래야 모달이 "열릴 때"
// 와 "닫힐 때" 해야 할 일(포커스 이동·복귀)을 마운트/언마운트로 다룰 수 있다.
import ListPage from './pages/ListPage.jsx';
import DetailPage from './pages/DetailPage.jsx';
import PipelinePage from './pages/PipelinePage.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
import { useRouter } from './lib/router.jsx';
import { useOnboarding } from './lib/onboarding.jsx';

function CurrentPage() {
  const { route } = useRouter();

  if (route.name === 'detail') {
    return <DetailPage key={route.id} contentId={route.id} />;
  }
  if (route.name === 'pipeline') {
    return <PipelinePage />;
  }
  return <ListPage />;
}

export default function App() {
  const { isOpen, close } = useOnboarding();

  return (
    <>
      <CurrentPage />
      {isOpen && <OnboardingModal onClose={close} />}
    </>
  );
}
