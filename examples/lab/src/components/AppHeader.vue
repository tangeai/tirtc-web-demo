<script setup>
import { useRoute } from 'vue-router';
import { IconMenu } from '@/components/icons';

defineProps({
  title: { type: String, default: '' },
});

const route = useRoute();

const links = [
  { to: '/device-player', label: '实时直播', exact: true },
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
      <RouterLink to="/device-player" aria-current-value="false" class="btn btn-ghost text-lg">TiRTC</RouterLink>
    </div>

    <div v-if="title" class="navbar-center">
      <h1 class="text-base font-medium">{{ title }}</h1>
    </div>

    <div class="navbar-end">
      <div class="dropdown dropdown-end">
        <div tabindex="0" role="button" class="btn btn-ghost btn-circle" aria-label="菜单">
          <IconMenu class="h-5 w-5" />
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
