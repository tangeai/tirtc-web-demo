import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

import vueJsx from '@vitejs/plugin-vue-jsx';
import VueRouter from 'vue-router/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    VueRouter({
      // 全局设置扩展名
      extensions: ['page.vue', '.md'],
    }),
    vue(),
    vueJsx(),
    tailwindcss(),
  ],
  // Vite 7 不支持自动引入 wasm 文件，需要手动排除 tirtc-web。Vite 8支持自动引入 wasm 文件，可不加此配置
  optimizeDeps: { exclude: ['tirtc-web'] },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
