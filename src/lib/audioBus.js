// 오디오 컨트롤러 — "한 번에 한 목소리"(AGENTS.md). 모든 재생이 이 한 곳을 거친다.
//
// 세 소리(읽어주기③·더빙⑥·영상 원음)가 한 채널을 공유하므로, 동시에 둘이 나지 않도록
// 모든 재생을 이 매니저로 모은다.
//
// 우선순위(AGENTS.md): 1) 읽어주기(③/⑤발음) 2) 더빙(⑥) 3) 영상 원음.
// 동작 규칙:
//  - 읽어주기 시작 → 영상 원음·더빙 모두 일시정지(상태 기억) → 읽기 끝나면 자동 복귀.
//  - 더빙 켜짐 → 원음 더킹(20%로 낮춤). 영상 타임코드에 맞춰 현재 구간의 mp3 를 재생(A방식, 사전 생성).
//  - 길이 맞춤: 더빙이 자막 구간보다 짧으면 침묵 허용(대기), 길면 영상을 일시정지했다가 음성 끝나면 재개.
//  - 새 음성 시작 → 이전 음성 즉시 취소(연타·구간 전환에도 안 겹침).
//  - 현재 무엇이 재생 중인지 구독자(UI)에게 알린다 → 버튼/배지 시각 신호.

import { speak as ttsSpeak, cancel as ttsCancel, isSupported as ttsSupported } from './tts.js';

const DUCK_VOLUME = 0.2; // 더빙 켜짐 시 영상 원음 볼륨(20% 더킹).

// --- 구독 가능한 재생 상태(UI 표시용) --------------------------------------
// source: 'read' | 'dub' | null. activeId: 현재 소리 내는 항목의 키. dubOn: 더빙 토글 상태.
let state = { source: null, activeId: null, dubOn: false };
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// useSyncExternalStore 용 — setState 때만 참조가 바뀐다.
export function getState() {
  return state;
}

// --- 영상(원음) 제어 등록 ---------------------------------------------------
let video = null;
let readActive = false; // 읽기 세션 진행 중 여부(줄 전환 시 영상 상태를 덮어쓰지 않게)
let videoWasPlaying = false;

export function registerVideo(el) {
  video = el;
  if (el) {
    el.addEventListener('timeupdate', onVideoTime);
    el.addEventListener('pause', onVideoPause);
    el.addEventListener('play', onVideoPlay);
  }
  return () => {
    if (el) {
      el.removeEventListener('timeupdate', onVideoTime);
      el.removeEventListener('pause', onVideoPause);
      el.removeEventListener('play', onVideoPlay);
    }
    if (video === el) video = null;
  };
}

// 읽기 세션 시작 시 1회: 영상이 재생 중이었는지 기억하고 일시정지 + 더빙 음성도 멈춤(우선순위).
function beginReadSession() {
  if (readActive) return;
  readActive = true;
  if (video) {
    videoWasPlaying = !video.paused;
    if (videoWasPlaying) video.pause();
  }
  // 더빙(⑥)은 읽어주기(③)보다 우선순위가 낮다 → 읽는 동안 더빙 음성 일시정지.
  if (dubAudio && !dubAudio.paused) {
    dubPausedForRead = true;
    dubAudio.pause();
  }
}

// 읽기 세션 종료 시 1회: 시작 때 재생 중이었으면 영상 재개 + 멈췄던 더빙 음성 재개.
function endReadSession() {
  if (!readActive) return;
  readActive = false;
  if (video && videoWasPlaying) video.play?.();
  videoWasPlaying = false;
  if (dubPausedForRead && dubAudio) {
    dubPausedForRead = false;
    dubAudio.play?.();
    if (dubOn) setState({ source: 'dub', activeId: dubSegId });
  }
}

// --- 읽어주기(③) -----------------------------------------------------------
function finish(id) {
  // 이미 다른 읽기가 시작됐다면(줄 전환) 무시 — 영상은 계속 멈춤 유지.
  if (state.activeId !== id || state.source !== 'read') return;
  setState({ source: null, activeId: null });
  endReadSession();
}

// 한 줄을 읽는다. id 는 줄을 식별하는 안정 키(예: 'seg-3'). 새 읽기는 이전 읽기를 취소한다.
export function playReadAloud({ id, text, lang }) {
  beginReadSession(); // 처음 시작할 때만 영상·더빙 일시정지·상태 기억
  setState({ source: 'read', activeId: id });
  ttsSpeak({
    text,
    lang,
    onEnd: () => finish(id),
    onError: () => finish(id),
  });
}

// 읽어주기를 멈춘다. id 를 주면 그 줄이 현재 읽는 줄일 때만 멈춘다.
export function stopReadAloud(id) {
  if (id != null && state.activeId !== id) return;
  ttsCancel(); // 취소 → tts onEnd → finish 가 상태 정리·영상/더빙 재개를 처리.
}

export function isReadAloudSupported() {
  return ttsSupported();
}

// --- 더빙(⑥) ---------------------------------------------------------------
// 영상 타임코드에 맞춰 현재 구간의 사전 생성 mp3(dub-{lang}.json 의 audio)를 재생한다.
let dubOn = false;
let dubSegments = null;   // [{ id, start, end, duration, audio }] (start 오름차순)
let dubById = null;       // id → 세그먼트
let dubAudio = null;      // 현재 재생 중인 더빙 Audio
let dubSegId = null;      // 현재 더빙 중인(또는 막 끝낸) 구간 id
let dubHolding = false;   // 더빙이 구간보다 길어 영상을 멈추고 대기 중
let dubPausedForRead = false; // 읽어주기 때문에 멈춘 더빙(끝나면 재개)
let dubPausedByUser = false;  // 사용자가 영상을 멈춰 같이 멈춘 더빙

function dubSegAt(t) {
  if (!dubSegments) return null;
  // 구간은 [start, end). 333개 수준이라 선형 탐색으로 충분(timeupdate ~4Hz).
  for (const s of dubSegments) {
    if (t >= s.start && t < s.end) return s;
  }
  return null;
}

// 새 구간의 더빙 클립을 시작(이전 클립은 정리). 읽기 중이면 호출되지 않는다.
function startDubClip(seg) {
  stopDubClip();
  dubSegId = seg.id;
  dubHolding = false;
  const audio = new Audio(seg.audio);
  dubAudio = audio;
  audio.onended = () => onDubEnded(audio);
  audio.onerror = () => onDubEnded(audio); // 누락/오류는 종료로 취급(침묵)
  audio.play?.().catch(() => {});
  setState({ source: 'dub', activeId: seg.id });
}

function stopDubClip() {
  if (dubAudio) {
    dubAudio.onended = null;
    dubAudio.onerror = null;
    dubAudio.pause();
    dubAudio = null;
  }
}

function onDubEnded(audio) {
  if (audio !== dubAudio) return;
  dubAudio.onended = null;
  dubAudio.onerror = null;
  dubAudio = null;
  if (dubHolding) {
    // 더빙이 구간보다 길어 영상을 멈춰뒀다 → 음성이 끝났으니 영상 재개(다음 구간으로 진행).
    dubHolding = false;
    if (!readActive) video?.play?.();
  }
  // 더빙이 짧아 먼저 끝난 경우엔 그대로 침묵(다음 구간 진입 시 새 클립). 소리는 멎었으니 표시 해제.
  if (state.source === 'dub') setState({ source: null, activeId: null });
}

// 영상 진행에 맞춰 더빙을 구동(timeupdate 마다). 읽기 중이면 더빙은 양보한다.
function onVideoTime() {
  if (!dubOn || !video || readActive) return;
  const t = video.currentTime;

  // 길이 맞춤(길 때): 현재 더빙이 아직 재생 중인데 영상이 구간 끝을 넘었다면 영상을 멈추고 대기.
  if (dubAudio && dubSegId != null) {
    const cur = dubById.get(dubSegId);
    if (cur && t >= cur.end) {
      if (!dubHolding) {
        dubHolding = true;
        video.pause();
      }
      return; // 구간 전환을 보류하고 더빙이 끝나길 기다린다.
    }
  }

  // 현재 시각의 구간으로 전환(다른 구간이면 새 클립 시작).
  const seg = dubSegAt(t);
  if (seg && seg.id !== dubSegId) startDubClip(seg);
}

// 사용자가 영상을 멈추면 더빙도 멈춘다(원음과 한 호흡). 우리가 멈춘 경우(읽기·길이대기)는 제외.
function onVideoPause() {
  if (!dubOn || readActive || dubHolding) return;
  if (dubAudio && !dubAudio.paused) {
    dubAudio.pause();
    dubPausedByUser = true;
  }
}

// 사용자가 영상을 재생하면 멈춰뒀던 더빙을 이어서 재생.
function onVideoPlay() {
  if (!dubOn || readActive) return;
  if (dubPausedByUser && dubAudio) {
    dubPausedByUser = false;
    dubAudio.play?.().catch(() => {});
  }
  // 새 구간 진입 등은 다음 timeupdate 에서 처리.
}

// 더빙 토글. on=true 면 segments(=dub-{lang}.json 의 segments)를 받아 켠다.
export function setDub(on, segments) {
  if (on) {
    dubOn = true;
    dubSegments = Array.isArray(segments) ? segments : [];
    dubById = new Map(dubSegments.map((s) => [s.id, s]));
    if (video) video.volume = DUCK_VOLUME; // 원음 더킹
    setState({ dubOn: true });
    if (video && !video.paused) onVideoTime(); // 재생 중이면 지금 구간부터 즉시 시작
  } else {
    dubOn = false;
    // 길이대기로 영상을 멈춰뒀다면 풀어준다.
    if (dubHolding) {
      dubHolding = false;
      if (!readActive) video?.play?.();
    }
    stopDubClip();
    dubSegId = null;
    dubPausedByUser = false;
    dubPausedForRead = false;
    if (video) video.volume = 1; // 더킹 해제
    setState({ dubOn: false, source: state.source === 'dub' ? null : state.source, activeId: state.source === 'dub' ? null : state.activeId });
  }
}

export function isDubOn() {
  return dubOn;
}
