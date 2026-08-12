// localStorage 접근 한 겹 — 읽기·쓰기 둘 다 실패해도 화면은 그대로 돌아가야 한다.
//
// 사생활 보호 모드·용량 초과·기업 정책 등으로 localStorage 접근 자체가 예외를 던지는 환경이
// 있다. 지속은 편의이지 이번 세션 동작의 조건이 아니므로, 여기서 삼키고 호출부는 값이 없는
// 경우만 다루게 한다.
//
// settings.jsx(내 언어·표시 모드)와 onboarding.jsx(안내를 봤는지)가 같이 쓴다 — 두 벌을
// 만들지 않으려고 올려 둔 것이다. 키 이름은 쓰는 쪽이 각자 들고 있다(여기에 모으면 서로
// 상관없는 두 기능이 한 파일을 통해 엮인다).

export function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 못 해도 화면은 그대로 동작한다 */
  }
}
