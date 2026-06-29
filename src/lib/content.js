// 콘텐츠 데이터 로더.
// 전처리 산출물(data/{contentId}/*.json)을 앱으로 불러온다.
// PoC 단계라 콘텐츠가 소수이므로 빌드 타임 import 로 번들에 포함한다(런타임 fetch 대신).
// 런타임은 이 JSON 형태만 신뢰한다(AGENTS.md 데이터 스키마).
//
// 자막(subtitles)도 함께 노출하지만, 표시는 이후 Phase(①이중자막)에서 처리한다.
import content from '../../data/sample-01/content.json';
import subtitles from '../../data/sample-01/subtitles.json';
import vocabulary from '../../data/sample-01/vocabulary.json';

// 콘텐츠 메타(content.json)·자막(subtitles.json)·어휘(vocabulary.json)를 묶어 반환.
// 추후 콘텐츠가 늘면 contentId 로 분기하도록 확장한다(지금은 sample-01 단일).
export function getContent() {
  return {
    ...content,
    segments: Array.isArray(subtitles.segments) ? subtitles.segments : [],
    vocabulary: Array.isArray(vocabulary.terms) ? vocabulary.terms : [],
  };
}
