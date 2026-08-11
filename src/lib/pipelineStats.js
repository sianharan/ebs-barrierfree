// AI 처리 파이프라인 현황 집계 — /pipeline 페이지의 통계 카드용.
//
// 숫자를 화면에 적어두지 않는다. 전처리 산출물(data/{contentId}/*.json)을 그대로 세어서
// 만들기 때문에, 콘텐츠나 언어가 늘면 코드 수정 없이 카드 숫자가 따라 올라간다.
//   - 자막 세그먼트: subtitles.json 의 segments 합계 (getContent().segments)
//   - 지원 언어:     LANGUAGES 배열 길이 (한국어 원본 포함)
//   - 어휘 풀이:     vocabulary.json 의 terms 합계
//   - 더빙 음성:     dub-{lang}.json 의 세그먼트(=음성 파일 1개) 합계, 모든 콘텐츠 × 모든 언어
//   - 영상 길이:     콘텐츠별 마지막 세그먼트의 end(초) 합계 → 분
//   - 번역 문장:     세그먼트 text 에서 원문(ko)을 뺀 언어 수의 합계
//   - 언어별 현황:   perLanguage — 언어마다 번역 세그먼트 수 · 더빙 파일 수(축을 따로 센다)
//   - 콘텐츠별 현황: perContent — 콘텐츠마다 세그먼트·번역 문장·어휘·더빙 수
//
// 빌드 타임 import 라 계산이 가볍고 값도 고정이다 — 모듈 로드 시 한 번만 집계한다.
import { CATALOG_LIST } from './catalog.js';
import { getContent } from './content.js';
import { LANGUAGES } from './settings.jsx';

// 콘텐츠 원문 언어. 번역 대상이 아니고(원문이다) 더빙도 없다(원음을 그대로 쓴다) —
// 두 집계가 같은 사실을 참조해야 화면에서 어긋나지 않으므로 여기 한 곳에 둔다.
export const SOURCE_LANG = 'ko';

function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// 자릿수 구분만 하고 언어별 표기는 건드리지 않는다(1,234 — 10개 언어에서 모두 통용).
// 이 숫자들을 쓰는 화면이 모두 같은 규칙을 따르도록 집계와 같은 자리에 둔다.
export const formatNumber = (n) => n.toLocaleString('en-US');

// 언어별 현황 — LANGUAGES 순서 그대로(화면 순서 = 데이터 순서).
//
// 번역과 더빙을 **따로** 센다. 하나로 뭉쳐 '완료' 라고만 적으면 원본 한국어를 설명할 수
// 없다: 번역은 완료가 아니라 애초에 대상이 아니고(원문), 더빙은 없는 게 정상이다(원음 사용).
function computePerLanguage(bundles) {
  return LANGUAGES.map((lang) => {
    // 그 언어 자막이 실제로 들어 있는 세그먼트 수. 원본이면 곧 원문 세그먼트 수다.
    const segments = sum(
      bundles.map(
        (b) => b.segments.filter((s) => String(s.text?.[lang.code] ?? '').trim()).length,
      ),
    );
    // 더빙 mp3 수. 원본은 dubByLang 에 키 자체가 없어 0 이 된다 — '없음' 을 데이터에서 얻는다.
    const dubFiles = sum(bundles.map((b) => (b.dubByLang?.[lang.code] || []).length));
    return {
      ...lang,
      isSource: lang.code === SOURCE_LANG,
      segments,
      dubFiles,
      hasDub: dubFiles > 0,
    };
  });
}

// 콘텐츠별 현황 — CATALOG_LIST 순서 그대로. 콘텐츠 상세 아코디언의 단계별 수치.
// id 는 content.json 의 id 다(상세 페이지 링크·쿼리 파라미터와 같은 값이어야 한다).
function computePerContent(bundles) {
  return bundles.map((b) => ({
    id: b.id,
    segments: b.segments.length,
    translations: sum(
      b.segments.map(
        (s) => Object.keys(s.text || {}).filter((lang) => lang !== SOURCE_LANG).length,
      ),
    ),
    vocabulary: b.vocabulary.length,
    dubFiles: sum(Object.values(b.dubByLang || {}).map((segs) => segs.length)),
  }));
}

// 전체 콘텐츠를 훑어 통계를 계산한다. 테스트·재계산이 쉽도록 함수로 둔다.
export function computePipelineStats() {
  const bundles = CATALOG_LIST.map((c) => getContent(c.id));

  return {
    perLanguage: computePerLanguage(bundles),
    perContent: computePerContent(bundles),
    contents: bundles.length,
    segments: sum(bundles.map((b) => b.segments.length)),
    languages: LANGUAGES.length,
    vocabulary: sum(bundles.map((b) => b.vocabulary.length)),
    // 마지막 세그먼트의 end 가 그 영상의 길이다(자막이 끝까지 붙어 있으므로). 자막이 없으면 0.
    durationMinutes: Math.round(
      sum(bundles.map((b) => b.segments[b.segments.length - 1]?.end || 0)) / 60,
    ),
    // 번역된 문장 수 — 세그먼트마다 원문을 뺀 언어 수를 센다. 언어가 늘면 함께 올라간다.
    translations: sum(
      bundles.flatMap((b) =>
        b.segments.map(
          (s) => Object.keys(s.text || {}).filter((lang) => lang !== SOURCE_LANG).length,
        ),
      ),
    ),
    // 세그먼트 1개 = mp3 1개. 언어별 사전을 모두 더한다(더빙이 없는 언어는 빈 배열 → 0).
    dubbingFiles: sum(
      bundles.map((b) => sum(Object.values(b.dubByLang || {}).map((segs) => segs.length))),
    ),
  };
}

export const PIPELINE_STATS = computePipelineStats();
