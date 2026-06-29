// ③ 음성 안내(TTS) 추상화 — 1단계.
//
// 지금은 브라우저 Web Speech API(speechSynthesis)로 구현하되, 음질이 필요하면 OpenAI TTS 로
// 교체할 수 있도록 "엔진" 뒤에 둔다(AGENTS.md ③: 브라우저 TTS 우선 → OpenAI 폴백).
// 교체 시엔 createOpenAITTS() 를 만들어 아래 `engine` 한 줄만 바꾸면 된다(호출부는 그대로).
//
// 오디오 충돌 제어("한 번에 한 목소리": ③⑤발음·⑥더빙·원음)는 audioBus 가 이 엔진을 호출하는
// 다음 단계에서 얹는다 — 이 모듈은 재생/취소와 언어별 voice 선택만 책임진다.

// 언어 코드(ko/en/vi/zh/ja) → BCP-47 후보(앞에서부터 우선). voice 선택과 utterance.lang 에 쓴다.
// 언어는 데이터로 관리(AGENTS.md) — 새 언어는 이 표에 후보만 추가하면 확장된다.
export const LANG_TO_BCP47 = {
  ko: ['ko-KR', 'ko'],
  en: ['en-US', 'en-GB', 'en'],
  vi: ['vi-VN', 'vi'],
  zh: ['zh-CN', 'zh-Hans', 'zh'],
  ja: ['ja-JP', 'ja'],
};

// --- 브라우저 엔진(Web Speech API) -----------------------------------------

function createBrowserTTS() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  // voice 목록은 일부 브라우저(Chrome)에서 비동기로 로드된다(getVoices() 가 처음엔 빈 배열).
  // voiceschanged 이벤트를 한 번 기다리되, 이벤트가 안 오는 환경을 위해 타임아웃 폴백을 둔다.
  let pending = null;
  function ensureVoices() {
    if (!synth) return Promise.resolve([]);
    const have = synth.getVoices();
    if (have && have.length) return Promise.resolve(have);
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener?.('voiceschanged', done, { once: true });
      setTimeout(done, 1000);
    });
    return pending;
  }

  // lang 에 맞는 voice 를 최신 목록에서 고른다(정확 일치 → 접두어 일치 → 없으면 null=브라우저 기본).
  function pickVoice(lang) {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices || voices.length === 0) return null;
    const candidates = LANG_TO_BCP47[lang] || [lang];
    for (const tag of candidates) {
      const exact = voices.find((v) => v.lang?.toLowerCase() === tag.toLowerCase());
      if (exact) return exact;
    }
    for (const tag of candidates) {
      const prefix = tag.split('-')[0].toLowerCase();
      const partial = voices.find((v) => v.lang?.toLowerCase().startsWith(prefix));
      if (partial) return partial;
    }
    return null;
  }

  // 한 구절을 읽는다. 새 음성을 시작하기 전 이전 음성을 즉시 취소(연타해도 겹치지 않게).
  // onEnd 는 정상 종료뿐 아니라 취소(interrupted/canceled) 시에도 호출해, 호출부가 상태를 되돌릴 수 있게 한다.
  async function speak({ text, lang = 'ko', rate = 1, onStart, onEnd, onError } = {}) {
    if (!synth || !text) {
      onError?.(new Error('TTS 미지원 또는 빈 텍스트'));
      return;
    }
    await ensureVoices();
    synth.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || LANG_TO_BCP47[lang]?.[0] || lang;
    u.rate = rate;

    u.onstart = () => onStart?.();
    u.onend = () => onEnd?.();
    u.onerror = (e) => {
      // 취소로 인한 중단은 정상 흐름 — 에러가 아니라 종료로 취급한다.
      if (e.error === 'interrupted' || e.error === 'canceled') onEnd?.();
      else onError?.(e);
    };

    synth.speak(u);
  }

  function cancel() {
    synth?.cancel();
  }

  function isSupported() {
    return !!synth;
  }

  return { speak, cancel, isSupported };
}

// --- 공개 API ---------------------------------------------------------------
// 현재 엔진. OpenAI TTS 로 바꿀 땐 이 한 줄만 교체한다(아래 export 들은 그대로 동작).
const engine = createBrowserTTS();

export function speak(opts) {
  return engine.speak(opts);
}

export function cancel() {
  engine.cancel();
}

export function isSupported() {
  return engine.isSupported();
}
