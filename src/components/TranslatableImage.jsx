// ② 이미지 번역 오버레이 — Phase 2.
//
// 원본 이미지 위에, images.json 의 regions(정규화 bbox + 다국어 text)를 자리마다 덮어
// 화면 속 한국어를 번역으로 바꿔 보여준다. 이미지를 재합성하지 않고 오버레이만 얹는다(AGENTS.md ②).
//
// 핵심: 원본 한국어를 '불투명' 배경(logo-navy)으로 완전히 가리고 그 위에 번역을 얹는다.
// 반투명이면 원본 글자가 비쳐 번역과 겹쳐 뭉개지므로, 배경은 불투명 + 원본 영역보다 조금 크게 덮는다.
//
// 표시 규칙(전역 '번역 표시 모드' 하나가 텍스트·자막·이미지를 함께 제어):
//  - langs = ['ko']            → 오버레이 없음(원본에 이미 한국어가 있으므로 그대로 둔다).
//  - langs = ['ko', myLang]    → region 마다 ko + 내 언어를 겹쳐 덮는다(함께).
//  - langs = [myLang]          → region 마다 내 언어만 덮는다(모국어만 — 이미지 속 한국어가 바뀐 것처럼).
//
// bbox = [x, y, width, height] (0~1 정규화, 좌상단 원점). 컨테이너 크기와 무관하게 % 로 배치한다.
// 오버레이 텍스트는 컨테이너 폭(@container)에 비례(cqi)해 작은 카드~큰 상세 어디서든 또렷하게 커진다.
//
// children: 배지·재생 아이콘 등 이미지 위 UI(오버레이 위에 겹쳐 렌더).

import { memo } from 'react';

// 원본 글자가 가장자리로 새지 않도록 덮개를 원본 영역보다 살짝 키운다(정규화 좌표 기준 여유).
const PAD_X = 0.015;
const PAD_Y = 0.015;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

// ── 덮개 자동 맞춤 ───────────────────────────────────────────────────────────
// 원본 bbox 는 '한국어가 차지하던 자리'다. 번역은 언어마다 길이가 크게 달라(같은 문구가
// ko 6자 ↔ fr 25자) 좁은 영역에서는 3~4줄로 접히며 답답해진다. 특히 좌상단 브랜딩 배지는
// bbox 폭이 이미지의 15% 남짓이라 라틴·키릴 계열에서 반드시 터진다.
//
// 그래서 렌더 전에 텍스트 폭을 근사해 (1) 필요한 만큼만 덮개를 넓히고 (2) 그래도 모자라면
// 폰트를 줄여, 어떤 언어에서도 목표 줄 수 안에 들어오게 한다. 추정이 빗나가도 line-clamp 가
// 마지막 방어선이라 줄 수는 절대 초과하지 않는다.

const BASE_PRIMARY = 4; // cqi — 주 언어 기본 크기
const BASE_SECONDARY = 3; // cqi — 보조 언어 기본 크기
const MIN_SCALE = 0.62; // 카드 썸네일에서도 읽히는 하한(4cqi → 2.5cqi)
const PAD_INLINE = 1.2; // px-[1.2cqi] — 좌우 합 2.4cqi
const WRAP_FILL = 0.92; // 단어 단위 줄바꿈이라 마지막 줄은 늘 남는다(두 줄 이상일 때만 적용)
const SAFETY = 1.06; // 폭 추정 오차 여유 — 경계에 딱 맞춰두면 실측에서 한 줄씩 밀린다
const MAX_GROW_W = 0.46; // 넓히더라도 이미지의 46% 까지만 — 화면을 과하게 덮지 않게
const LABEL_MAX_W = 0.3; // 이보다 좁은 원본 영역은 '라벨'로 보고 한 줄에 맞춘다
// 덮개가 이미지 가장자리에 이만큼 가까우면 아예 끝까지 붙인다.
// bbox 가 원본 글자를 아슬하게 자르는 경우가 있어(좌상단 브랜딩은 x≈0 부터 시작하는데
// bbox 는 0.03) 그대로 두면 덮개 옆으로 원본 한국어가 얇게 새어 보인다.
const EDGE_SNAP = 0.04;

// 글자 폭 근사(em) — 문자 계열마다 평균 자폭이 달라 계수를 나눈다.
// 실측(headless 렌더)에서 라틴 0.52 는 과소평가라 키릴·태국이 한 줄씩 밀렸다.
// 태국어 위/아래 성조·모음 부호는 자리를 차지하지 않으므로 0.
const FULLWIDTH = /[぀-ヿ㐀-䶿一-鿿가-힣！-｠]/; // 한글·가나·한자·전각
const CYRILLIC = /[Ѐ-ӿ]/;
const THAI = /[฀-๿]/;
const THAI_MARK = /[ัิ-ฺ็-๎]/;
// 베트남어 성조 결합 글자 — 본문 폰트에 없어 더 넓은 폴백 폰트로 그려진다.
// 같은 글자 수의 영어보다 실제 폭이 눈에 띄게 커서 따로 센다.
const VIET = /[Ā-ɏẠ-ỿ]/;

function charEm(ch) {
  if (THAI_MARK.test(ch)) return 0;
  if (FULLWIDTH.test(ch)) return 1;
  if (THAI.test(ch)) return 0.62;
  if (CYRILLIC.test(ch)) return 0.58;
  if (VIET.test(ch)) return 0.75;
  return 0.55; // 라틴(영·스·불·인니) — 소문자·악센트 포함 평균
}

function advanceEm(s = '') {
  let em = 0;
  for (const ch of s) em += charEm(ch);
  return em;
}

// 표시할 텍스트들을 maxLines 안에 담기 위한 덮개 폭(정규화)과 폰트 배율을 구한다.
function fitOverlay(lines, naturalW, maxLines) {
  const fill = maxLines > 1 ? WRAP_FILL : 1;
  // 기본 폰트로 maxLines 안에 들어가려면 필요한 '안쪽 폭'(cqi = 컨테이너 폭의 1%).
  const needInner = Math.max(
    ...lines.map(({ text, base }) => (advanceEm(text) * SAFETY * base) / (maxLines * fill)),
  );
  const needW = (needInner + PAD_INLINE * 2) / 100;

  // 넓히기는 하되 원본보다 좁아지지 않고, 확장 상한(또는 원본 폭)을 넘지 않는다.
  const width = Math.min(Math.max(naturalW, needW), Math.max(naturalW, MAX_GROW_W));
  const inner = width * 100 - PAD_INLINE * 2;
  const scale = Math.max(MIN_SCALE, Math.min(1, inner / needInner));
  return { width, scale };
}

function Region({ region, langs }) {
  const [bx, by, bw, bh] = region.bbox;
  const [primary, ...secondary] = langs;
  const text = region.text || {};
  if (!text[primary]) return null;

  // 원본 영역 중심을 유지한 채 상하좌우로 여유를 둔 '덮개' 사각형.
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const naturalW = Math.min(1, bw + PAD_X * 2);
  const h = Math.min(1, bh + PAD_Y * 2);
  const top = clamp01(cy - h / 2);

  // 좁은 라벨(좌상단 브랜딩 배지)은 한 줄, 넓은 자막/제목 영역은 두 줄까지.
  const maxLines = naturalW < LABEL_MAX_W ? 1 : 2;
  const shown = [
    { text: text[primary], base: BASE_PRIMARY },
    ...secondary.filter((l) => text[l]).map((l) => ({ text: text[l], base: BASE_SECONDARY })),
  ];
  const { width: fitW, scale } = fitOverlay(shown, naturalW, maxLines);

  // 넓힐 때는 가까운 쪽 가장자리를 고정해 원래 자리(좌상단 배지는 좌측)를 지킨다.
  // 넓히지 않았다면 기존처럼 원본 중심에 맞춘다.
  const naturalLeft = cx - naturalW / 2;
  const grown = fitW > naturalW + 1e-6;
  const rawLeft = grown
    ? cx < 0.5
      ? naturalLeft
      : naturalLeft + naturalW - fitW
    : cx - fitW / 2;

  // 가장자리에 가까우면 끝까지 붙여 원본이 새지 않게 한다.
  let l = Math.min(Math.max(0, rawLeft), Math.max(0, 1 - fitW));
  let r = l + fitW;
  if (l < EDGE_SNAP) l = 0;
  if (r > 1 - EDGE_SNAP) r = 1;
  const left = l;
  const w = r - l;

  return (
    <div
      // 세로 중심을 원본에 맞춰(translateY) 정렬. min-height 로 원본 높이를 최소 보장하되,
      // 번역이 길면 세로로 늘어나 배경(불투명) 안에서 자연스럽게 감싼다 — 원본이 절대 비치지 않게.
      className="pointer-events-none absolute z-[5] flex flex-col items-center justify-center gap-[0.4cqi] overflow-hidden rounded-[0.8cqi] bg-logo-navy px-[1.2cqi] py-[0.6cqi] text-center leading-[1.15] text-white shadow-md ring-1 ring-white/10"
      style={{
        left: `${left * 100}%`,
        top: `${(top + h / 2) * 100}%`,
        width: `${w * 100}%`,
        minHeight: `${h * 100}%`,
        transform: 'translateY(-50%)',
      }}
    >
      {/* line-clamp 는 추정이 빗나갔을 때의 마지막 방어선 — 줄 수 초과 대신 말줄임. */}
      <span
        className={`font-title font-bold [text-wrap:balance] ${maxLines === 1 ? 'line-clamp-1' : 'line-clamp-2'}`}
        style={{ fontSize: `${(BASE_PRIMARY * scale).toFixed(2)}cqi` }}
      >
        {text[primary]}
      </span>
      {secondary.map((lang) =>
        text[lang] ? (
          <span
            key={lang}
            className={`font-title text-brand-yellow [text-wrap:balance] ${maxLines === 1 ? 'line-clamp-1' : 'line-clamp-2'}`}
            style={{ fontSize: `${(BASE_SECONDARY * scale).toFixed(2)}cqi` }}
          >
            {text[lang]}
          </span>
        ) : null,
      )}
    </div>
  );
}

function TranslatableImage({ image, langs = ['ko'], alt = '', className = '', children }) {
  // 원본 한국어만 볼 때(langs=['ko'])는 오버레이가 필요 없다.
  const showOverlay = !(langs.length === 1 && langs[0] === 'ko');
  const regions = Array.isArray(image?.regions) ? image.regions : [];

  return (
    <div className={`@container relative overflow-hidden ${className}`}>
      {image?.src ? (
        <img src={image.src} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        // 전처리 이미지가 없을 때의 폴백(브랜드 틴트) — 크래시 없이 배지·아이콘만 얹힌다.
        <div className="absolute inset-0 bg-gradient-to-br from-brand-blue/30 to-logo-navy/20" />
      )}

      {showOverlay &&
        regions.map((region, i) => <Region key={i} region={region} langs={langs} />)}

      {children}
    </div>
  );
}

export default memo(TranslatableImage);
