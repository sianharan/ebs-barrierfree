// 온보딩 안내 모달 — 처음 들어온 사람에게 "이 앱으로 뭘 할 수 있는지"를 한 화면에 보인다.
//
// 기능 카드 넷은 6대 기능 중 사용자가 화면에서 직접 만나는 것들이다 —
// ② 모국어 번역 · ③⑥ 읽어주기·더빙 · ⑤ 어휘 즉시 풀이 · ④ 의미 검색.
// ①(이중자막)은 ②의 결과로 화면에 같이 나오므로 따로 세우지 않았다. 넷을 넘기면
// 안내가 아니라 목록이 된다 — 모달은 읽히지 않으면 없는 것과 같다.
//
// 'AI 처리 과정 보기' 는 기능 카드보다 한 단 낮춘다(테두리·그림자 없이 구분선 아래
// 작은 글씨). 이건 기능이 아니라 "궁금하면 더 볼 수 있다" 는 곁가지라, 카드와 같은
// 무게로 두면 다섯 번째 기능처럼 읽힌다.
//
// 여닫는 상태는 여기 두지 않는다 — 상단 바의 '?' 가 같은 상태를 열어야 하므로 onboarding.jsx
// 의 Context 에 있고, 이 컴포넌트는 열려 있을 때만 마운트된다(App). 그래서 "열릴 때" 해야 할
// 일은 마운트 이펙트로, "닫힐 때" 해야 할 일은 그 정리(cleanup)로 적을 수 있다.
//
// 닫는 길은 다섯이다 — X · 배경 클릭 · Esc · 시작하기 · AI 처리 과정 보기. 다섯 다 onClose
// 하나로 모은다(무엇으로 닫았는지는 "안내를 봤다" 는 기록에 아무 차이도 만들지 않는다).
//
// 접근성:
//  - role=dialog + aria-modal + aria-labelledby 로 제목과 묶는다.
//  - 열리면 포커스를 대화상자 자체로 옮긴다. 첫 버튼(X)으로 옮기면 스크린리더가 제목보다
//    '닫기' 를 먼저 읽어, 안내가 '닫으라는 것' 처럼 들린다. 컨테이너에 두면 이름(제목)과
//    역할이 먼저 읽히고, 다음 Tab 이 X 로 간다.
//  - 포커스 가둠 — Tab 이 대화상자 밖(뒤 페이지의 링크·카드)으로 새지 않게 양끝에서 되돌린다.
//    뒤 페이지는 aria-modal 로 보조기술에서 가려지는데, 포커스만 그리로 가면 읽히지 않는
//    곳에 커서가 있는 상태가 된다.
//  - 닫으면 부른 자리로 포커스를 되돌린다. 저절로 뜬 경우엔 부른 자리가 없으므로 상단 바의
//    '?' 로 보낸다 — 방금 닫은 것을 다시 여는 자리라, 잘못 닫았을 때 되돌리기가 한 번이다.
//  - 기능 넷은 순서가 의미가 아니라 나열이므로 ul/li.
//  - 닫기(X)는 도형뿐이라 aria-label 로 이름을 준다. 아이콘은 aria-hidden.
//  - 누르는 것은 모두 44px 이상(닫기 h-11 w-11, 나머지 min-h-[44px]).
//
// 배경 스크롤은 잠그지 않았다. body 를 overflow-hidden 으로 막으면 데스크톱에서 스크롤바가
// 사라지며 뒤 페이지가 통째로 옆으로 뛴다 — 첫 방문에 저절로 뜨는 안내라 그 흔들림을 열 때
// 한 번, 닫을 때 한 번 보게 된다. 뒤 페이지는 aria-modal 로 이미 보조기술에서 가려져 있고,
// 포커스도 위에서 가둔다.

import { useCallback, useEffect, useRef } from 'react';
import { useSettings } from '../lib/settings.jsx';
import { useRouter } from '../lib/router.jsx';
import { t } from '../lib/i18n.js';

// 대화상자 안에서 실제로 포커스를 받을 수 있는 것들 — 순서는 DOM 순서(=Tab 순서)다.
// disabled 와 숨겨진 것은 뺀다. 지금 마크업에는 버튼뿐이지만, 나중에 링크나 입력이 들어와도
// 가둠이 따라오도록 선택자로 훑는다(요소를 손으로 나열하면 새 요소가 조용히 새어 나간다).
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length,
  );
}

// 아이콘 규격은 PipelineFlow·TopBar 와 같다(24 그리드·stroke 2·aria-hidden).
// 이 저장소는 아이콘을 쓰는 컴포넌트 안에 두는 쪽을 택해 왔다(SearchIcon·PlayIcon 등).
const iconProps = {
  className: 'h-6 w-6 text-brand-deepblue',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// 한 문장을 여러 언어로 — 말풍선 둘(PipelineFlow 의 다국어 번역 단계와 같은 그림).
function TranslateIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8l-3 3v-3a2 2 0 0 1-2-2z" />
      <path d="M17 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2v3l-3-3h-3" />
    </svg>
  );
}

// 목소리로 들려준다 — 스피커 + 음파.
function SpeakerIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 6a9 9 0 0 1 0 12" />
    </svg>
  );
}

// 어려운 말을 풀이한다 — 책.
function BookIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M8 7h7M8 11h5" />
    </svg>
  );
}

// 뜻으로 찾는다 — 돋보기.
function SearchIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

// 닫기 — X. 색은 본문 톤을 따른다(기능 아이콘의 파랑과 경쟁하지 않게).
function CloseIcon() {
  return (
    <svg {...iconProps} className="h-5 w-5 text-ink/60">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// 카드 정의를 데이터로 둔다 — 기능이 늘거나 순서가 바뀌어도 마크업은 그대로.
const FEATURES = [
  { key: 'translate', Icon: TranslateIcon },
  { key: 'readAloud', Icon: SpeakerIcon },
  { key: 'vocabulary', Icon: BookIcon },
  { key: 'search', Icon: SearchIcon },
];

export default function OnboardingModal({ onClose }) {
  const { myLang } = useSettings();
  const { goPipeline } = useRouter();
  const dialogRef = useRef(null);
  // 배경을 '눌러서' 닫았는지 — 카드 안에서 드래그를 시작해 배경에서 손을 뗀 경우까지 닫히면
  // 글자를 긁어 읽던 사람이 안내를 잃는다. click 의 target 은 그때 공통 조상(배경)이 된다.
  const pressedOverlay = useRef(false);

  // 열릴 때 포커스를 안으로, 닫힐 때 부른 자리로.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      const back =
        opener instanceof HTMLElement && opener.isConnected && opener !== document.body
          ? opener
          : document.querySelector('[data-onboarding-trigger]');
      back?.focus();
    };
  }, []);

  // Esc 로 닫기 + 포커스 가둠. document 에 건다 — 배경이나 글자를 클릭하면 포커스가 body 로
  // 빠져 대화상자의 onKeyDown 이 못 받는데, 그 상태에서 Esc·Tab 이 죽으면 키보드로는 갇힌다.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = focusableIn(dialogRef.current);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      // 포커스가 밖에 있으면(배경 클릭 등) 방향에 맞는 끝으로 데려온다.
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      // 양끝에서만 손댄다 — 가운데서는 브라우저 기본 순서가 그대로 옳다.
      // 컨테이너(tabindex=-1)에 포커스가 있을 때의 Shift+Tab 도 뒤로 새므로 같이 막는다.
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // AI 처리 과정 보기 — 닫고 나서 옮긴다. 순서가 반대면 새 화면 위에 안내가 한 프레임 남는다.
  const goToPipeline = useCallback(() => {
    onClose();
    goPipeline();
  }, [onClose, goPipeline]);

  return (
    // 오버레이는 상단 바(z-50) 위여야 한다 — 그 아래면 헤더만 멀쩡히 눌려 모달이 뚫린다.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4"
      onMouseDown={(e) => {
        pressedOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOverlay.current) onClose();
      }}
    >
      {/* 카드 높이는 화면을 넘지 않게 잡고, 넘치면 카드 안에서만 스크롤한다 —
          모바일에서 기능 카드 넷이 세로로 쌓이면 세로가 모자란다. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        // tabIndex=-1: 포커스를 받되 Tab 순서에는 끼지 않는다(가둠의 시작점 전용).
        // outline-none 은 그 프로그램 포커스에만 해당한다 — 안의 버튼들은 각자 링을 그대로 쓴다.
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <h2 id="onboarding-title" className="font-title text-lg leading-snug text-logo-navy md:text-xl">
            {t('onboarding.title', myLang)}
          </h2>
          {/* shrink-0: 제목이 두 줄이 되는 언어(러시아어·인도네시아어)에서도 X 가 찌그러지지 않게. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('onboarding.close', myLang)}
            className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue"
          >
            <CloseIcon />
          </button>
        </div>

        {/* 넘칠 때 스크롤되는 것은 기능 카드뿐이다. 아래 안내·시작하기까지 스크롤 안에 두면
            좁고 긴 화면(러시아어 모바일)에서 잘리는 지점이 안내 문구 한가운데가 되어,
            '더 있다'가 아니라 '깨졌다'로 읽힌다. 카드 사이에서 잘리면 이어짐이 보인다. */}
        <div className="overflow-y-auto px-5 py-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ key, Icon }) => (
              // 카드 규격은 기존 카드와 같다(rounded-xl · border-ink/10 · shadow-sm).
              // 배경만 흰 모달 위에서 보이도록 페이지 배경색을 옅게 깐다.
              <li
                key={key}
                className="rounded-xl border border-ink/10 bg-background/20 px-4 py-3 shadow-sm"
              >
                <Icon />
                <p className="mt-2 text-sm font-medium leading-snug text-ink">
                  {t(`onboarding.feature.${key}.title`, myLang)}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink/70">
                  {t(`onboarding.feature.${key}.desc`, myLang)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-ink/10 px-5 py-4">
          {/* 곁가지 — 카드보다 가볍게(테두리·그림자 없이 작은 글씨). */}
          <p className="text-xs leading-relaxed text-ink/60">{t('onboarding.pipeline.hint', myLang)}</p>
          <button
            type="button"
            onClick={goToPipeline}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-medium text-brand-deepblue transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue"
          >
            {t('onboarding.pipeline.link', myLang)}
            {/* 화살표는 장식 — 문구가 이미 '이동한다'를 말한다. */}
            <span aria-hidden="true">→</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-2 min-h-[44px] w-full rounded-full bg-brand-deepblue px-4 text-sm font-medium text-white transition-colors hover:bg-brand-deepblue/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-deepblue"
          >
            {t('onboarding.start', myLang)}
          </button>
        </div>
      </div>
    </div>
  );
}
