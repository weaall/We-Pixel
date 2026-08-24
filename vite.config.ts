import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/vitePlugin'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: { port: 5173 },
})
