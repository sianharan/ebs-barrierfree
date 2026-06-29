// 오디오 컨트롤러 — "한 번에 한 목소리"(AGENTS.md). 모든 재생이 이 한 곳을 거친다.
//
// 세 소리(읽어주기③·더빙⑥·영상 원음)가 한 채널을 공유하므로, 동시에 둘이 나지 않도록
// 모든 재생을 이 매니저로 모은다. 지금 단계(③ 2단계)는 읽어주기↔영상 원음 관계만 다룬다.
// 더빙(⑥)은 우선순위(읽어주기 > 더빙 > 원음)와 원음 더킹을 이 파일에 덧붙이며 추가한다.
//
// 우선순위(AGENTS.md): 1) 읽어주기(③/⑤발음) 2) 더빙(⑥) 3) 영상 원음.
// 동작 규칙(현재 구현 범위):
//  - 읽어주기 시작 → 영상이 재생 중이었으면 일시정지(상태 기억) → 읽기 끝나면 자동 재개.
//  - 새 읽어주기 시작 → 이전 읽어주기 즉시 취소(연타해도 안 겹침). 줄을 바꿔도 영상은 계속 멈춤 유지.
//  - 현재 무엇이 재생 중인지 구독자(UI)에게 알린다 → 읽는 줄/버튼에 시각 신호.

import { speak as ttsSpeak, cancel as ttsCancel, isSupported as ttsSupported } from './tts.js';

// --- 구독 가능한 재생 상태(UI 표시용) --------------------------------------
// source: 'read' | null (더빙은 ⑥에서 'dub' 추가). activeId: 재생 중인 항목의 키(읽는 줄 식별).
let state = { source: null, activeId: null };
const listeners = new Set();

function setState(next) {
  state = next;
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// useSyncExternalStore 용 — 항상 같은 참조를 돌려줘 불필요한 리렌더를 막는다(setState 때만 교체).
export function getState() {
  return state;
}

// --- 영상(원음) 제어 등록 ---------------------------------------------------
// 버스가 영상을 일시정지/재개(추후 더킹)한다. App 이 <video> 엘리먼트를 등록한다.
let video = null;
let readActive = false; // 읽기 세션 진행 중 여부(줄 전환 시 영상 상태를 덮어쓰지 않게)
let videoWasPlaying = false;

export function registerVideo(el) {
  video = el;
  return () => {
    if (video === el) video = null;
  };
}

// 읽기 세션 시작 시 1회만: 영상이 재생 중이었는지 기억하고 일시정지. 줄을 바꿀 땐(이미 세션 중) 보존.
function beginReadSession() {
  if (readActive) return;
  readActive = true;
  if (video) {
    videoWasPlaying = !video.paused;
    if (videoWasPlaying) video.pause();
  }
}

// 읽기 세션 종료 시 1회만: 시작 때 재생 중이었으면 영상 자동 재개.
function endReadSession() {
  if (!readActive) return;
  readActive = false;
  if (video && videoWasPlaying) video.play?.();
  videoWasPlaying = false;
}

// --- 읽어주기(③) -----------------------------------------------------------
function finish(id) {
  // 이미 다른 읽기가 시작됐다면(줄 전환) 무시 — 영상은 계속 멈춤 유지.
  if (state.activeId !== id) return;
  setState({ source: null, activeId: null });
  endReadSession();
}

// 한 줄을 읽는다. id 는 줄을 식별하는 안정 키(예: 'seg-3'). 새 읽기는 이전 읽기를 취소한다.
export function playReadAloud({ id, text, lang }) {
  beginReadSession(); // 처음 시작할 때만 영상 일시정지·상태 기억
  setState({ source: 'read', activeId: id });
  ttsSpeak({
    text,
    lang,
    onEnd: () => finish(id),
    onError: () => finish(id),
  });
}

// 읽어주기를 멈춘다. id 를 주면 그 줄이 현재 읽는 줄일 때만 멈춘다(다른 줄 토글에 영향 없음).
export function stopReadAloud(id) {
  if (id != null && state.activeId !== id) return;
  ttsCancel(); // 취소 → tts onEnd → finish 가 상태 정리·영상 재개를 처리.
}

export function isReadAloudSupported() {
  return ttsSupported();
}
