import { defineConfig } from 'vite';

const proxy = { '/api': process.env.KP_BACKEND_URL || 'http://127.0.0.1:8001' };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
