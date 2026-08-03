import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5184,
    proxy: { '/api': 'http://127.0.0.1:5183' },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // three is loaded only on the routes that use it
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
