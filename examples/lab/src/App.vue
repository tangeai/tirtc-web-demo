<script setup>
import { NConfigProvider, dateZhCN, zhCN } from 'naive-ui';
import { naiveThemeOverrides } from './theme';
</script>

<template>
  <!-- 中文文案和主题放在根上，页面不用各自包一层。 -->
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="naiveThemeOverrides">
    <RouterView />
  </NConfigProvider>
</template>
