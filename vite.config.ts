import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SharedArrayBuffer (ใช้ให้ input() รอผู้ใช้พิมพ์ได้) ต้องเปิด cross-origin isolation
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
})
