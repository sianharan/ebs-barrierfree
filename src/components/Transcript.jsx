// ⑤ 대본 패널 — 표시 + 따라가기 + 구간 이동(1단계) + 어휘 툴팁(2단계) + 읽어주기(③ 1단계).
//
// subtitles.json 세그먼트 리스트(번역 표시 모드에 따라 ko/모국어/둘 다).
// - 활성 줄 하이라이트 + 패널 내부 자동 스크롤(따라가기).
// - 줄 클릭 = 그 세그먼트 start 로 구간 이동.
// - 한국어 줄의 어휘 단어에 점선 밑줄 + 옅은 틴트 → 호버/클릭 시 모국어 풀이 툴팁(VocabularyTooltip).
//   패널 위에 어휘 안내 한 줄(견본 단어 + t('transcript.vocabHint'))을 둬 처음 온 사용자도 알아채게 한다.
// - 줄 끝 스피커 = 그 줄을 현재 표시 언어로 읽어주기(③ ReadAloud).
//
// 구조: 줄 전체를 <button> 으로 두면 어휘·스피커 <button> 과 중첩(잘못된 HTML)되므로,
// 구간이동은 줄을 덮는 오버레이 <button>(z-0)으로, 텍스트는 그 위(z-10, pointer-events-none)에
// 둔다. 어휘 단어·스피커만 pointer-events-auto 라 클릭이 그쪽으로 가고, 빈 곳 클릭은 오버레이(이동)로 떨어진다.

import { Fragment, memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { formatTimecode } from '../lib/segments.js';
import { indexVocabBySegment, matchTerms } from '../lib/vocab.js';
import { t } from '../lib/i18n.js';
import { subscribe as subscribeAudio, getState as getAudioState } from '../lib/audioBus.js';
import VocabularyTooltip from './VocabularyTooltip.jsx';
import ReadAloud from './ReadAloud.jsx';

// 읽어주기 줄 식별용 안정 키(버스 activeId 와 동일 규칙).
const readId = (segId) => `seg-${segId}`;

// 한국어 텍스트를 어휘 매칭 구간으로 쪼개, 단어는 툴팁으로·나머지는 평문으로 렌더.
function renderKorean(text, terms, defLang) {
  const chosen = matchTerms(text, terms);
  if (chosen.length === 0) return text;

  const nodes = [];
  let cursor = 0;
  chosen.forEach((m, i) => {
    if (m.start > cursor) {
      nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, m.start)}</Fragment>);
    }
    nodes.push(<VocabularyTooltip key={`v${i}`} term={m.term} lang={defLang} />);
    cursor = m.end;
  });
  if (cursor < text.length) {
    nodes.push(<Fragment key="end">{text.slice(cursor)}</Fragment>);
  }
  return nodes;
}

function Transcript({ segments, langs = ['ko', 'vi'], activeId, onSeek, vocabulary = [], myLang }) {
  const containerRef = useRef(null);
  const vocabBySegment = useMemo(() => indexVocabBySegment(vocabulary), [vocabulary]);

  // 현재 읽어주는 줄 — 오디오 버스에서 구독해 줄에 시각 신호를 준다.
  const audio = useSyncExternalStore(subscribeAudio, getAudioState, getAudioState);
  const readingId = audio.source === 'read' ? audio.activeId : null;

  // 활성 줄이 바뀌면 패널 내부에서 가운데로 부드럽게 스크롤(페이지는 건드리지 않는다).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const el = c.querySelector('[data-active="true"]');
    if (!el) return;
    const cRect = c.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = eRect.top - cRect.top - (c.clientHeight - el.clientHeight) / 2;
    c.scrollTo({ top: c.scrollTop + delta, behavior: 'smooth' });
  }, [activeId]);

  const [primary, ...secondary] = langs;

  // ⑤ 어휘 안내 — 어휘는 한국어 줄에만 얹히므로, 한국어를 표시하는 모드에서만 안내한다.
  // 견본 단어(이 강의의 첫 어휘)를 단어와 같은 스타일로 보여줘 "이 표시 = 뜻풀이"를 즉시 읽히게.
  const vocabSample = langs.includes('ko') && vocabulary.length > 0 ? vocabulary[0].term : null;

  return (
    <div className="flex flex-col gap-2">
      {vocabSample && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-ink/60">
          <span
            aria-hidden="true"
            className="rounded-[4px] border-b-2 border-dashed border-brand-deepblue/60 bg-brand-deepblue/[0.08] px-[0.2em] font-medium text-brand-deepblue"
          >
            {vocabSample}
          </span>
          {t('transcript.vocabHint', myLang)}
        </p>
      )}

      <div
        ref={containerRef}
        data-vocab-bounds
        className="h-[320px] overflow-y-auto rounded-xl border border-ink/10 bg-white/70"
      >
        <ul className="divide-y divide-ink/5">
          {segments.map((seg) => {
            const active = seg.id === activeId;
            const reading = readingId === readId(seg.id);
            const terms = vocabBySegment.get(seg.id) || [];

            const renderLine = (lang, isPrimary) => {
              const content =
                lang === 'ko' && terms.length > 0
                  ? renderKorean(seg.text?.ko ?? '', terms, myLang)
                  : seg.text?.[lang];
              return (
                <p
                  key={lang}
                  className={
                    isPrimary
                      ? `font-sans leading-snug ${active ? 'font-medium text-brand-deepblue' : 'text-ink'}`
                      : 'mt-0.5 font-sans text-sm leading-snug text-ink/60'
                  }
                >
                  {content}
                </p>
              );
            };

            return (
              <li
                key={seg.id}
                data-active={active ? 'true' : undefined}
                data-reading={reading ? 'true' : undefined}
                // 어휘 말풍선이 열린 줄만 위로 — 안 그러면 뒤 줄들이 DOM 순서대로 말풍선을 덮는다.
                className={`relative has-[[data-vocab-open]]:z-20 ${reading ? 'ring-1 ring-inset ring-brand-deepblue/40' : ''}`}
              >
                {/* 구간이동 오버레이(줄 전체) — 빈 곳 클릭/키보드로 이동. 읽는 줄은 살짝 더 진하게. */}
                <button
                  type="button"
                  onClick={() => onSeek?.(seg.start)}
                  aria-label={`${formatTimecode(seg.start)} 구간으로 이동`}
                  className={`absolute inset-0 z-0 w-full border-l-4 transition-colors ${
                    reading
                      ? 'border-brand-deepblue bg-brand-deepblue/[0.07]'
                      : active
                        ? 'border-brand-deepblue bg-brand-deepblue/10'
                        : 'border-transparent hover:bg-ink/5'
                  }`}
                />
                {/* 텍스트(오버레이 위) — 평문은 클릭이 통과(pointer-events-none), 어휘 단어·스피커만 클릭 대상 */}
                <div className="pointer-events-none relative z-10 flex gap-3 px-3 py-2">
                  <time className="mt-0.5 shrink-0 font-sans text-xs tabular-nums text-ink/50">
                    {formatTimecode(seg.start)}
                  </time>
                  <div className="min-w-0 flex-1">
                    {renderLine(primary, true)}
                    {secondary.map((lang) => renderLine(lang, false))}
                  </div>
                  {/* 읽어주기(③) — 줄 끝, 어휘 밑줄과 안 겹치게. 현재 표시 주 언어(primary)로 읽는다. */}
                  <ReadAloud
                    id={readId(seg.id)}
                    className="pointer-events-auto mt-0.5"
                    text={seg.text?.[primary]}
                    lang={primary}
                    label={t('transcript.readAloud', myLang)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default memo(Transcript);
