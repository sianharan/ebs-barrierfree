import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 빌드 설정. 출력은 dist/ (Vercel 프리셋 Vite 기준).
// /api 폴더는 Vercel이 서버리스 함수로 자동 인식한다(배포 시).
//
// 로컬: Vite dev(5173)는 /api 를 모른다. 두 가지 방법이 있다.
//  1) `vercel dev`(보통 3000)로 프론트+함수를 한 번에 — 가장 간단(이때 5173 불필요).
//  2) `npm run dev`(5173, 빠른 HMR) + 별도 터미널 `vercel dev`(3000) → 아래 proxy 가
//     /api 요청을 3000 으로 넘긴다. VITE_API_PROXY 로 대상 변경 가능.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
