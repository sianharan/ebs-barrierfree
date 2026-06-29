// UI 문자열 i18n — t(key, lang).
// 전역 UI 라벨(메뉴·버튼 등)은 한국어를 하드코딩하지 않고 이 사전을 거친다(AGENTS.md ②).
// 콘텐츠 텍스트(제목·설명·해시태그)는 content.json 의 다국어 필드를 직접 쓴다(여기 대상 아님).
import strings from '../../data/ui-strings.json';

// key 에 해당하는 lang 문자열을 반환. 사전/언어가 없으면 ko 폴백, 그래도 없으면 key 자체(누락 가시화).
export function t(key, lang) {
  const entry = strings[key];
  if (!entry) return key;
  return entry[lang] ?? entry.ko ?? key;
}
