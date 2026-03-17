import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // base: './' ensures all asset paths are relative — required for Electron file:// loading
  base: './',
})
