<script setup>
defineOptions({ inheritAttrs: false });

defineProps({
  extraClass: {
    type: String,
    default: '',
  },
});
</script>

<template>
  <div class="mx-auto max-w-3xl p-2" :class="extraClass">
    <slot />
  </div>
</template>
