<script setup>
// 云存回放示例。SDK 调用都在 replay-session.js，日期工具在 date-utils.js；
// 这里只管画面、播放控制和进度条，查询表单和录像列表在 QueryCard.vue。
import { computed, shallowRef, onMounted, onUnmounted } from 'vue';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import { ReplaySession, SPEEDS, initialReplayState } from './replay-session.js';
import { formatTime } from './date-utils.js';
import QueryCard from './QueryCard.vue';

const canvas = shallowRef(null);
// 会话是类实例，不需要深层响应式
let session = null;
// 会话状态的副本，会话每次 change 都整体替换
const state = shallowRef(initialReplayState);

const range = computed(() => state.value.range);
const currentTimeText = computed(() => (range.value ? formatTime(state.value.currentTimeMs) : '--:--:--'));

// 当前时间在本次播放区间里的位置，0 ~ 1。没在播时为 0
const progress = computed(() => {
  if (!range.value) return 0;
  const { startTimeMs, endTimeMs } = range.value;
  const ratio = (state.value.currentTimeMs - startTimeMs) / (endTimeMs - startTimeMs);
  return Math.min(1, Math.max(0, ratio));
});

function handleSpeed(event) {
  session.setSpeed(Number(event.target.value));
  // 设置失败时 state.speed 不变，下拉框要拨回去
  event.target.value = String(state.value.speed);
}

// 点击位置换成绝对时间。seek 要求 timeMs < end，贴到末尾会被拒绝，所以最多停在结束前 1ms
function handleSeek(event) {
  if (!range.value) return;
  const { startTimeMs, endTimeMs } = range.value;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  session.seek(Math.min(startTimeMs + ratio * (endTimeMs - startTimeMs), endTimeMs - 1));
}

onMounted(() => {
  session = new ReplaySession({ view: canvas.value });
  session.on('change', (next) => {
    state.value = next;
  });
});

onUnmounted(() => {
  session?.dispose();
  session = null;
});
</script>

<template>
  <AppHeader title="云存回放" />

  <AppContainer extraClass="space-y-2">
    <div class="relative">
      <canvas ref="canvas" class="block aspect-video w-full bg-neutral-900 rounded-lg"></canvas>

      <div
        class="absolute inset-x-1.5 bottom-0 pt-2"
        :class="range ? 'cursor-pointer' : ''"
        role="slider"
        aria-label="播放进度"
        :aria-valuemin="range?.startTimeMs ?? 0"
        :aria-valuemax="range?.endTimeMs ?? 0"
        :aria-valuenow="range ? state.currentTimeMs : 0"
        :aria-disabled="!range"
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
          <button type="button" class="btn btn-sm" :disabled="!range" @click="session.pause()">暂停</button>
          <button type="button" class="btn btn-sm" :disabled="!range" @click="session.resume()">继续</button>
          <button type="button" class="btn btn-sm" :disabled="!range" @click="session.stop()">停止</button>

          <!-- 倍速 -->
          <select class="select select-sm w-auto" :value="String(state.speed)" @change="handleSpeed">
            <option v-for="item in SPEEDS" :key="item" :value="String(item)">{{ item }}×</option>
          </select>
          <span
            v-if="state.speed !== 1"
            class="tooltip tooltip-top text-xs text-base-content/50"
            data-tip="非 1 倍速时静音"
            >静音</span
          >

          <span class="ms-auto text-sm text-base-content/70">{{ currentTimeText }}</span>
        </div>
      </div>
    </div>

    <QueryCard
      :state="state"
      @query="(params) => session.query(params)"
      @select-date="(date) => session.selectDate(date)"
      @play="(recording) => session.play(recording)"
      @export="(recording) => session.exportRange(recording)"
      @cancel-export="() => session.cancelExport()"
    />
  </AppContainer>
</template>
