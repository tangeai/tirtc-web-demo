import { createApp } from 'vue';
import { createWebHistory, createRouter } from 'vue-router';
import { routes, handleHotUpdate } from 'vue-router/auto-routes';

import './style.css';
import { applyTheme } from './theme';

import App from './App.vue';

// 页面还没渲染，这时写上 CSS 变量，主按钮不会先闪成 daisyUI 默认色。
applyTheme();

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// 这将在运行时更新路由而无需重新加载页面
if (import.meta.hot) {
  handleHotUpdate(router);
}

createApp(App).use(router).mount('#app');
