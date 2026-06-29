// 콘텐츠 상세 페이지(영상) — Phase 2 ①이중자막 + ②번역(언어/표시 모드).
// 제목·설명·해시태그는 content.json 의 다국어 필드를, UI 라벨은 ui-strings.json(t())을 거친다.
// 표시 언어는 전역 설정(내 언어·번역 표시 모드)에서 파생 — 자막과 같은 규칙(useDisplayLangs).
import VideoPlayer from './components/VideoPlayer.jsx';
import TopBar from './components/TopBar.jsx';
import { getContent } from './lib/content.js';
import { useSettings, useDisplayLangs } from './lib/settings.jsx';
import { t } from './lib/i18n.js';

export default function App() {
  const content = getContent();
  const { myLang } = useSettings();
  const displayLangs = useDisplayLangs(); // 첫 번째 = 주 언어
  const [primary, ...secondary] = displayLangs;

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <TopBar />

      {/* 콘텐츠 상세 */}
      <main className="mx-auto max-w-5xl px-4 py-6">
        <article className="flex flex-col gap-5">
          <VideoPlayer
            src={content.videoUrl}
            title={content.title?.ko}
            segments={content.segments}
            subtitleLangs={displayLangs}
          />

          {/* 제목 — 주 언어는 크게(h1), 보조 언어는 그 아래 */}
          <header className="flex flex-col gap-1">
            <h1 className="font-title text-2xl text-logo-navy md:text-3xl">
              {content.title?.[primary]}
            </h1>
            {secondary.map((lang) => (
              <p key={lang} className="font-title text-lg text-ink/60 md:text-xl">
                {content.title?.[lang]}
              </p>
            ))}
          </header>

          {/* 설명 */}
          <section className="flex flex-col gap-1">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink/50">
              {t('content.description', myLang)}
            </h2>
            <p className="text-base leading-relaxed text-ink md:text-lg">
              {content.description?.[primary]}
            </p>
            {secondary.map((lang) => (
              <p key={lang} className="text-sm leading-relaxed text-ink/60 md:text-base">
                {content.description?.[lang]}
              </p>
            ))}
          </section>

          {/* 해시태그 — 태그마다 표시 언어를 ' · ' 로 묶어 한 칩에 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-ink/50">
              {t('content.hashtags', myLang)}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {(content.hashtags || []).map((tag, i) => (
                <li
                  key={i}
                  className="rounded-full bg-brand-blue/15 px-3 py-1 text-sm font-medium text-brand-deepblue"
                >
                  #{displayLangs.map((lang) => tag[lang]).join(' · ')}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
    </div>
  );
}
