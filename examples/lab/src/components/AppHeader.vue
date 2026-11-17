<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();

const links = [
  { to: '/', label: '生成播放链接', exact: true },
  { to: '/device-player', label: '实时直播' },
  { to: '/cloud-storage', label: '云存回放' },
];

function isActive(link) {
  if (link.exact) return route.path === link.to;
  return route.path === link.to || route.path.startsWith(`${link.to}/`);
}

function closeMenu(event) {
  event.currentTarget?.closest('.dropdown')?.querySelector('[role="button"]')?.blur();
}
</script>

<template>
  <div class="navbar bg-base-100 shadow-sm">
    <div class="navbar-start">
      <RouterLink to="/" class="btn btn-ghost text-xl">TiRTC</RouterLink>
    </div>

    <div class="navbar-end">
      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle" aria-label="菜单">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </div>

        <ul tabindex="-1" class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
          <li v-for="link in links" :key="link.to">
            <RouterLink :to="link.to" :class="{ 'menu-active': isActive(link) }" @click="closeMenu">
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
