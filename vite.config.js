import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        login: resolve(__dirname, 'login.html'),
        vault: resolve(__dirname, 'vault.html')
      }
    }
  }
});
