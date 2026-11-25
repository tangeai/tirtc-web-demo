<script setup>
// 云存回放示例。回放逻辑和日期工具都在 replay/。
// 这里把客户端、查询、播放和导出串起来，并管画面、播放控制和进度条。
// 查询表单和录像列表在 QueryCard.vue。
import { computed, shallowRef, onMounted, onUnmounted } from 'vue';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import {
  CloudClient,
  Query,
  ReplayPlayer,
  Exporter,
  SPEEDS,
  initialQueryState,
  initialPlayerState,
  initialExportState,
} from './replay';
import { formatTime } from './replay/date-utils.js';
import QueryCard from './QueryCard.vue';

const canvas = shallowRef(null);
// 类实例，不需要深层响应式
let client = null;
let query = null;
let player = null;
let exporter = null;
// 各自状态的副本，每次 change 都整体替换
const queryState = shallowRef(initialQueryState);
const playerState = shallowRef(initialPlayerState);
const exportState = shallowRef(initialExportState);

const range = computed(() => playerState.value.range);

// 当前时间在本次播放区间里的位置，0 ~ 1。没在播时为 0
const progress = computed(() => {
  if (!range.value) return 0;
  const { startTimeMs, endTimeMs } = range.value;
  const ratio = (playerState.value.currentTimeMs - startTimeMs) / (endTimeMs - startTimeMs);
  return Math.min(1, Math.max(0, ratio));
});

function handleSpeed(event) {
  player.setSpeed(Number(event.target.value));
  // 设置失败时 speed 不变，下拉框要拨回去
  event.target.value = String(playerState.value.speed);
}

// 点击位置换成绝对时间。seek 要求 timeMs < end，贴到末尾会被拒绝，所以最多停在结束前 1ms
function handleSeek(event) {
  if (!range.value) return;
  const { startTimeMs, endTimeMs } = range.value;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  player.seek(Math.min(startTimeMs + ratio * (endTimeMs - startTimeMs), endTimeMs - 1));
}

// 查询和切日期都会停掉当前回放。输入不合法时 query 返回 false，播放继续。
// 播放和导出用的是客户端建好的 storage
function handleQuery(params) {
  if (query.query(params)) player.stop();
}

function handleSelectDate(date) {
  player.stop();
  query.selectDate(date);
}

function handlePlay(recording) {
  player.play(client.storage, recording);
}

function handleExport(recording) {
  exporter.start(client.storage, recording);
}

onMounted(() => {
  client = new CloudClient();
  query = new Query(client);
  player = new ReplayPlayer({ view: canvas.value });
  exporter = new Exporter();
  query.on('change', (next) => {
    queryState.value = next;
  });
  player.on('change', (next) => {
    playerState.value = next;
  });
  exporter.on('change', (next) => {
    exportState.value = next;
  });
});

onUnmounted(() => {
  exporter?.dispose();
  player?.dispose();
  query?.dispose();
  client?.dispose();
  exporter = null;
  player = null;
  query = null;
  client = null;
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
        :aria-valuenow="range ? playerState.currentTimeMs : 0"
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
          <button type="button" class="btn btn-sm" :disabled="!range" @click="player.pause()">暂停</button>
          <button type="button" class="btn btn-sm" :disabled="!range" @click="player.resume()">继续</button>
          <button type="button" class="btn btn-sm" :disabled="!range" @click="player.stop()">停止</button>

          <!-- 倍速 -->
          <select class="select select-sm w-auto" :value="String(playerState.speed)" @change="handleSpeed">
            <option v-for="item in SPEEDS" :key="item" :value="String(item)">{{ item }}×</option>
          </select>
          <span
            v-if="playerState.speed !== 1"
            class="tooltip tooltip-top text-xs text-base-content/50"
            data-tip="非 1 倍速时静音"
            >静音</span
          >

          <div class="ms-auto text-right text-[11px] tabular-nums leading-tight sm:text-xs">
            <div class="text-base-content/70">{{ range ? formatTime(playerState.currentTimeMs) : '--:--:--' }}</div>
            <div v-if="range" class="text-base-content/40">{{ formatTime(range.endTimeMs) }}</div>
          </div>
        </div>

        <p v-if="playerState.status" class="text-xs text-base-content/60" role="status">{{ playerState.status }}</p>
      </div>
    </div>

    <QueryCard
      :query="queryState"
      :export-state="exportState"
      @query="handleQuery"
      @select-date="handleSelectDate"
      @play="handlePlay"
      @export="handleExport"
      @cancel-export="() => exporter.cancel()"
    />
  </AppContainer>
</template>
