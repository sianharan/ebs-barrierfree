// 콘텐츠 상세 페이지(영상) — ①이중자막 + ②번역 + ⑤대본 패널 + ③읽어주기 + ⑥더빙.
//
// 재생시간/시킹을 여기서 소유해 영상(자막)과 대본 패널이 공유한다:
//  - time: video timeupdate 로 갱신.
//  - activeIndex: 공용 유틸로 time 에 해당하는 세그먼트를 효율적으로 탐색(hint 근처부터).
//  - handleSeek: 대본 줄 클릭 시 videoRef 로 currentTime 이동.
//
// contentId 로 콘텐츠를 로드한다. 리스트에서 카드/검색 결과를 누르면 이 페이지로 온다.
// 상단 바(공통)의 로고 또는 아래 '목록으로' 버튼으로 리스트로 돌아간다.
// 전처리가 아직 없는 콘텐츠(자막 없음)는 대본 패널을 숨긴다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VideoPlayer from '../components/VideoPlayer.jsx';
import TopBar from '../components/TopBar.jsx';
import Transcript from '../components/Transcript.jsx';
import { getContent } from '../lib/content.js';
import { useRouter } from '../lib/router.jsx';
import { useSettings, displayLangsFor } from '../lib/settings.jsx';
import { findActiveIndex } from '../lib/segments.js';
import { t } from '../lib/i18n.js';
import { registerVideo } from '../lib/audioBus.js';

export default function DetailPage({ contentId }) {
  const content = getContent(contentId);
  const segments = content.segments;
  const hasTranscript = segments.length > 0;

  const { goList } = useRouter();
  const { myLang, displayMode } = useSettings();
  // 표시 언어(첫 번째 = 주 언어). 자막·대본·정적 텍스트가 같은 규칙을 공유. 안정 참조로 memo 유지.
  const displayLangs = useMemo(() => displayLangsFor(displayMode, myLang), [displayMode, myLang]);
  const [primary, ...secondary] = displayLangs;

  const videoRef = useRef(null);
  const hintRef = useRef(0);
  const [time, setTime] = useState(0);

  // 현재 세그먼트 — time 으로 매 틱 계산하되, 대본에는 id(경계에서만 변함)만 내려 재렌더를 줄인다.
  const activeIndex = findActiveIndex(segments, time, hintRef.current);
  if (activeIndex >= 0) hintRef.current = activeIndex;
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null;
  const activeId = activeSegment ? activeSegment.id : -1;

  const handleSeek = useCallback((seconds) => {
    const v = videoRef.current;
    if (v) v.currentTime = seconds;
  }, []);

  // 영상을 오디오 버스에 등록 — 읽어주기가 시작/종료될 때 버스가 영상을 일시정지/재개한다.
  useEffect(() => registerVideo(videoRef.current), []);

  const instructorsIn = (lang) =>
    (content.instructors || []).map((p) => p[lang]).filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <TopBar />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* 목록으로 — 로고(상단 바) 외에 명시적 뒤로가기 */}
        <button
          type="button"
          onClick={goList}
          className="mb-4 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand-deepblue transition-colors hover:bg-brand-deepblue/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue"
        >
          <span aria-hidden="true">←</span>
          {t('list.back', myLang)}
        </button>

        {/* 영상 위(컨테이너 폭 가득) + 대본 아래(가로 가득, 세로 스크롤). 모바일도 동일하게 세로. */}
        <div className="flex flex-col gap-4">
          <VideoPlayer
            src={content.videoUrl}
            title={content.title?.ko}
            videoRef={videoRef}
            onTimeUpdate={setTime}
            activeSegment={activeSegment}
            subtitleLangs={displayLangs}
            dubSegments={content.dubByLang?.[myLang]}
            uiLang={myLang}
          />
          {hasTranscript && (
            <Transcript
              segments={segments}
              langs={displayLangs}
              activeId={activeId}
              onSeek={handleSeek}
              vocabulary={content.vocabulary}
              myLang={myLang}
            />
          )}
        </div>

        {/* 콘텐츠 메타 */}
        <article className="mt-6 flex flex-col gap-5">
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

          {/* 강사 */}
          {instructorsIn(primary) && (
            <section className="flex flex-col gap-1">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink/50">
                {t('list.instructor', myLang)}
              </h2>
              <p className="text-base font-medium text-ink md:text-lg">{instructorsIn(primary)}</p>
              {secondary.map((lang) =>
                instructorsIn(lang) ? (
                  <p key={lang} className="text-sm text-ink/60">
                    {instructorsIn(lang)}
                  </p>
                ) : null,
              )}
            </section>
          )}

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
                  #{displayLangs.map((lang) => tag[lang]).filter(Boolean).join(' · ')}
                </li>
              ))}
            </ul>
          </section>
        </article>
      </main>
    </div>
  );
}
