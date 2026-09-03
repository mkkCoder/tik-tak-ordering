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
          // Multi-page build: each of these is a real index.html on disk, so
          // GitHub Pages returns HTTP 200 without an SPA fallback. Unknown
          // paths use public/404.html (copied to dist/) and stay 404.
          main: resolve(__dirname, 'index.html'),
          app: resolve(__dirname, 'app/index.html'),
          // Guides are plain static pages: no bundle, just something for
          // search engines to find and for a person to actually read.
          guidesHub: resolve(__dirname, 'guides/index.html'),
          seatingHowTo: resolve(
            __dirname,
            'guides/how-to-make-a-wedding-seating-chart/index.html',
          ),
          avery5302: resolve(__dirname, 'guides/avery-5302-place-card-template/index.html'),
          roundTable: resolve(__dirname, 'guides/how-many-people-fit-at-a-round-table/index.html'),
          cardTypes: resolve(__dirname, 'guides/escort-cards-vs-place-cards/index.html'),
          privacy: resolve(__dirname, 'privacy/index.html'),
          terms: resolve(__dirname, 'terms/index.html'),
        },
      },
    },
  };
});
