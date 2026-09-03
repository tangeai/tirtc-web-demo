import { createApp } from 'vue';
import { createWebHistory, createRouter } from 'vue-router';

import './style.css';

import App from './App.vue';

const Hello = () => import('./pages/hello/index.vue');
const DeviceInfo = () => import('./pages/device-info/index.vue');

const routes = [
  { path: '/', component: DeviceInfo },
  { path: '/hello', component: Hello },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

createApp(App).use(router).mount('#app');
