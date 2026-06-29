// ① 동영상 플레이어 — Phase 2 1단계: 영상 재생 토대만.
//
// content.json 의 videoUrl(EBS VOD CDN 직접 .mp4)을 HTML5 <video> 로 재생한다.
// 자막(①이중자막)·더빙(⑥)은 이후 단계에서 이 위에 얹는다. 지금은 네이티브 컨트롤만 노출.
//
// CORS 주의: 자막은 영상 호스트의 <track> 이 아니라 로컬 JSON 오버레이로 표시하므로
// 영상에 crossOrigin 이 필요 없다(다른 출처 재생은 localhost·배포 모두 확인됨, AGENTS.md).

export default function VideoPlayer({ src, title }) {
  if (!src) {
    return (
      <div className="aspect-video w-full grid place-items-center rounded-xl bg-ink/5 text-ink/60">
        영상 주소(videoUrl)가 없습니다.
      </div>
    );
  }

  return (
    // 16:9 컨테이너 — 라운드 12px(카드), 검은 배경으로 레터박스 처리.
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
      <video
        className="h-full w-full"
        src={src}
        controls
        preload="metadata"
        playsInline
        aria-label={title ? `${title} 동영상 플레이어` : '동영상 플레이어'}
      >
        이 브라우저는 동영상 재생을 지원하지 않습니다.
      </video>
    </div>
  );
}
