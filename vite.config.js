import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vite 빌드 설정. 출력은 dist/ (Vercel 프리셋 Vite 기준).
// /api 폴더는 Vercel이 서버리스 함수로 자동 인식하므로 여기서 다루지 않는다.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
