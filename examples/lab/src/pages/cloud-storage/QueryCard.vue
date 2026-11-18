<script setup>
import { computed, reactive, ref } from 'vue';
import { NDatePicker } from 'naive-ui';
import { IconLink } from '@/components/icons';
import { readUrlParams, formatTime } from './index.module.js';

const props = defineProps({
  player: { type: Object, default: null },
  session: { type: Object, required: true },
});

const form = reactive(readUrlParams());
// 凭证来自链接，默认收成一行。缺 App ID 或 Token 时展开，方便补填。
const credentialsOpen = ref(!form.appId.trim() || !form.token.trim());

const recordingDays = computed(() => props.session.days.filter((day) => day.hasRecording));

function shortenMiddle(value, head = 4, tail = 4) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function maskToken(value) {
  const text = value.trim();
  if (!text) return '未填写';
  return `••••${text.slice(-4)}`;
}

function formatEndpoint(value) {
  const text = value.trim();
  if (!text) return '正式环境';
  return text.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

const credentialSummary = computed(() => {
  const appId = form.appId.trim();
  const appLabel = appId ? shortenMiddle(appId) : '未填写';
  return `App ${appLabel} · Token ${maskToken(form.token)} · ${formatEndpoint(form.endpoint)}`;
});

// 已加载月份里，没有录像的日期不可选。其它月份仍可选，选中后再查那个月。
function isDateDisabled(timestamp) {
  if (!props.session.loadedMonth) return false;
  const date = new Date(timestamp).toLocaleDateString('sv-SE');
  if (date === form.date || date.slice(0, 7) !== props.session.loadedMonth) return false;
  return !props.session.days.some((day) => day.date === date && day.hasRecording);
}

function applyResult(result) {
  props.session.days = result.days;
  props.session.recordings = result.recordings;
  props.session.loadedMonth = result.month;
}

async function handleQuery() {
  if (!form.date) {
    props.session.status = '请选择日期';
    return;
  }
  if (!form.appId.trim()) {
    credentialsOpen.value = true;
    props.session.status = '请填写 App ID';
    return;
  }
  if (!form.token.trim()) {
    credentialsOpen.value = true;
    props.session.status = '请填写 Token';
    return;
  }
  if (!props.player) return;

  const result = await props.player.query({
    appId: form.appId.trim(),
    token: form.token.trim(),
    endpoint: form.endpoint.trim(),
    date: form.date,
    speed: Number(props.session.speed),
  });
  if (result.ready) props.session.queried = true;
  applyResult(result);
}

// 换日期只重新查询，不重新 init
async function loadDate(date) {
  if (!props.session.queried || !date || !props.player) return;
  form.date = date;
  applyResult(await props.player.selectDate(date));
}

function handlePlay(range) {
  props.player?.play(range);
}

function handleExport(range) {
  props.player?.exportRange(range);
}

function handleCancelExport() {
  props.player?.cancelExport();
}
</script>

<template>
  <div class="card bg-base-100 shadow-sm">
    <div class="card-body">
      <div class="flex items-center justify-between gap-2">
        <h2 class="card-title">云存回放</h2>
        <div class="tooltip tooltip-left" data-tip="生成链接">
          <RouterLink to="/play-url/cloud-storage" class="btn btn-ghost btn-sm btn-circle" aria-label="生成链接">
            <IconLink class="h-4 w-4" />
          </RouterLink>
        </div>
      </div>

      <form class="space-y-3" @submit.prevent="handleQuery">
        <div class="flex flex-wrap items-end gap-3">
          <fieldset class="fieldset min-w-48 flex-1 sm:max-w-xs">
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

          <button type="submit" class="btn btn-primary">查询</button>
          <span class="text-sm text-base-content/70">{{ session.status }}</span>
        </div>

        <div class="flex items-center justify-between gap-2">
          <p v-if="!credentialsOpen" class="min-w-0 text-sm break-all text-base-content/70">
            {{ credentialSummary }}
          </p>
          <button
            type="button"
            class="btn btn-ghost btn-sm ms-auto shrink-0"
            @click="credentialsOpen = !credentialsOpen"
          >
            {{ credentialsOpen ? '收起' : '修改' }}
          </button>
        </div>

        <div v-if="credentialsOpen" class="grid grid-cols-1 gap-4">
          <fieldset class="fieldset">
            <label class="fieldset-label" for="app-id">App ID</label>
            <input id="app-id" v-model="form.appId" type="text" class="input w-full" />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="token">Token</label>
            <input id="token" v-model="form.token" type="text" class="input w-full" autocomplete="off" />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="endpoint">服务地址（留空为正式环境）</label>
            <input
              id="endpoint"
              v-model="form.endpoint"
              type="text"
              class="input w-full"
              placeholder="https://api-cloudstorage.tange365.com"
            />
          </fieldset>
        </div>
      </form>

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

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <button
          v-if="session.exporting"
          type="button"
          class="btn btn-outline btn-error btn-sm"
          @click="handleCancelExport"
        >
          取消导出
        </button>
        <span class="text-sm text-base-content/70">{{ session.exportStatus }}</span>
      </div>

      <div v-if="session.recordings.length" class="mt-3 overflow-hidden rounded-lg border border-base-300">
        <div
          v-for="range in session.recordings"
          :key="range.startTimeMs"
          class="flex items-center gap-2 border-b border-base-300 px-3 py-2 last:border-b-0"
        >
          <button type="button" class="btn btn-link btn-sm h-auto min-h-0 px-0" @click="handlePlay(range)">
            {{ formatTime(range.startTimeMs) }} - {{ formatTime(range.endTimeMs) }}
          </button>
          <button
            type="button"
            class="btn btn-outline btn-primary btn-sm ms-auto"
            :disabled="session.exporting"
            @click="handleExport(range)"
          >
            导出
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
