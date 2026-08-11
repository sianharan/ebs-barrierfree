// 브라우저 하네스 — 앱을 띄우고 조작할 수 있는 상태까지만 담당한다.
//
// 이 파일에는 "무엇을 검사할지"를 넣지 않는다. 화면별 검사 로직(카드가 몇 개인지,
// 어떤 값이 나와야 하는지)은 매번 달라지므로 호출하는 쪽 스크립트에 둔다.
// 여기 있는 것은 작업이 바뀌어도 그대로인 것들뿐이다 — 크로미움 찾기, 포트 찾기,
// 언어 심기, 콘솔 수집, 스크린샷, 키보드 조작.
//
// playwright-core 는 프로젝트 의존성이 아니다(package.json 을 더럽히지 않는다).
// 스크래치패드에 --no-save 로 깔고 그 디렉터리를 cwd 로 실행한다 — 그래서
// 여기서는 cwd 기준으로 해석한다. 자세한 절차는 SKILL.md.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.env.PW_DIR || process.cwd(), 'noop.cjs'));
const { chromium } = require('playwright-core');

// 이 앱이 쓰는 localStorage 키(src/lib/settings.jsx 의 STORAGE_KEYS 와 같아야 한다).
export const STORAGE_KEYS = { myLang: 'ebs-bf.myLang', displayMode: 'ebs-bf.displayMode' };

// 지원 언어 전체(src/lib/settings.jsx 의 LANGUAGES 순서 그대로).
// 텍스트가 길어 레이아웃이 먼저 깨지는 쪽은 ru·fr·id·es 다 — 시간이 없으면 이 넷만 봐도 된다.
export const LANGS = ['ko', 'en', 'vi', 'zh', 'ja', 'th', 'ru', 'id', 'es', 'fr'];
export const LONG_LANGS = ['ru', 'fr', 'id', 'es'];

// 자주 보는 뷰포트. 데스크톱 폭은 본문 max-w-5xl(992px) 이 다 펴지는 값이어야 한다.
export const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 375, height: 812 } };

// 크로미움 실행 파일 찾기.
// playwright 브라우저는 깔려 있어도 playwright 패키지는 없을 수 있다(이 머신이 그렇다).
// 리비전 번호는 계속 바뀌므로 최신 것을 고르고, 폴더 이름도 chrome-win64/chrome-win 둘 다 본다
// (윈도우는 chrome-win64 다 — chrome-win 으로 찍으면 없다고 나온다).
export function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  if (!fs.existsSync(root)) throw new Error(`ms-playwright 폴더가 없다: ${root}`);
  const dirs = fs
    .readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    for (const sub of ['chrome-win64', 'chrome-win']) {
      const exe = path.join(root, d, sub, 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error(`크로미움을 못 찾았다. 확인한 곳: ${root} (${dirs.join(', ') || '비어 있음'})`);
}

// dev 서버 주소 찾기.
// vite 는 5173 이 잡혀 있으면 말없이 5174·5175 로 옮겨 간다. 5173 을 하드코딩하면
// 남이 띄워 둔 다른 서버(다른 브랜치일 수도 있다)를 검사하게 되므로 반드시 확인해서 쓴다.
// BASE 를 넘겨받으면 그걸 쓰고, 없으면 앱 제목으로 우리 앱인지 확인하며 훑는다.
export async function resolveBase({ base = process.env.BASE, ports = [5173, 5174, 5175, 5176, 5177] } = {}) {
  if (base) return base.replace(/\/$/, '');
  const found = [];
  for (const port of ports) {
    const url = `http://localhost:${port}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok && (await res.text()).includes('EBS 배리어프리')) found.push(url);
    } catch {
      /* 이 포트는 아무도 안 듣는다 — 다음 */
    }
  }
  if (!found.length) throw new Error('dev 서버를 못 찾았다. `npm run dev` 를 띄우고 BASE 로 주소를 넘겨라.');
  // 같은 앱이 여러 포트에 떠 있으면 어느 게 내 작업물인지 여기서는 알 수 없다.
  // 조용히 첫 번째를 고르면 남의 서버를 검사하고 "이상 없음" 을 보고하게 되므로 시끄럽게 알린다.
  if (found.length > 1) {
    console.warn(
      `[run-app] 앱이 여러 포트에 떠 있다: ${found.join(', ')} → ${found[0]} 을 골랐다.\n` +
        '          직접 띄운 dev 서버가 다른 포트라면 base 로 명시해라.',
    );
  }
  return found[0];
}

export function launch() {
  return chromium.launch({ executablePath: findChromium() });
}

// 페이지 하나 열기 — 언어를 심고, 콘솔·에러를 처음부터 모은다.
//
//  - lang/displayMode 는 UI 를 클릭하지 않고 localStorage 에 미리 심는다(addInitScript).
//    설정은 첫 렌더에 한 번만 읽히므로, 로드 뒤에 심으면 반영되지 않는다.
//  - msgs 는 console error/warning 에 더해 pageerror(던져진 예외)와 requestfailed 도 받는다.
//    셋 다 걸어야 "화면은 멀쩡한데 실은 깨진" 경우가 잡힌다.
//  - 반환한 ctx 는 쓰고 나서 반드시 close 한다(언어별로 새 ctx 를 여는 게 안전하다 —
//    localStorage 가 섞이지 않는다).
export async function open(browser, { path: urlPath = '/', base, lang = 'ko', displayMode, viewport = VIEWPORTS.desktop, waitFor } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const msgs = [];
  await ctx.addInitScript(
    ([keys, l, m]) => {
      if (l) window.localStorage.setItem(keys.myLang, l);
      if (m) window.localStorage.setItem(keys.displayMode, m);
    },
    [STORAGE_KEYS, lang, displayMode],
  );
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => msgs.push(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));

  const root = base || (await resolveBase());
  await page.goto(root + urlPath, { waitUntil: 'networkidle' });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 });
  return { ctx, page, msgs };
}

// Tab 을 눌러 selector 에 닿을 때까지 이동. 몇 번 만에 닿았는지 돌려준다(0 이면 못 닿음).
// 키보드로 도달 불가능한 요소를 잡아내는 게 목적이다.
export async function tabTo(page, selector, max = 30) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s), selector)) return i;
  }
  return 0;
}

// 지금 포커스된 요소의 포커스 링. outlineStyle 이 none 이면 키보드 사용자에게 위치가 안 보인다.
export function focusRing(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { el: document.activeElement.tagName, width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor };
  });
}

// 가로 스크롤 영역의 현재 위치와 최대치. 화살표키 전후로 불러 비교하면 스크롤 여부를 알 수 있다.
export function scrollState(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return { left: Math.round(el.scrollLeft), max: Math.round(el.scrollWidth - el.clientWidth) };
  }, selector);
}

// 스크린샷. outDir 은 스크래치패드를 쓴다 — 저장소 안에 남기지 않는다.
export async function shot(page, outDir, name, { fullPage = false } = {}) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  return file;
}
