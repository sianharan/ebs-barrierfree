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
import TranslatableImage from '../components/TranslatableImage.jsx';
import { getContent } from '../lib/content.js';
import { getImage } from '../lib/images.js';
import { CATALOG_LIST } from '../lib/catalog.js';
import { useRouter } from '../lib/router.jsx';
import { useSettings, displayLangsFor } from '../lib/settings.jsx';
import { findActiveIndex } from '../lib/segments.js';
import { t } from '../lib/i18n.js';
import { registerVideo } from '../lib/audioBus.js';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// 강번호("1강"·"2강"…)를 한국어 제목에서 뽑아 배지로. 없으면 순번(index+1)으로 폴백(ListPage 와 동일 규칙).
function lessonBadge(content, index) {
  const m = /^\s*(\d+)\s*강/.exec(content.title?.ko ?? '');
  return m ? `${m[1]}강` : String(index + 1);
}

// 관련 영상 카드 — 썸네일(② 오버레이 번역) + 제목·강사. 클릭 시 해당 강의 상세로 이동(goDetail).
// 리스트 카드(ListPage)와 같은 시각 언어를 따르되, 해시태그는 빼고 제목·강사만 간결히 보여준다.
function RelatedCard({ content, index, langs, onOpen }) {
  const [primary, ...secondary] = langs;
  const instructorsIn = (lang) =>
    (content.instructors || []).map((p) => p[lang]).filter(Boolean).join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(content.id)}
        className="group flex w-full flex-col gap-3 rounded-xl border border-ink/10 bg-white/70 p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue"
      >
        {/* 썸네일 — 대표 이미지 + ② 오버레이 번역. 배지·재생 아이콘은 오버레이 위에 얹는다. */}
        <TranslatableImage
          image={getImage(content.id)}
          langs={langs}
          alt={content.title?.ko ?? ''}
          className="aspect-video w-full rounded-xl"
        >
          <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-md bg-white/85 px-2 py-0.5 text-xs font-bold text-logo-navy">
            {lessonBadge(content, index)}
          </span>
          <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-brand-deepblue shadow-sm">
              <PlayIcon />
            </span>
          </span>
        </TranslatableImage>

        <div className="flex flex-col gap-1 px-1 pb-1">
          <h3 className="font-title text-base leading-snug text-logo-navy group-hover:underline">
            {content.title?.[primary]}
          </h3>
          {secondary.map((lang) => (
            <p key={lang} className="font-title text-sm leading-snug text-ink/50">
              {content.title?.[lang]}
            </p>
          ))}
          {instructorsIn(primary) && (
            <p className="mt-1 text-sm text-ink/70">{instructorsIn(primary)}</p>
          )}
          {secondary.map((lang) =>
            instructorsIn(lang) ? (
              <p key={lang} className="text-xs text-ink/40">
                {instructorsIn(lang)}
              </p>
            ) : null,
          )}
        </div>
      </button>
    </li>
  );
}

export default function DetailPage({ contentId }) {
  const content = getContent(contentId);
  const segments = content.segments;
  const hasTranscript = segments.length > 0;
  // 관련 영상 — 현재 강의를 뺀 다른 강의 최대 2개(카탈로그 순서). 원본 index 를 함께 넘겨 강번호 배지의 폴백에 쓴다.
  const related = CATALOG_LIST.map((c, index) => ({ content: c, index })).filter(
    ({ content: c }) => c.id !== contentId,
  ).slice(0, 2);

  const { goList, goDetail } = useRouter();
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

        {/* 제목 바 — 강의 제목만 얇게(한 줄). 영상을 아래로 많이 밀지 않게 최소 높이로, 페이지를 열면
            제목과 영상이 한 화면에 함께 보이도록 한다(함께학교 content_page 제목 영역). 강사·설명 등은 영상 아래. */}
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0">
          {/* 주 제목 — 크고 굵게(제목다운 무게감). 한 줄 유지로 영상을 크게 밀지 않는다. */}
          <h1 className="font-title text-2xl font-bold leading-tight text-logo-navy md:text-3xl">
            {content.title?.[primary]}
          </h1>
          {/* 보조 제목(영어/모국어) — 작고 옅게 옆에(좁으면 아래로 줄바꿈). 위계를 준다. */}
          {secondary.map((lang) => (
            <span key={lang} className="font-title text-sm leading-tight text-ink/50 md:text-base">
              {content.title?.[lang]}
            </span>
          ))}
        </div>

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

        {/* 콘텐츠 메타 — 제목은 영상 위 제목 바로 올라갔고, 여기는 강사·설명·해시태그(영상 아래 그대로). */}
        <article className="mt-6 flex flex-col gap-5">
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

        {/* 관련 영상 — 현재 강의를 뺀 다른 강의 카드(썸네일 ② 오버레이 + 제목·강사). 클릭 시 그 강의 상세로. */}
        {related.length > 0 && (
          <section className="mt-10 flex flex-col gap-3">
            <h2 className="font-title text-xl text-logo-navy">{t('content.related', myLang)}</h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {related.map(({ content: c, index }) => (
                <RelatedCard
                  key={c.id}
                  content={c}
                  index={index}
                  langs={displayLangs}
                  onOpen={goDetail}
                />
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
