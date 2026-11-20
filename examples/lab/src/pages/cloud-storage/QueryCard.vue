<script setup lang="jsx">
import { computed, reactive, ref, Teleport } from 'vue';
import dayjs from 'dayjs';
import { NDatePicker } from 'naive-ui';
import { IconLink } from '@/components/icons';
import {
  EXPORT_TIP,
  dateRangeError,
  formatDuration,
  formatTime,
  readUrlParams,
  recentDayTimestamps,
} from './index.module.js';

// 不用 showModal，浏览器不会处理 Esc。关闭函数记在这里，弹层卸掉时一起卸掉监听。
let escapeBinding = null;

function bindEscape(el, onClose) {
  if (escapeBinding?.el === el && el) {
    escapeBinding.onClose = onClose;
    return;
  }
  unbindEscape();
  if (!el) return;
  const onKeydown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    escapeBinding?.onClose?.();
  };
  escapeBinding = { el, onClose, onKeydown };
  window.addEventListener('keydown', onKeydown);
}

function unbindEscape() {
  if (!escapeBinding) return;
  window.removeEventListener('keydown', escapeBinding.onKeydown);
  escapeBinding = null;
}

// 凭证编辑弹层。窄屏贴底，输入框能用满宽度；sm 以上回到居中对话框。
// Teleport 到 body：确定/取消如果留在查询 form 里，会把查询也提交掉。
function EditorDialog({ open, title, onClose, onConfirm }, { slots }) {
  if (!open) return null;

  return (
    <Teleport to="body">
      <dialog
        class="modal modal-open modal-bottom sm:modal-middle"
        aria-modal="true"
        aria-labelledby="credential-editor-title"
        ref={(el) => bindEscape(el, onClose)}
      >
        <div class="modal-box">
          <h3 id="credential-editor-title" class="text-lg font-medium">
            {title}
          </h3>
          <div class="mt-4">{slots.default?.()}</div>
          <div class="modal-action">
            <button type="button" class="btn" onClick={onClose}>
              取消
            </button>
            <button type="button" class="btn btn-primary" onClick={onConfirm}>
              确定
            </button>
          </div>
        </div>
        <form class="modal-backdrop">
          <button type="button" onClick={onClose}>
            关闭
          </button>
        </form>
      </dialog>
    </Teleport>
  );
}

// 声明后，关闭回调留在参数里，不会被当成多余属性挂到 Teleport 上。
EditorDialog.props = {
  open: Boolean,
  title: String,
  onClose: Function,
  onConfirm: Function,
};

const props = defineProps({
  player: { type: Object, default: null },
  session: { type: Object, required: true },
});

const params = readUrlParams();
const form = reactive({
  appId: params.appId,
  token: params.token,
  endpoint: params.endpoint,
});
// 查询范围和当前选中的某一天分开。改范围不会自动查询，点「查询」才查。
// format 用 yyyy-MM-dd，这是 Naive UI（date-fns）的写法，不是 dayjs 的 YYYY-MM-DD。
const dateRange = ref([params.startDate, params.endDate]);
const selectedDate = ref('');
// 卡片上只留一行概览。弹层里改的是草稿，确定才写回 form，取消丢弃。
const editorOpen = ref(false);
const draft = reactive({ appId: '', token: '', endpoint: '' });

// 含今天。shortcuts 要的是时间戳。
const dateShortcuts = {
  最近7天: () => recentDayTimestamps(7),
  最近30天: () => recentDayTimestamps(30),
};

function openEditor() {
  draft.appId = form.appId;
  draft.token = form.token;
  draft.endpoint = form.endpoint;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
}

function confirmEditor() {
  form.appId = draft.appId;
  form.token = draft.token;
  form.endpoint = draft.endpoint;
  editorOpen.value = false;
}

const recordingDays = computed(() => props.session.days.filter((day) => day.hasRecording));

function shortenMiddle(value, head = 4, tail = 4) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatCredential(value) {
  const text = value.trim();
  if (!text) return '未填写';
  return shortenMiddle(text, 12, 8);
}

function formatEndpoint(value) {
  const text = value.trim();
  if (!text) return '正式环境';
  return text.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

// 还没到的日期没有录像。超过 31 天留到点「查询」时再提示。
function isFutureDate(timestamp) {
  return dayjs(timestamp).startOf('day').isAfter(dayjs().startOf('day'));
}

function applyResult(result) {
  props.session.days = result.days;
  props.session.recordings = result.recordings;
  selectedDate.value = result.selectedDate || '';
}

async function handleQuery() {
  const [startDate, endDate] = dateRange.value || [];
  const rangeError = dateRangeError(startDate, endDate);
  if (rangeError) {
    props.session.status = rangeError;
    return;
  }
  if (!form.appId.trim()) {
    openEditor();
    props.session.status = '请填写 App ID';
    return;
  }
  if (!form.token.trim()) {
    openEditor();
    props.session.status = '请填写 Token';
    return;
  }
  if (!props.player) return;

  const result = await props.player.query({
    appId: form.appId.trim(),
    token: form.token.trim(),
    endpoint: form.endpoint.trim(),
    startDate,
    endDate,
    speed: Number(props.session.speed),
  });
  if (result.ready) props.session.queried = true;
  applyResult(result);
}

// 点某一天只重查这一天，不重新 init
async function loadDate(date) {
  if (!props.session.queried || !date || !props.player) return;
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
  <div class="card card-sm bg-base-100 shadow-sm">
    <div class="card-body">
      <div class="flex items-center justify-between gap-2">
        <h2 class="card-title text-base">录像查询</h2>
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-ghost btn-sm" @click="openEditor">编辑</button>
          <div class="tooltip tooltip-left" data-tip="生成链接">
            <RouterLink to="/play-url/cloud-storage" class="btn btn-ghost btn-sm btn-circle" aria-label="生成链接">
              <IconLink class="h-4 w-4" />
            </RouterLink>
          </div>
        </div>
      </div>

      <form class="space-y-3" @submit.prevent="handleQuery">
        <dl class="space-y-1 text-sm">
          <div class="flex gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">App ID</dt>
            <dd
              class="min-w-0 flex-1 truncate font-mono"
              :class="form.appId.trim() ? '' : 'text-warning'"
              :title="form.appId"
            >
              {{ formatCredential(form.appId) }}
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">Token</dt>
            <dd
              class="min-w-0 flex-1 truncate font-mono"
              :class="form.token.trim() ? '' : 'text-warning'"
              :title="form.token"
            >
              {{ formatCredential(form.token) }}
            </dd>
          </div>
          <div class="flex gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">服务地址</dt>
            <dd class="min-w-0 flex-1 truncate" :title="form.endpoint">{{ formatEndpoint(form.endpoint) }}</dd>
          </div>
        </dl>

        <EditorDialog :open="editorOpen" title="连接凭证" @close="closeEditor" @confirm="confirmEditor">
          <div class="grid grid-cols-1 gap-4">
            <fieldset class="fieldset">
              <label class="fieldset-label" for="app-id">App ID</label>
              <input id="app-id" v-model="draft.appId" type="text" class="input w-full" />
            </fieldset>

            <fieldset class="fieldset">
              <label class="fieldset-label" for="token">Token</label>
              <input id="token" v-model="draft.token" type="text" class="input w-full" autocomplete="off" />
            </fieldset>

            <fieldset class="fieldset">
              <label class="fieldset-label" for="endpoint">服务地址（留空为正式环境）</label>
              <input
                id="endpoint"
                v-model="draft.endpoint"
                type="text"
                class="input w-full"
                placeholder="https://api-cloudstorage.tange365.com"
              />
            </fieldset>
          </div>
        </EditorDialog>

        <div class="flex flex-wrap items-end gap-3">
          <fieldset class="fieldset min-w-60 max-w-90 flex-1">
            <label class="fieldset-label" for="date">日期</label>
            <n-date-picker
              id="date"
              v-model:formatted-value="dateRange"
              class="w-full"
              type="daterange"
              format="yyyy-MM-dd"
              :shortcuts="dateShortcuts"
              :is-date-disabled="isFutureDate"
            />
          </fieldset>

          <div class="flex h-11 items-center">
            <button type="submit" class="btn btn-primary btn-sm">查询</button>
          </div>
        </div>

        <!-- 播放、跳转也会改这条状态 -->
        <p v-if="session.status" class="text-xs text-base-content/60" role="status">{{ session.status }}</p>
      </form>

      <div v-if="recordingDays.length" class="mt-4 flex flex-wrap gap-2">
        <button
          v-for="day in recordingDays"
          :key="day.date"
          type="button"
          class="btn btn-sm"
          :class="day.date === selectedDate ? 'btn-primary' : 'btn-outline'"
          :title="day.date"
          @click="loadDate(day.date)"
        >
          {{ day.date.slice(5) }}
        </button>
      </div>

      <!-- 空着不渲染。用法写在导出按钮上，这里只留进行中、完成和失败。 -->
      <div v-if="session.exporting || session.exportStatus" class="mt-4 flex flex-wrap items-center gap-2">
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

      <div v-if="session.recordings.length" class="mt-3 rounded-lg border border-base-300">
        <div
          v-for="range in session.recordings"
          :key="range.startTimeMs"
          class="flex items-center gap-2 border-b border-base-300 px-3 py-2 last:border-b-0"
        >
          <span class="min-w-0 text-xs sm:text-sm">
            {{ formatTime(range.startTimeMs) }} - {{ formatTime(range.endTimeMs) }}
            <span class="text-base-content/50"> · {{ formatDuration(range.startTimeMs, range.endTimeMs) }}</span>
          </span>

          <button type="button" class="btn btn-outline btn-primary btn-sm ms-auto" @click="handlePlay(range)">播放</button>

          <div class="tooltip tooltip-left" :data-tip="EXPORT_TIP">
            <button
              type="button"
              class="btn btn-sm"
              :disabled="session.exporting"
              @click="handleExport(range)"
            >
              导出
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
