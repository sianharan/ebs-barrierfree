// AI 처리 파이프라인 현황 집계 — /pipeline 페이지의 통계 카드용.
//
// 숫자를 화면에 적어두지 않는다. 전처리 산출물(data/{contentId}/*.json)을 그대로 세어서
// 만들기 때문에, 콘텐츠나 언어가 늘면 코드 수정 없이 카드 숫자가 따라 올라간다.
//   - 자막 세그먼트: subtitles.json 의 segments 합계 (getContent().segments)
//   - 지원 언어:     LANGUAGES 배열 길이 (한국어 원본 포함)
//   - 어휘 풀이:     vocabulary.json 의 terms 합계
//   - 더빙 음성:     dub-{lang}.json 의 세그먼트(=음성 파일 1개) 합계, 모든 콘텐츠 × 모든 언어
//
// 빌드 타임 import 라 계산이 가볍고 값도 고정이다 — 모듈 로드 시 한 번만 집계한다.
import { CATALOG_LIST } from './catalog.js';
import { getContent } from './content.js';
import { LANGUAGES } from './settings.jsx';

function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// 전체 콘텐츠를 훑어 통계를 계산한다. 테스트·재계산이 쉽도록 함수로 둔다.
export function computePipelineStats() {
  const bundles = CATALOG_LIST.map((c) => getContent(c.id));

  return {
    contents: bundles.length,
    segments: sum(bundles.map((b) => b.segments.length)),
    languages: LANGUAGES.length,
    vocabulary: sum(bundles.map((b) => b.vocabulary.length)),
    // 세그먼트 1개 = mp3 1개. 언어별 사전을 모두 더한다(더빙이 없는 언어는 빈 배열 → 0).
    dubbingFiles: sum(
      bundles.map((b) => sum(Object.values(b.dubByLang || {}).map((segs) => segs.length))),
    ),
  };
}

export const PIPELINE_STATS = computePipelineStats();
