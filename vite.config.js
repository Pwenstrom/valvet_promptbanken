import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        vault: resolve(__dirname, 'vault.html'),
        planer: resolve(__dirname, 'planer.html')
      }
    }
  }
});
