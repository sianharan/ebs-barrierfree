// 콘텐츠 상세 페이지(영상) 뼈대 — Phase 2 ①이중자막 1단계.
// 지금은 영상 + 제목(한국어)만. 이중자막·대본 패널·번역 표시 등은 이후 단계에서 얹는다.
import VideoPlayer from './components/VideoPlayer.jsx';
import { getContent } from './lib/content.js';

export default function App() {
  const content = getContent();

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      {/* 상단 바(뼈대) — 컨트롤(번역 표시·검색·내 언어·AI 도구)은 이후 단계 */}
      <header className="border-b border-ink/10 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-3">
          <span className="font-title text-xl text-logo-navy">EBS 배리어프리</span>
        </div>
      </header>

      {/* 콘텐츠 상세 */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <article className="flex flex-col gap-4">
          {/* 모국어는 일단 베트남어(vi) 고정 — 언어 선택 UI는 이후 단계 */}
          <VideoPlayer
            src={content.videoUrl}
            title={content.title?.ko}
            segments={content.segments}
            subtitleLangs={['ko', 'vi']}
          />

          <h1 className="font-title text-2xl text-logo-navy md:text-3xl">
            {content.title?.ko}
          </h1>
        </article>
      </main>
    </div>
  );
}
