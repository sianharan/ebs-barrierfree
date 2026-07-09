// 콘텐츠 데이터 로더.
// 전처리 산출물(data/{contentId}/*.json)을 앱으로 불러온다.
// PoC 단계라 콘텐츠가 소수이므로 빌드 타임 import 로 번들에 포함한다(런타임 fetch 대신).
// 런타임은 이 JSON 형태만 신뢰한다(AGENTS.md 데이터 스키마).
//
// contentId 별로 메타(content.json)·자막·어휘·더빙을 묶어둔다. 아직 전처리가 끝나지 않은
// 콘텐츠(sample-02·03)는 자막·어휘·더빙이 비어 있어도 상세 페이지가 크래시 없이 동작한다
// (자막 없으면 대본 패널을 숨기고, 더빙 없으면 토글을 숨긴다).
import content01 from '../../data/sample-01/content.json';
import subtitles01 from '../../data/sample-01/subtitles.json';
import vocabulary01 from '../../data/sample-01/vocabulary.json';
import dubVi01 from '../../data/sample-01/dub-vi.json';
import dubEn01 from '../../data/sample-01/dub-en.json';
import dubZh01 from '../../data/sample-01/dub-zh.json';
import dubJa01 from '../../data/sample-01/dub-ja.json';
import dubEs01 from '../../data/sample-01/dub-es.json';
import dubFr01 from '../../data/sample-01/dub-fr.json';
import content02 from '../../data/sample-02/content.json';
import subtitles02 from '../../data/sample-02/subtitles.json';
import vocabulary02 from '../../data/sample-02/vocabulary.json';
import dubVi02 from '../../data/sample-02/dub-vi.json';
import dubEn02 from '../../data/sample-02/dub-en.json';
import dubZh02 from '../../data/sample-02/dub-zh.json';
import dubJa02 from '../../data/sample-02/dub-ja.json';
import dubEs02 from '../../data/sample-02/dub-es.json';
import dubFr02 from '../../data/sample-02/dub-fr.json';
import content03 from '../../data/sample-03/content.json';
import subtitles03 from '../../data/sample-03/subtitles.json';
import vocabulary03 from '../../data/sample-03/vocabulary.json';
import dubVi03 from '../../data/sample-03/dub-vi.json';
import dubEn03 from '../../data/sample-03/dub-en.json';
import dubZh03 from '../../data/sample-03/dub-zh.json';
import dubJa03 from '../../data/sample-03/dub-ja.json';
import dubEs03 from '../../data/sample-03/dub-es.json';
import dubFr03 from '../../data/sample-03/dub-fr.json';

// ⑥ 더빙 음성 사전(dub-{lang}.json) — 언어별로 묶는다(데이터로 관리, AGENTS.md).
// 새 언어 더빙은 dub-{lang}.json 을 import 해 해당 콘텐츠의 dubByLang 에 한 줄 추가하면 확장된다.
// 각 값은 [{ id, start, end, duration, audio }] 세그먼트 배열(audio = public 기준 절대경로).
const segs = (json) => (Array.isArray(json?.segments) ? json.segments : []);

// contentId → 상세 페이지가 쓰는 번들. 전처리가 없는 콘텐츠는 빈 배열로 안전하게 채운다.
const REGISTRY = {
  'sample-01': {
    content: content01,
    segments: segs(subtitles01),
    vocabulary: Array.isArray(vocabulary01.terms) ? vocabulary01.terms : [],
    // ⑥ 더빙 — 언어별 사전. 내 언어를 바꾸면 DetailPage 가 dubByLang[myLang] 로 해당 언어 mp3 를 재생.
    dubByLang: {
      vi: segs(dubVi01),
      en: segs(dubEn01),
      zh: segs(dubZh01),
      ja: segs(dubJa01),
      es: segs(dubEs01),
      fr: segs(dubFr01),
    },
  },
  'sample-02': {
    content: content02,
    segments: segs(subtitles02),
    vocabulary: Array.isArray(vocabulary02.terms) ? vocabulary02.terms : [],
    dubByLang: {
      vi: segs(dubVi02),
      en: segs(dubEn02),
      zh: segs(dubZh02),
      ja: segs(dubJa02),
      es: segs(dubEs02),
      fr: segs(dubFr02),
    },
  },
  'sample-03': {
    content: content03,
    segments: segs(subtitles03),
    vocabulary: Array.isArray(vocabulary03.terms) ? vocabulary03.terms : [],
    dubByLang: {
      vi: segs(dubVi03),
      en: segs(dubEn03),
      zh: segs(dubZh03),
      ja: segs(dubJa03),
      es: segs(dubEs03),
      fr: segs(dubFr03),
    },
  },
};

// 콘텐츠 메타·자막·어휘·더빙을 묶어 반환. 없는 id 는 첫 콘텐츠로 폴백.
export function getContent(id = 'sample-01') {
  const entry = REGISTRY[id] || REGISTRY['sample-01'];
  return {
    ...entry.content,
    segments: entry.segments,
    vocabulary: entry.vocabulary,
    dubByLang: entry.dubByLang,
  };
}
