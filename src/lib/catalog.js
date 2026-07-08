// 검색 결과 표시용 콘텐츠 메타 카탈로그.
//
// api/search.js 는 랭킹(contentId·type·title(ko)·score)만 돌려준다. 결과의 제목·설명을
// '번역 표시 모드'에 맞춰 다국어로 보여주려면 각 콘텐츠의 전체 메타가 필요하다.
// PoC 라 콘텐츠가 소수이므로 content.json 을 빌드 타임 import 로 묶어 contentId 로 조인한다.
// (content.js 는 상세 페이지의 단일 콘텐츠 로더 — 이쪽은 검색 결과 카드용 경량 메타 전용.)
//
// 새 콘텐츠는 여기에 import 한 줄 + 배열에 추가하면 검색 결과에도 자동으로 다국어로 뜬다.
import sample01 from '../../data/sample-01/content.json';
import sample02 from '../../data/sample-02/content.json';
import sample03 from '../../data/sample-03/content.json';

const ALL = [sample01, sample02, sample03];
export const CATALOG = Object.fromEntries(ALL.map((c) => [c.id, c]));

// contentId → 콘텐츠 메타(title/description/… 다국어). 없으면 null.
export function getContentMeta(id) {
  return CATALOG[id] || null;
}
