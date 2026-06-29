// 콘텐츠 상세 페이지(영상) — Phase 2 ①이중자막 + ②번역(언어/표시 모드).
// 자막 언어는 전역 설정(내 언어·번역 표시 모드)에서 파생한다.
import VideoPlayer from './components/VideoPlayer.jsx';
import TopBar from './components/TopBar.jsx';
import { getContent } from './lib/content.js';
import { useSettings, subtitleLangsFor } from './lib/settings.jsx';

export default function App() {
  const content = getContent();
  const { displayMode, myLang } = useSettings();
  const subtitleLangs = subtitleLangsFor(displayMode, myLang);

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <TopBar />

      {/* 콘텐츠 상세 */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <article className="flex flex-col gap-4">
          <VideoPlayer
            src={content.videoUrl}
            title={content.title?.ko}
            segments={content.segments}
            subtitleLangs={subtitleLangs}
          />

          <h1 className="font-title text-2xl text-logo-navy md:text-3xl">
            {content.title?.ko}
          </h1>
        </article>
      </main>
    </div>
  );
}
