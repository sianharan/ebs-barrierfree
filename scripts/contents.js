// scripts/contents.js
// 콘텐츠별 전처리 설정(주제·메타·영상 URL)을 한곳에서 관리한다.
// transcribe/translate/vocabulary 스크립트가 CONTENT_ID 로 이 설정을 조회해 재사용한다
// (언어·주제·고유명사를 스크립트에 하드코딩하지 않기 위함 — AGENTS.md 데이터로 관리 원칙).
//
//  - topic:       프롬프트의 "영상 주제:" 문구(교정·번역·어휘 뜻풀이 맥락).
//  - instructors: STT 고유명사 교정용 강사 이름(한국어).
//  - videoUrl:    content.json 을 새로 생성할 때 쓰는 영상 URL.
//  - meta:        content.json 이 아직 없을 때 생성할 한국어 메타(제목·강사·설명·해시태그).
//                 content.json 이 이미 있으면(예: 다국어가 이미 채워진 경우) translate.js 가
//                 이를 보존하고 재생성하지 않으므로 meta 는 null 이어도 된다.

export const CONTENTS = {
  'sample-01': {
    topic:
      '영유아(유아)의 신체 발달과 놀이. 소아청소년과 전문의와 소아청소년 정신건강의학과 전문의가 부모를 대상으로 설명하는 강의입니다.',
    instructors: ['박소영', '손수예'],
    videoUrl:
      'https://ebsvod.ebs.co.kr/ebsvod/cul/2024/40049780/2m/20241007_094000_1f712df8_m20.mp4',
    meta: {
      title: '1강 우리 아이의 신체 발달과 놀이',
      instructors: ['박소영', '손수예'],
      description: '아이들의 신체 발달 특성과 놀이가 주는 긍정적 영향력에 대해 알아본다',
      hashtags: ['유아', '신체', '발달', '놀이', '운동'],
    },
  },
  'sample-02': {
    topic:
      '진정한 놀이란 무엇인가 — 아이들을 올바른 방향으로 성장시키는 놀이의 의미와 종류. 소아청소년과·소아청소년 정신건강의학과 전문의가 부모를 대상으로 설명하는 강의입니다.',
    instructors: ['박소영', '손수예'],
    videoUrl:
      'https://ebsvod.ebs.co.kr/ebsvod/cul/2024/40049780/2m/20241014_094000_5bd1d211_m20.mp4',
    // content.json 이 이미 10개 언어로 존재 → translate.js 가 보존한다(재생성 안 함).
    meta: null,
  },
  'sample-03': {
    topic:
      '우리 아이 첫 성교육 — 아이가 몸에 대해 바르게 배우고 성장하도록 돕는 첫 성교육의 중요성과 방법. 소아청소년과·소아청소년 정신건강의학과 전문의가 부모를 대상으로 설명하는 강의입니다.',
    instructors: ['박소영', '손수예'],
    videoUrl:
      'https://ebsvod.ebs.co.kr/ebsvod/cul/2024/40049780/2m/20241021_094000_a47ed521_m20.mp4',
    // content.json 이 이미 10개 언어로 존재 → translate.js 가 보존한다(재생성 안 함).
    meta: null,
  },
};

export function contentConfig(id) {
  const c = CONTENTS[id];
  if (!c) {
    throw new Error(
      `scripts/contents.js 에 '${id}' 설정이 없습니다. topic·instructors·videoUrl(·meta)을 추가하세요.`,
    );
  }
  return c;
}
