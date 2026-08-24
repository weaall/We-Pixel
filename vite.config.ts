import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { geminiPlugin } from './server/gemini'
import { workspaceApiPlugin } from './server/workspaceApi'

export default defineConfig({
  plugins: [react(), geminiPlugin(), workspaceApiPlugin()],
  server: { port: 5173 },
})
