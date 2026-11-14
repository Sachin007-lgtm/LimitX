import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // In production (Vercel), VITE_API_URL points to your Render backend
  const backendTarget = process.env.VITE_API_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true },
        '/auth': { target: backendTarget, changeOrigin: true },
        '/webhooks': { target: backendTarget, changeOrigin: true },
        '/health': { target: backendTarget, changeOrigin: true },
      },
    },
    build: {
      // When building for Vercel deploy, output to dist (not ../public)
      outDir: mode === 'vercel' ? 'dist' : '../public',
      emptyOutDir: true,
    },
  };
})
