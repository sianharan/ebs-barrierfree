// 의미 공간 근사 시각화 — /pipeline 의미 검색 데모.
//
// 진짜 1536차원 임베딩을 PCA·t-SNE 로 눌러 담은 그림이 아니다. 콘텐츠가 3개뿐이라
// 차원축소를 해도 배치가 흔들리기만 하고 읽히는 게 없다. 대신 유사도 점수를 그대로
// 거리로 바꿔 그린다 — 뜻이 통할수록 질의점에 가깝다는 한 가지만 정확히 보여준다.
// (근사임을 화면에도 적어 둔다. 설명하는 화면이 스스로를 오해시키면 안 된다.)
//
// 각도는 콘텐츠마다 고정하고 반지름만 점수로 바꾼다. 그래서 질의를 갈아 끼우면 점들이
// 방사형으로 다가오고 멀어진다 — 자리바꿈이 아니라 '거리 변화'로 읽힌다.
//
// 접근성: 이 그림이 말하는 내용은 옆의 결과 카드가 글로 다 담고 있다. 그래서 그림 자체는
// role=img + 요약 alt 하나로 두고, 점마다 읽히게 만들지 않는다(같은 말을 두 번 읽히지 않게).

// 좌표계. 실제 픽셀이 아니라 viewBox 단위라 화면 폭이 바뀌어도 배치 비율은 그대로다.
const W = 340;
const H = 240;
const CX = W / 2;
const CY = H / 2;

// 점수 → 반지름. 경계는 실제 관측 범위에 맞춘다 — 교차언어 코사인 유사도는 0.17~0.38 근처에
// 모이므로(text-embedding-3-small), 0.6 같은 교과서적 상한을 쓰면 전부 바깥에 뭉쳐 붙어
// 순위 차이가 눈에 안 보인다. 문턱 아래(결과에 안 잡힌) 콘텐츠는 점수 0 으로 들어와 가장 바깥.
const SCORE_NEAR = 0.4;
const SCORE_FAR = 0.15;
const R_MIN = 46;
const R_MAX = 90;

const clamp01 = (n) => Math.min(1, Math.max(0, n));

function radiusFor(score) {
  const far = clamp01((SCORE_NEAR - score) / (SCORE_NEAR - SCORE_FAR));
  return R_MIN + (R_MAX - R_MIN) * far;
}

// 콘텐츠마다 고정 각도(위에서 시작해 균등 배분). 점수가 바뀌어도 각도는 그대로다.
//
// 점수 라벨은 늘 '중심 반대쪽'에 붙인다. 아래로 고정하면, 위쪽 점이 높은 점수로 가운데까지
// 다가왔을 때 그 라벨이 질의점 라벨 위에 겹쳐 앉는다(점수가 높을수록 안 보이게 되는 셈).
function positionFor(index, count, score) {
  const deg = -90 + index * (360 / count);
  const rad = (deg * Math.PI) / 180;
  const r = radiusFor(score);
  const above = Math.sin(rad) < 0;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad), labelY: above ? -23 : 31 };
}

export default function SimilarityScatter({ items, queryLabel, alt }) {
  const count = items.length || 1;
  const placed = items.map((item, i) => ({ ...item, ...positionFor(i, count, item.score) }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={alt}
    >
      {/* 거리 눈금 — 가운데가 가까움. 배경이라 흐리게. */}
      {[R_MIN, (R_MIN + R_MAX) / 2, R_MAX].map((r) => (
        <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="currentColor" className="text-ink/10" strokeWidth="1" />
      ))}

      {/* 질의 ↔ 콘텐츠 연결선. 가장 가까운 하나만 점선으로 강조하고 나머지는 흐린 실선. */}
      {placed.map((p) => (
        <line
          key={p.contentId}
          x1={CX}
          y1={CY}
          x2={p.x}
          y2={p.y}
          stroke="currentColor"
          strokeWidth={p.isTop ? 2 : 1}
          strokeDasharray={p.isTop ? '5 4' : undefined}
          className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
            p.isTop ? 'text-brand-deepblue' : 'text-ink/15'
          }`}
        />
      ))}

      {/* 콘텐츠 점 — 번호는 옆 결과 카드의 번호와 짝이다(제목을 그림에 넣으면 언어마다 잘린다). */}
      {placed.map((p) => (
        <g
          key={p.contentId}
          style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          className="transition-transform duration-700 ease-out motion-reduce:transition-none"
        >
          {/* 문턱 아래(점수 0)는 테두리를 점선으로 — '멀다'와 '아예 안 걸렸다'는 다른 상태다. */}
          <circle
            r="15"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={p.score > 0 ? undefined : '3 3'}
            className={
              p.isTop
                ? 'fill-brand-deepblue text-brand-deepblue'
                : p.score > 0
                  ? 'fill-white text-brand-deepblue/40'
                  : 'fill-white text-ink/25'
            }
          />
          <text
            textAnchor="middle"
            dy="5"
            fontSize="14"
            className={p.isTop ? 'fill-white font-medium' : 'fill-ink/70'}
          >
            {p.n}
          </text>
          {/* 점수 — 거리만으로는 얼마나 가까운지 못 읽으므로 숫자를 함께 둔다. */}
          <text
            textAnchor="middle"
            y={p.labelY}
            fontSize="11"
            className={p.isTop ? 'fill-brand-deepblue font-medium' : 'fill-ink/45'}
          >
            {p.score > 0 ? `${(p.score * 100).toFixed(0)}%` : '—'}
          </text>
        </g>
      ))}

      {/* 질의점 — 한가운데 고정. 콘텐츠가 이쪽으로 다가온다. */}
      <g>
        <circle cx={CX} cy={CY} r="9" className="fill-logo-navy" />
        <text x={CX} y={CY - 16} textAnchor="middle" fontSize="12" className="fill-logo-navy font-medium">
          {queryLabel}
        </text>
      </g>

    </svg>
  );
}
