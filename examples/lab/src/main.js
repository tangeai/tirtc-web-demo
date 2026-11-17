import { createApp } from 'vue';
import { createWebHistory, createRouter } from 'vue-router';
import { routes, handleHotUpdate } from 'vue-router/auto-routes';

import './style.css';

import App from './App.vue';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 这将在运行时更新路由而无需重新加载页面
if (import.meta.hot) {
  handleHotUpdate(router);
}

createApp(App).use(router).mount('#app');
