import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE ?? '/',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // See src/shims/empty.ts — jsPDF's html() path is never used.
        html2canvas: resolve(__dirname, 'src/shims/empty.ts'),
        dompurify: resolve(__dirname, 'src/shims/empty.ts'),
      },
    },
    build: {
      target: 'es2020',
      rollupOptions: {
        input: {
          // Landing page at /, app at /app/
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app/index.html'),
        },
      },
    },
  };
});
