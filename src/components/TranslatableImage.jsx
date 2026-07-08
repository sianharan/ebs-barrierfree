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

function Region({ region, langs }) {
  const [bx, by, bw, bh] = region.bbox;
  const [primary, ...secondary] = langs;
  const text = region.text || {};
  if (!text[primary]) return null;

  // 원본 영역 중심을 유지한 채 상하좌우로 여유를 둔 '덮개' 사각형.
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const w = Math.min(1, bw + PAD_X * 2);
  const h = Math.min(1, bh + PAD_Y * 2);
  const left = clamp01(cx - w / 2);
  const top = clamp01(cy - h / 2);

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
      <span className="font-title font-bold text-[4cqi] [text-wrap:balance]">{text[primary]}</span>
      {secondary.map((lang) =>
        text[lang] ? (
          <span
            key={lang}
            className="font-title text-[3cqi] text-brand-yellow [text-wrap:balance]"
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
