<script setup>
import { reactive, ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import { EXPORT_HINT, SPEEDS, SampleCloudStorage } from './index.module.js';
import QueryCard from './QueryCard.vue';

// 播放器回调和查询卡片共用这一份状态。表单输入留在查询卡片里。
const session = reactive({
  status: '',
  days: [],
  recordings: [],
  loadedMonth: '',
  queried: false,
  speed: '1',
  currentTime: '--:--:--',
  exportStatus: EXPORT_HINT,
  exporting: false,
});

const canvas = ref(null);
// shallowRef：播放器是类实例，不要做成深层响应式。
const player = shallowRef(null);

function handlePause() {
  player.value?.pause();
}

function handleResume() {
  player.value?.resume();
}

function handleStop() {
  player.value?.stop();
}

function handleSpeed(event) {
  const next = player.value?.setSpeed(event.target.value);
  session.speed = String(next ?? event.target.value);
}

onMounted(() => {
  player.value = new SampleCloudStorage({
    view: canvas.value,
    onStatus: (text) => {
      session.status = text;
    },
    onTime: (text) => {
      session.currentTime = text;
    },
    onExportStatus: (text) => {
      session.exportStatus = text;
    },
    onExporting: (active) => {
      session.exporting = active;
    },
  });
});

onUnmounted(() => {
  player.value?.dispose();
  player.value = null;
});
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <AppContainer extraClass="space-y-2">
      <AppHeader title="云存回放" />

      <canvas ref="canvas" class="block aspect-video w-full bg-neutral-900 rounded-lg"></canvas>

      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-sm" @click="handlePause">暂停</button>
            <button type="button" class="btn btn-sm" @click="handleResume">继续</button>
            <button type="button" class="btn btn-sm" @click="handleStop">停止</button>

            <!-- 倍速 -->
            <select class="select select-sm w-auto" :value="session.speed" @change="handleSpeed">
              <option v-for="item in SPEEDS" :key="item" :value="String(item)">{{ item }}×</option>
            </select>
            <span
              v-if="session.speed !== '1'"
              class="tooltip tooltip-top text-xs text-base-content/50"
              data-tip="非 1 倍速时静音"
              >静音</span
            >

            <span class="ms-auto text-sm text-base-content/70">{{ session.currentTime }}</span>
          </div>
        </div>
      </div>

      <QueryCard :player="player" :session="session" />
    </AppContainer>
  </n-config-provider>
</template>
