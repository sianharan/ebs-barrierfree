// ④ 검색 색인 메타 — 콘텐츠별 색인 벡터 수.
//
// 색인 여부의 사실 출처는 data/search-index.json 이다. 그런데 그 파일은 130KB(콘텐츠당
// 1536차원 벡터)라, 체크 표시 하나를 위해 메인 번들에 넣으면 gzip 이 눈에 띄게 불어난다.
// 그래서 **동적 import** 로 별도 청크로 떼어 낸다 — /pipeline 의 콘텐츠 상세를 실제로 볼
// 때만 받고, 다른 화면에는 비용이 없다.
//
// 수치는 파일에서 센다(하드코딩 금지). 지금은 콘텐츠당 벡터 1개지만, 나중에 세그먼트 단위로
// 색인을 확장하면 이 집계가 그대로 따라 올라간다.

let pending = null;

// { model, vectorsByContent: { [contentId]: 개수 } } 로 정규화해 돌려준다.
// 한 번만 받아 캐시한다(여러 컴포넌트가 불러도 요청은 하나).
export function loadSearchIndexMeta() {
  if (!pending) {
    pending = import('../../data/search-index.json')
      .then((mod) => {
        const index = mod.default ?? mod;
        const items = Array.isArray(index?.items) ? index.items : [];
        const vectorsByContent = {};
        for (const item of items) {
          if (!item?.contentId) continue;
          vectorsByContent[item.contentId] = (vectorsByContent[item.contentId] || 0) + 1;
        }
        return { model: index?.model ?? null, vectorsByContent };
      })
      .catch(() => {
        // 못 받아도 화면은 뜬다 — 색인 수치만 비워 두고 나머지 단계는 그대로 보여준다.
        pending = null;
        return { model: null, vectorsByContent: {} };
      });
  }
  return pending;
}
