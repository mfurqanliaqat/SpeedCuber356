import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // dist/ is loaded from file:// in the packaged app
  server: { port: 5356, strictPort: false },
});
