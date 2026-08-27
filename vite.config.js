import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        fatura: resolve(__dirname, 'fatura.html'),
        parcelamentos: resolve(__dirname, 'parcelamentos.html'),
        renda: resolve(__dirname, 'renda.html'),
        resumo: resolve(__dirname, 'resumo.html'),
      },
    },
  },
});
