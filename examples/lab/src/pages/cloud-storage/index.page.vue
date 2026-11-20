<script setup>
import { computed, reactive, ref, shallowRef, onMounted, onUnmounted } from 'vue';
import { NConfigProvider, zhCN, dateZhCN } from 'naive-ui';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import { SPEEDS, SampleCloudStorage } from './index.module.js';
import QueryCard from './QueryCard.vue';

// 播放器回调和查询卡片共用这一份状态。表单输入留在查询卡片里。
const session = reactive({
  status: '',
  days: [],
  recordings: [],
  queried: false,
  speed: '1',
  currentTime: '--:--:--',
  // 下面三个都是录像绝对时间（毫秒），不是从 0 开始的播放进度。区间为空表示没在播。
  rangeStartMs: 0,
  rangeEndMs: 0,
  currentTimeMs: 0,
  exportStatus: '',
  exporting: false,
});

// 区间还在就可以点。播完也留着区间，进度停在终点。
const seekable = computed(() => session.rangeEndMs > session.rangeStartMs);

// 当前时间在本次播放区间里的位置。区间为空时为 0。
const progress = computed(() => {
  const span = session.rangeEndMs - session.rangeStartMs;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (session.currentTimeMs - session.rangeStartMs) / span));
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

// 点击位置换成绝对时间。seek 要求 timeMs < end，贴到末尾会被拒绝，所以最多停在结束前 1ms。
function handleSeek(event) {
  if (!seekable.value) return;

  const span = session.rangeEndMs - session.rangeStartMs;
  if (span <= 0) return;

  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const timeMs = Math.min(session.rangeStartMs + ratio * span, session.rangeEndMs - 1);
  player.value?.seek(timeMs);
}

onMounted(() => {
  player.value = new SampleCloudStorage({
    view: canvas.value,
    onStatus: (text) => {
      session.status = text;
    },
    onTime: ({ text, currentTimeMs, startTimeMs, endTimeMs }) => {
      session.currentTime = text;
      session.currentTimeMs = currentTimeMs;
      session.rangeStartMs = startTimeMs;
      session.rangeEndMs = endTimeMs;
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
    <AppHeader title="云存回放" />

    <AppContainer extraClass="space-y-2">
      <div class="relative">
        <canvas ref="canvas" class="block aspect-video w-full bg-neutral-900 rounded-lg"></canvas>

        <div
          class="absolute inset-x-1.5 bottom-0 pt-2"
          :class="seekable ? 'cursor-pointer' : ''"
          role="slider"
          aria-label="播放进度"
          :aria-valuemin="session.rangeStartMs"
          :aria-valuemax="session.rangeEndMs"
          :aria-valuenow="seekable ? session.currentTimeMs : 0"
          :aria-disabled="!seekable"
          @click="handleSeek"
        >
          <div class="h-1 overflow-hidden rounded-full bg-white/40">
            <div class="h-full rounded-full bg-primary" :style="{ width: `${progress * 100}%` }"></div>
          </div>
        </div>
      </div>

      <div class="card card-sm bg-base-100 shadow-sm">
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
