// ② 이미지 번역 데이터 로더.
// 전처리 산출물(data/{contentId}/images.json)을 앱으로 불러온다.
// PoC 라 콘텐츠가 소수이므로 빌드 타임 import 로 번들에 포함한다(런타임 fetch 대신).
//
// images.json = { images: [{ id, src, regions:[{ bbox:[x,y,w,h], text:{ko,en,vi,zh,ja} }] }] }.
// 대표 이미지(썸네일)는 각 콘텐츠당 한 장이라, getImage 는 첫 이미지를 돌려준다.
// 새 콘텐츠는 import 한 줄 + REGISTRY 한 줄만 추가하면 확장된다(전처리가 없으면 null 로 안전).
import images01 from '../../data/sample-01/images.json';
import images02 from '../../data/sample-02/images.json';
import images03 from '../../data/sample-03/images.json';

const first = (json) => (Array.isArray(json?.images) && json.images.length > 0 ? json.images[0] : null);

const REGISTRY = {
  'sample-01': first(images01),
  'sample-02': first(images02),
  'sample-03': first(images03),
};

// contentId → 대표 이미지({ id, src, regions }) 또는 null(전처리 없음).
export function getImage(id) {
  return REGISTRY[id] || null;
}
