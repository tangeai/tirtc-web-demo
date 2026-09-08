import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // Vite 7 不支持自动引入 wasm 文件，需要手动排除 tirtc-web。Vite 8支持自动引入 wasm 文件，可不加此配置
  optimizeDeps: { exclude: ['tirtc-web'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
