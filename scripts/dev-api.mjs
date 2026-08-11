// scripts/dev-api.mjs
// /api 서버리스 함수 로컬 구동용 얇은 셸.
//
// api/*.js 핸들러를 그대로 import 하고, Vercel Node 런타임이 대신 해 주는 것만
// 흉내 낸다 — 본문 JSON 파싱(req.body), req.query, res.status()/json()/send().
// 검증 대상 로직(랭킹·문턱·오류 경로)은 전부 프로덕션 코드 그대로 돈다.
//
// 왜 `vercel dev` 가 아닌가: 이 머신의 vercel CLI 는 로그인 이력이 없어
// (auth.json 에 token 이 없다) `vercel dev` 가 대화형 기기 인증을 시작한다.
// 로그인해도 얻는 게 적다 — 배포는 GitHub→Vercel 자동 빌드라 CLI 가 필요 없고,
// 이 셸이 못 잡는 것(vercel.json rewrites, new URL(..., import.meta.url) 파일
// 트레이싱)은 `vercel dev` 도 소스에서 바로 실행하므로 마찬가지로 못 잡는다.
// 그 부류는 배포된 주소에서 확인해야 한다.
//
// 실행: npm run dev:api            # 3000
//       PORT=3100 npm run dev:api
// 함께: npm run dev 의 vite 가 /api → localhost:3000 으로 넘긴다(vite.config.js).
//       포트를 바꿨으면 VITE_API_PROXY 로 프록시 대상도 함께 바꾼다.
// 필요: .env 의 OPENAI_API_KEY (핸들러가 서버사이드에서만 읽는다).

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_DIR = path.join(ROOT, 'api');

const PORT = Number(process.env.PORT) || 3000;

function fail(msg) {
  console.error(`\n[dev-api] ✗ ${msg}\n`);
  process.exit(1);
}

// .env 로드. Node 내장이라 의존성이 없고, 이미 process.env 에 있는 값이 우선이다
// (scripts/ 의 다른 스크립트가 손으로 파싱해 얻는 것과 같은 동작).
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

// ── 라우트 ────────────────────────────────────────────────────────────────
// api/ 를 훑어 만든다. 엔드포인트를 추가해도 이 파일은 고칠 필요가 없다.
// 시작 시 한 번에 import 하므로 핸들러에 문법 오류가 있으면 요청이 아니라 여기서 터진다.
async function loadRoutes() {
  const files = (await readdir(API_DIR)).filter((f) => f.endsWith('.js'));
  if (files.length === 0) fail(`api/ 에 핸들러가 없습니다: ${API_DIR}`);

  const routes = new Map();
  for (const file of files) {
    const name = file.replace(/\.js$/, '');
    // 윈도우에서는 file:// URL 로 바꿔야 한다(D:\... 를 그대로 주면 ERR_UNSUPPORTED_ESM_URL_SCHEME).
    const mod = await import(pathToFileURL(path.join(API_DIR, file)).href);
    if (typeof mod.default !== 'function') {
      fail(`api/${file} 에 default export 핸들러가 없습니다.`);
    }
    routes.set(`/api/${name}`, mod.default);
  }
  return routes;
}

// ── Vercel Node 런타임 흉내 ───────────────────────────────────────────────
// 핸들러가 실제로 쓰는 것만 채운다. 없는 걸 짐작해 넣으면 프로덕션과 다르게
// 동작하는 지점이 생기고, 그 차이는 배포한 뒤에야 드러난다.
function decorate(req, res, url) {
  // req.query — Vercel 은 값이 여러 개면 배열로 준다.
  const query = {};
  for (const key of url.searchParams.keys()) {
    const all = url.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }
  req.query = query;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (obj) => {
    if (!res.hasHeader('content-type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(obj));
    return res;
  };

  // res.send — /api/tts 가 mp3 를 Buffer 로 돌려주는 경로다. Vercel 은 타입에 따라
  // content-type 을 정하되 핸들러가 이미 정했으면 건드리지 않는다(tts 는 audio/mpeg 를 직접 넣는다).
  res.send = (payload) => {
    if (Buffer.isBuffer(payload)) {
      if (!res.hasHeader('content-type')) res.setHeader('Content-Type', 'application/octet-stream');
      res.end(payload);
    } else if (typeof payload === 'string') {
      if (!res.hasHeader('content-type')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
      res.end(payload);
    } else if (payload === undefined || payload === null) {
      res.end();
    } else {
      res.json(payload);
    }
    return res;
  };
}

// 본문 읽기. Vercel 은 application/json 을 자동 파싱해 req.body 에 넣고,
// 그 밖의 타입은 문자열로 준다.
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8');
  if ((req.headers['content-type'] || '').includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {}; // 핸들러가 400 으로 처리한다.
    }
  }
  return raw;
}

// ── 서버 ──────────────────────────────────────────────────────────────────
const routes = await loadRoutes();

const server = http.createServer(async (req, res) => {
  const started = process.hrtime.bigint();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = routes.get(url.pathname);

  // 요청 한 줄씩 남긴다 — dev 콘솔의 요청 실패가 프런트 탓인지 여기 탓인지 갈라준다.
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`[dev-api] ${req.method} ${url.pathname} → ${res.statusCode} (${ms.toFixed(0)}ms)`);
  });

  if (!handler) {
    res.statusCode = 404;
    return res.end(`no handler for ${url.pathname}`);
  }

  decorate(req, res, url);

  try {
    req.body = await readBody(req);
    await handler(req, res);
  } catch (err) {
    console.error(`[dev-api] ✗ ${url.pathname}`, err);
    // 핸들러가 이미 응답을 시작했으면 덮어쓸 수 없다.
    if (!res.headersSent) res.statusCode = 500;
    if (!res.writableEnded) res.end(String(err));
  }
});

// 포트를 옮기지 않는다. 말없이 옆 포트로 가면 vite 프록시(3000)와 어긋나거나,
// 남이 띄워 둔 서버를 내 것으로 착각한 채 검사하게 된다.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    fail(`포트 ${PORT} 이 이미 사용 중입니다. 그 서버를 끄거나 PORT= 로 다른 포트를 지정하세요.`);
  }
  fail(String(err));
});

server.listen(PORT, () => {
  console.log(`\n[dev-api] http://localhost:${PORT}`);
  for (const route of routes.keys()) console.log(`[dev-api]   ${route}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[dev-api] ! OPENAI_API_KEY 가 없습니다 — 핸들러가 500 을 돌려줍니다.');
  }
  console.log('');
});

// Ctrl-C 로 확실히 죽는다 — 남겨 두면 다음 실행이 EADDRINUSE 로 막힌다.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
