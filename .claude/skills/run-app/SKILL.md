---
name: run-app
description: 이 앱(EBS 배리어프리, Vite+React)을 dev 서버로 띄우고 크로미움으로 조작·확인한다. 화면을 실제로 보고 확인해야 할 때 — 스크린샷, 반응형(데스크톱·모바일) 확인, 10개 언어 전환 확인, 키보드 접근성 확인, 콘솔 에러 확인.
---

# 앱 띄우고 확인하기

브라우저에서 직접 보고 확인할 때 쓴다. `driver.mjs` 가 **띄우고 조작하는 데까지**를 맡고,
**무엇을 검사할지는 매번 새로 쓴다** — 화면마다 다르므로 드라이버에 넣지 않는다.

## 1. dev 서버

```bash
npm run dev       # 프런트(vite). run_in_background 로
npm run dev:api   # /api 함수(3000). 의미 검색·읽어주기 화면이면 함께 띄운다
```

`npm run dev:api` 는 `scripts/dev-api.mjs` — `api/*.js` 핸들러를 **그대로 불러** 3000 에
띄우는 얇은 셸이다. Vercel 이 해 주는 것(본문 JSON 파싱·`req.query`·`res.status/json/send`)만
흉내 내므로 검증 대상 로직은 프로덕션 코드 그대로다. vite 가 `/api` 를 3000 으로 넘긴다.
`vercel dev` 는 쓰지 않는다 — 이 머신의 CLI 는 로그인 이력이 없어 대화형 기기 인증을 시작하고,
얻는 것도 없다(배포는 GitHub→Vercel 자동 빌드다).

`/api` 를 안 쓰는 화면이면 띄우지 않아도 되지만, 그때 검색·읽어주기는 **요청 실패로 뜬다** —
콘솔에서 그걸 화면 결함으로 오해하지 마라. dev-api 는 vite 와 달리 포트를 옮기지 않고
`EADDRINUSE` 로 죽는다(프록시 대상이 3000 으로 고정이라 말없이 옮기면 어긋난다).

**포트를 5173 으로 단정하지 마라.** vite 는 5173 이 잡혀 있으면 말없이 5174·5175 로 옮겨 가고,
5173 에는 남이 띄워 둔 다른 서버(다른 브랜치일 수도 있다)가 있을 수 있다.
백그라운드 출력 파일에서 `Local: http://localhost:____` 를 읽어 그 주소를 쓴다.
`resolveBase()` 가 앱 제목으로 확인하며 훑어주긴 하지만, **직접 띄운 포트를 넘기는 쪽이 확실하다.**

## 2. playwright-core 설치

이 머신에는 playwright **브라우저는 깔려 있는데 패키지는 없다.** 브라우저를 다시 받을 필요는 없다.

```bash
cd <스크래치패드>
npm init -y && npm i --no-save playwright-core
```

프로젝트에 깔지 마라 — `package.json` 에 남는다. 스크래치패드에 깔고 **거기를 cwd 로 실행**하면
`driver.mjs` 가 cwd 기준으로 찾는다(`PW_DIR` 로 따로 지정해도 된다).

## 3. 검사 스크립트

스크래치패드에 작성하고 스크래치패드에서 실행한다.

`driver.mjs` 는 저장소 안에, 스크립트는 스크래치패드에 있으므로 절대 경로로 import 한다.
윈도우에서는 **`file:///` 를 붙여야 한다** — `D:/...` 로 쓰면 `ERR_UNSUPPORTED_ESM_URL_SCHEME` 이 난다.

```js
import { launch, open, shot, tabTo, focusRing, scrollState, LANGS, VIEWPORTS }
  from 'file:///D:/projects/ebs-barrierfree/.claude/skills/run-app/driver.mjs';

const BASE = 'http://localhost:5174';        // ← 1번에서 읽은 주소
const OUT  = '<스크래치패드>';
const browser = await launch();

const { ctx, page, msgs } = await open(browser, {
  base: BASE, path: '/pipeline', lang: 'ko',
  viewport: VIEWPORTS.desktop,
  waitFor: 'main',                            // 이 화면에서 기다릴 것
});

// ── 여기부터가 이번 작업 전용. 페이지 안에서 재는 게 가장 정확하다. ──
const result = await page.evaluate(() => { /* querySelector 로 세고 재기 */ });

await shot(page, OUT, 'pipeline-desktop', { fullPage: true });
console.log(JSON.stringify({ result, console: msgs }, null, 2));
await ctx.close();
await browser.close();
```

실행: `cd <스크래치패드> && node check.mjs`

## 4. 확인할 것

**스크린샷을 눈으로 봐라.** DOM 수치만 보고 통과시키지 마라 — 줄바꿈이나 어긋난 정렬은
`scrollWidth` 같은 값에 안 걸린다(넘치는 게 아니라 그냥 줄이 바뀌는 것이므로).
빈 화면이면 그건 실행 실패다.

- **반응형** — `VIEWPORTS.desktop`(1280) 과 `VIEWPORTS.mobile`(375). 본문이 통째로 가로 스크롤되면
  안 된다: `documentElement.scrollWidth > clientWidth` 로 확인.
- **언어** — `lang` 옵션으로 심는다(UI 클릭 불필요). `LANGS` 10종 전부가 정석이고, 급하면
  `LONG_LANGS`(ru·fr·id·es)만. 레이아웃은 **텍스트가 긴 언어에서 먼저 깨진다.**
  한국어(CJK)는 낱말 가운데서도 줄이 끊기므로 별도로 본다.
- **키보드** — `tabTo(page, selector)` 로 닿는지(0 이면 도달 불가), `focusRing(page)` 로 포커스가
  보이는지(`style: 'none'` 이면 안 보인다). 가로 스크롤 영역은 화살표키 전후로 `scrollState` 를
  비교해 실제로 움직이는지 본다(WCAG 2.1.1).
  **포커스 링 색은 반드시 0.3초쯤 기다렸다 재라** — 아래 함정 표 참고.
- **콘솔** — `open()` 이 돌려주는 `msgs` 를 반드시 출력한다. console error/warning, 던져진 예외,
  실패한 요청이 모두 들어 있다.
- **수치** — 화면 숫자는 `data/` 원본에서 직접 세어 대조한다. 렌더링됐다는 것과 값이 맞다는 건 다르다.

## 5. 마무리

`npm run build` 로 프로덕션 빌드도 통과하는지 본다.
(청크 크기 경고는 원래 있던 것 — 데이터를 번들에 넣기 때문이다. 이 경고는 무시한다.)

**띄운 서버를 끈다.** 백그라운드 dev·preview·dev-api 는 세션이 끝나도 살아 있고, 확인을
여러 번 돌리면 그대로 쌓인다(전에 8개·600MB 가 남아 있었다). 다음 실행이 엉뚱한 포트로
밀려 남의 서버를 검사하게 되는 원인이 이것이다.

## 함정 모음

| 증상 | 원인 |
|---|---|
| `chrome.exe` 가 없다 | 윈도우는 `chrome-win64/`. `chrome-win/` 아니다. 리비전도 바뀌므로 `findChromium()` 을 써라 |
| 검사했는데 내 수정이 반영 안 됨 | 5173 의 남의 서버를 봤다. 직접 띄운 포트를 확인해라 |
| 언어를 심었는데 한국어로 뜸 | 로드 뒤에 심었다. 설정은 첫 렌더에 한 번만 읽는다 — `open()` 의 `lang` 을 써라 |
| 언어가 앞 테스트 값으로 남음 | ctx 를 재사용했다. 언어마다 새 ctx 를 열고 close 해라 |
| 콘솔은 깨끗한데 화면이 이상 | `pageerror`·`requestfailed` 를 안 봤다. `msgs` 에 셋 다 들어 있다 |
| `ERR_UNSUPPORTED_ESM_URL_SCHEME` | `driver.mjs` import 에 `file:///` 를 안 붙였다 |
| 포커스 링 색이 흰색(=currentColor)으로 나온다 | Tailwind v4 의 `transition-colors` 는 `outline-color` 도 트랜지션한다. Tab 직후에 재면 트랜지션 **시작값**이 잡힌다. `waitForTimeout(300~500)` 뒤에 다시 재라 — 실제로는 정상인 경우가 많다 |
| 콘솔에 `/api/search … ERR_ABORTED` 하나 | dev 전용이다. StrictMode 가 마운트 이펙트를 두 번 돌려 첫 요청이 취소된 것 — 프로덕션 빌드에서는 안 생긴다 |
| 검색·읽어주기가 요청 실패(`/api/…` 502·404) | `npm run dev:api` 를 안 띄웠다. 화면 결함이 아니다 |
| `dev:api` 가 `EADDRINUSE` 로 죽는다 | 앞 세션의 셸이 3000 에 남아 있다. 끄거나 `PORT=` 로 옮긴다(옮기면 `VITE_API_PROXY` 도 같이) |
