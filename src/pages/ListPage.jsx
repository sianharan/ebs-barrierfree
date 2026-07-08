// 리스트 페이지 (영상나눔) — 함께학교 list_page.png 계승.
//
// 히어로 → 카테고리 → 카드 그리드(콘텐츠 3개). 카드 = 썸네일 + 제목·강사·해시태그.
// 제목·강사·해시태그는 '번역 표시 모드'(displayLangs)를 따라 다국어로 보여준다(②).
// 카드 클릭 → 해당 상세 페이지(useRouter.goDetail). 상단 바는 상세와 공통.
//
// 썸네일은 지금은 플레이스홀더(브랜드 틴트 + 재생 아이콘 + 강번호). 이후 ② 이미지 오버레이
// 번역으로 실제 이미지를 얹을 자리라, <TranslatableImage> 로 감싸기 쉽게 별도 컴포넌트로 둔다.

import TopBar from '../components/TopBar.jsx';
import { CATALOG_LIST } from '../lib/catalog.js';
import { useRouter } from '../lib/router.jsx';
import { useSettings, displayLangsFor } from '../lib/settings.jsx';
import { t } from '../lib/i18n.js';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// 강번호("1강"·"2강"…)를 한국어 제목에서 뽑아 배지로. 없으면 순번(index+1)으로 폴백.
function lessonBadge(content, index) {
  const m = /^\s*(\d+)\s*강/.exec(content.title?.ko ?? '');
  return m ? `${m[1]}강` : String(index + 1);
}

function Thumbnail({ content, index }) {
  return (
    // 16:9 플레이스홀더 — 나중에 실제 이미지 + ② 오버레이 번역이 들어올 자리.
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-gradient-to-br from-brand-blue/30 to-logo-navy/20">
      <span className="absolute left-3 top-3 rounded-md bg-white/85 px-2 py-0.5 text-xs font-bold text-logo-navy">
        {lessonBadge(content, index)}
      </span>
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-white/90 text-brand-deepblue shadow-sm">
          <PlayIcon />
        </span>
      </span>
    </div>
  );
}

function ContentCard({ content, index, langs, onOpen }) {
  const [primary, ...secondary] = langs;
  // 강사: 표시 모드의 주 언어로 이름을 ' · ' 로 잇는다.
  const instructorsIn = (lang) =>
    (content.instructors || []).map((p) => p[lang]).filter(Boolean).join(' · ');

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(content.id)}
        className="group flex w-full flex-col gap-3 rounded-xl border border-ink/10 bg-white/70 p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-deepblue"
      >
        <Thumbnail content={content} index={index} />

        <div className="flex flex-col gap-1 px-1 pb-1">
          {/* 제목 — 주 언어 크게, 보조 언어는 아래 옅게 */}
          <h3 className="font-title text-base leading-snug text-logo-navy group-hover:underline">
            {content.title?.[primary]}
          </h3>
          {secondary.map((lang) => (
            <p key={lang} className="font-title text-sm leading-snug text-ink/50">
              {content.title?.[lang]}
            </p>
          ))}

          {/* 강사 */}
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

          {/* 해시태그 — 태그마다 표시 언어를 ' · ' 로 한 칩에(상세 페이지와 동일 규칙) */}
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {(content.hashtags || []).map((tag, i) => (
              <li
                key={i}
                className="rounded-full bg-brand-blue/15 px-2 py-0.5 text-xs font-medium text-brand-deepblue"
              >
                #{langs.map((lang) => tag[lang]).filter(Boolean).join(' · ')}
              </li>
            ))}
          </ul>
        </div>
      </button>
    </li>
  );
}

export default function ListPage() {
  const { goDetail } = useRouter();
  const { myLang, displayMode } = useSettings();
  const langs = displayLangsFor(displayMode, myLang);
  const items = CATALOG_LIST;

  return (
    <div className="min-h-screen bg-background text-ink font-sans">
      <TopBar />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* 히어로 */}
        <section className="rounded-2xl bg-white/60 px-6 py-8 text-center shadow-sm">
          <h1 className="font-title text-3xl text-logo-navy md:text-4xl">
            {t('list.hero.title', myLang)}
          </h1>
          <p className="mt-2 text-base text-ink/70 md:text-lg">
            {t('list.hero.subtitle', myLang)}
          </p>
        </section>

        {/* 카테고리 */}
        <div className="mt-6">
          <div className="rounded-xl bg-brand-green px-6 py-4 text-center font-title text-xl text-white shadow-sm">
            {t('list.category', myLang)}
          </div>
        </div>

        {/* 게시글 수 */}
        <div className="mt-6 flex items-baseline gap-2">
          <h2 className="font-title text-xl text-logo-navy">{t('list.count', myLang)}</h2>
          <span className="font-title text-xl text-brand-deepblue">{items.length}</span>
        </div>

        {/* 카드 그리드 */}
        <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {items.map((content, index) => (
            <ContentCard
              key={content.id}
              content={content}
              index={index}
              langs={langs}
              onOpen={goDetail}
            />
          ))}
        </ul>
      </main>
    </div>
  );
}
