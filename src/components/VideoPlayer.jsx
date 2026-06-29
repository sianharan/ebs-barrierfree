// ① 동영상 플레이어 — Phase 2.
//
// content.json 의 videoUrl(EBS VOD CDN 직접 .mp4)을 HTML5 <video> 로 재생하고,
// 그 위에 이중자막(DualSubtitle)을 오버레이한다. 더빙(⑥)은 이후 단계.
//
// 재생시간/시킹은 App 이 소유한다(대본 패널과 공유해야 하므로):
//  - videoRef: App 이 넘긴 ref. 대본 줄 클릭 시 App 이 이 ref 로 currentTime 을 옮긴다.
//  - onTimeUpdate(seconds): timeupdate 마다 현재 시각을 App 으로 올린다(초당 약 4회).
//  - activeSegment: App 이 계산한 현재 세그먼트(자막 표시용).
//
// CORS 주의: 자막은 <track> 이 아니라 로컬 JSON 오버레이라 crossOrigin 불필요(AGENTS.md).

import DualSubtitle from './DualSubtitle.jsx';

export default function VideoPlayer({
  src,
  title,
  videoRef,
  onTimeUpdate,
  activeSegment,
  subtitleLangs = ['ko', 'vi'],
}) {
  if (!src) {
    return (
      <div className="aspect-video w-full grid place-items-center rounded-xl bg-ink/5 text-ink/60">
        영상 주소(videoUrl)가 없습니다.
      </div>
    );
  }

  return (
    // 16:9 컨테이너 — 라운드 12px(카드), 검은 배경으로 레터박스 처리. relative: 자막 오버레이 기준.
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
      <video
        ref={videoRef}
        className="h-full w-full"
        src={src}
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
        aria-label={title ? `${title} 동영상 플레이어` : '동영상 플레이어'}
      >
        이 브라우저는 동영상 재생을 지원하지 않습니다.
      </video>

      <DualSubtitle segment={activeSegment} langs={subtitleLangs} />
    </div>
  );
}
