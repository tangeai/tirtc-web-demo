<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

// 首页就是实时播放页。原来的查询参数原样带过去。
onMounted(() => {
  router.replace({ path: '/live', query: route.query, hash: route.hash });
});
</script>

<template></template>
