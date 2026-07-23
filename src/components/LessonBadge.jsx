// 강번호 배지("1강"·"2강"…) — 리스트 카드와 상세 '관련 영상' 카드가 공유한다.
//
// 썸네일 위가 아니라 카드 제목 줄에 둔다. 원본 썸네일에는 우상단에 EBS1 채널 로고가,
// 좌상단에 '유아 클래스' 브랜딩이, 아래쪽에 강의 제목이 이미 구워져 있고(② 오버레이도
// 같은 자리를 쓴다) — 배지는 고정 px, 방해 요소는 정규화 비율이라 카드가 좁아질수록
// 어느 모서리에 두든 파고든다. 이미지 밖으로 빼면 폭·언어·썸네일이 바뀌어도 겹칠 자리가 없다.
// 강번호는 썸네일 제목과 ② 번역 오버레이에 이미 들어 있어 이미지 위 배지는 중복이기도 했다.

// 한국어 제목에서 강번호를 뽑는다. 없으면 순번(index+1)으로 폴백.
export function lessonLabel(content, index) {
  const m = /^\s*(\d+)\s*강/.exec(content.title?.ko ?? '');
  return m ? `${m[1]}강` : String(index + 1);
}

export default function LessonBadge({ content, index }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-logo-navy/10 px-2 py-0.5 font-title text-xs font-bold text-logo-navy">
      {lessonLabel(content, index)}
    </span>
  );
}
