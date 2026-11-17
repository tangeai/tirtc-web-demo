<script setup>
import { computed, reactive, ref, onMounted, onUnmounted } from 'vue';
import { NConfigProvider, NDatePicker, zhCN, dateZhCN } from 'naive-ui';
import { EXPORT_HINT, SPEEDS, readUrlParams, formatTime, SampleCloudStorage } from './index.module.js';

const form = reactive(readUrlParams());
const status = ref('');
const currentTime = ref('--:--:--');
const exportStatus = ref(EXPORT_HINT);
const exporting = ref(false);
const queried = ref(false);
const days = ref([]);
const recordings = ref([]);
const loadedMonth = ref('');
const speed = ref('1');
const videoView = ref(null);

let player = null;

const recordingDays = computed(() => days.value.filter((day) => day.hasRecording));

// 已加载月份里，没有录像的日期不可选。其它月份仍可选，选中后再查那个月。
function isDateDisabled(timestamp) {
  if (!loadedMonth.value) return false;
  const date = new Date(timestamp).toLocaleDateString('sv-SE');
  if (date === form.date || date.slice(0, 7) !== loadedMonth.value) return false;
  return !days.value.some((day) => day.date === date && day.hasRecording);
}

function applyResult(result) {
  days.value = result.days;
  recordings.value = result.recordings;
  loadedMonth.value = result.month;
}

async function handleQuery() {
  if (!form.date) {
    status.value = '请选择日期';
    return;
  }
  if (!player) return;

  const result = await player.query({
    appId: form.appId.trim(),
    token: form.token.trim(),
    endpoint: form.endpoint.trim(),
    date: form.date,
    speed: Number(speed.value),
  });
  if (result.ready) queried.value = true;
  applyResult(result);
}

// 换日期只重新查询，不重新 init
async function loadDate(date) {
  if (!queried.value || !date || !player) return;
  form.date = date;
  applyResult(await player.selectDate(date));
}

function handlePlay(range) {
  player?.play(range);
}

function handlePause() {
  player?.pause();
}

function handleResume() {
  player?.resume();
}

function handleStop() {
  player?.stop();
}

function handleCancelExport() {
  player?.cancelExport();
}

function handleSpeed(event) {
  const next = player?.setSpeed(event.target.value);
  speed.value = String(next ?? event.target.value);
}

function handleExport(range) {
  player?.exportRange(range);
}

onMounted(() => {
  player = new SampleCloudStorage({
    view: videoView.value,
    onStatus: (text) => {
      status.value = text;
    },
    onTime: (text) => {
      currentTime.value = text;
    },
    onExportStatus: (text) => {
      exportStatus.value = text;
    },
    onExporting: (active) => {
      exporting.value = active;
    },
  });
});

onUnmounted(() => {
  player?.dispose();
  player = null;
});
</script>

<template>
  <n-config-provider :locale="zhCN" :date-locale="dateZhCN">
    <div class="mx-auto max-w-3xl space-y-4 p-4">
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">云存回放</h2>

          <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="handleQuery">
            <fieldset class="fieldset">
              <label class="fieldset-label" for="app-id">App ID</label>
              <input id="app-id" v-model="form.appId" type="text" class="input w-full" required />
            </fieldset>

            <fieldset class="fieldset">
              <label class="fieldset-label" for="date">日期</label>
              <n-date-picker
                id="date"
                v-model:formatted-value="form.date"
                class="w-full"
                type="date"
                format="yyyy-MM-dd"
                :is-date-disabled="isDateDisabled"
                @update:formatted-value="loadDate"
              />
            </fieldset>

            <fieldset class="fieldset sm:col-span-2">
              <label class="fieldset-label" for="token">Token</label>
              <input id="token" v-model="form.token" type="text" class="input w-full" autocomplete="off" required />
            </fieldset>

            <fieldset class="fieldset sm:col-span-2">
              <label class="fieldset-label" for="endpoint">服务地址（留空为正式环境）</label>
              <input
                id="endpoint"
                v-model="form.endpoint"
                type="text"
                class="input w-full"
                placeholder="https://api-cloudstorage.tange365.com"
              />
            </fieldset>

            <div class="flex flex-wrap items-center gap-3 sm:col-span-2">
              <button type="submit" class="btn btn-primary">查询</button>
              <span class="text-sm text-base-content/70">{{ status }}</span>
            </div>
          </form>

          <!-- listRecordingDays 的结果：点一天加载那天的录像段，并同步上面的日期 -->
          <div v-if="recordingDays.length" class="mt-4 flex flex-wrap gap-2">
            <button
              v-for="day in recordingDays"
              :key="day.date"
              type="button"
              class="btn btn-sm"
              :class="day.date === form.date ? 'btn-primary' : 'btn-outline'"
              :title="day.date"
              @click="loadDate(day.date)"
            >
              {{ day.date.slice(5) }}
            </button>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <canvas ref="videoView" class="block aspect-video w-full bg-neutral-900"></canvas>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" class="btn btn-sm" @click="handlePause">暂停</button>
            <button type="button" class="btn btn-sm" @click="handleResume">继续</button>
            <button type="button" class="btn btn-sm" @click="handleStop">停止</button>
            <select class="select select-sm w-auto" :value="speed" title="倍速，非 1 倍速静音" @change="handleSpeed">
              <option v-for="item in SPEEDS" :key="item" :value="String(item)">{{ item }}×</option>
            </select>
            <span class="text-sm text-base-content/70">非 1 倍速静音</span>
            <span class="ms-auto text-sm text-base-content/70">{{ currentTime }}</span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button v-if="exporting" type="button" class="btn btn-outline btn-error btn-sm" @click="handleCancelExport">
              取消导出
            </button>
            <span class="text-sm text-base-content/70">{{ exportStatus }}</span>
          </div>

          <div v-if="recordings.length" class="mt-3 overflow-hidden rounded-lg border border-base-300">
            <div
              v-for="range in recordings"
              :key="range.startTimeMs"
              class="flex items-center gap-2 border-b border-base-300 px-3 py-2 last:border-b-0"
            >
              <button type="button" class="btn btn-link btn-sm h-auto min-h-0 px-0" @click="handlePlay(range)">
                {{ formatTime(range.startTimeMs) }} - {{ formatTime(range.endTimeMs) }}
              </button>
              <button
                type="button"
                class="btn btn-outline btn-primary btn-sm ms-auto"
                :disabled="exporting"
                @click="handleExport(range)"
              >
                导出
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </n-config-provider>
</template>
