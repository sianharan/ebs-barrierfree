// ③ 읽어주기 OpenAI TTS — Vercel 서버리스 함수.
//
// 프론트(lib/tts.js 의 createOpenAITTS)가 { text, lang } 을 POST 하면, OpenAI TTS 로
// 음성을 합성해 mp3 바이너리로 돌려준다. API 키는 서버에서만 읽고(process.env.OPENAI_API_KEY)
// 프론트에 절대 노출하지 않는다(AGENTS.md: 키 필요한 호출은 반드시 /api 경유).
//
// 모델: 기본 gpt-4o-mini-tts(언어 지시 instructions 지원). tts-1 로 바꾸려면 환경변수
// OPENAI_TTS_MODEL=tts-1. OpenAI voice 는 언어 중립이라(모델이 입력 텍스트로 언어 인식)
// voice 는 고정하되, gpt-4o 계열에선 lang 으로 발음 언어를 지시해 베트남어 등 품질을 높인다.

// 언어 코드 → 영어 표기(instructions 용). 언어는 데이터로 관리(AGENTS.md) — 추가 시 여기만 보강.
const LANG_NAMES = {
  ko: 'Korean',
  en: 'English',
  vi: 'Vietnamese',
  zh: 'Chinese',
  ja: 'Japanese',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY 가 설정되지 않았습니다.' });
  }

  // Vercel Node 함수는 application/json 본문을 자동 파싱(req.body). 문자열로 올 때를 대비해 보강.
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { text, lang } = body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text(문자열)가 필요합니다.' });
  }

  const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = process.env.OPENAI_TTS_VOICE || 'alloy';

  const payload = {
    model,
    voice,
    input: text,
    response_format: 'mp3',
  };
  // gpt-4o 계열만 instructions 를 받는다(tts-1 은 무시/거부). 발음 언어를 명시해 품질 보강.
  if (model.startsWith('gpt-4o') && LANG_NAMES[lang]) {
    payload.instructions = `Read the text aloud naturally and clearly in ${LANG_NAMES[lang]}.`;
  }

  try {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'OpenAI TTS 요청 실패', detail });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(500).json({ error: 'TTS 처리 중 오류', detail: String(err) });
  }
}
