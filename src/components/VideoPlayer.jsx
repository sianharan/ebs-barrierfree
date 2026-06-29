// ① 동영상 플레이어 — Phase 2.
//
// content.json 의 videoUrl(EBS VOD CDN 직접 .mp4)을 HTML5 <video> 로 재생하고,
// 그 위에 이중자막(DualSubtitle)을 오버레이한다. 더빙(⑥)은 이후 단계.
//
// 재생시간은 video 의 timeupdate 이벤트로 추적해 자막 컴포넌트에 내려준다.
// (timeupdate 는 브라우저가 초당 약 4회만 발생시키므로 추가 throttle 없이 충분하다.)
//
// CORS 주의: 자막은 영상 호스트의 <track> 이 아니라 로컬 JSON 오버레이로 표시하므로
// 영상에 crossOrigin 이 필요 없다(다른 출처 재생은 localhost·배포 모두 확인됨, AGENTS.md).

import { useRef, useState } from 'react';
import DualSubtitle from './DualSubtitle.jsx';

export default function VideoPlayer({ src, title, segments = [], subtitleLangs = ['ko', 'vi'] }) {
  const videoRef = useRef(null);
  const [time, setTime] = useState(0);

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
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        aria-label={title ? `${title} 동영상 플레이어` : '동영상 플레이어'}
      >
        이 브라우저는 동영상 재생을 지원하지 않습니다.
      </video>

      {segments.length > 0 && (
        <DualSubtitle segments={segments} time={time} langs={subtitleLangs} />
      )}
    </div>
  );
}
