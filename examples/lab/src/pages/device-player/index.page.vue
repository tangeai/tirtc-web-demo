<script setup>
// 实时直播示例。SDK 调用都在 live-session.js，和设备约定的流号、命令在 protocol.js，
// 这里只管表单、按钮状态和提示文案。
import { computed, reactive, ref, shallowRef, onMounted, onUnmounted } from 'vue';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import { IconLink } from '@/components/icons';
import { TiRtc, TiRtcInitOptions } from '@/libs/tirtc';
import { LiveSession, Phase } from './live-session.js';
import { STREAMS, AUDIO_INPUT_SAMPLE_RATE, COMMAND, textOf, hex, requestDeviceStatus, sendHelloMessage } from './protocol.js';

const form = reactive({
  deviceId: '',
  token: '',
  appId: '',
});

const canvas = ref(null);
// 视频解码依赖 wasm，加载完成前不能播放
const wasmReady = ref(false);
// 会话状态的副本，会话每次 change 都整体替换
const live = shallowRef({ phase: Phase.IDLE, talking: false, error: null });

const phaseText = {
  [Phase.IDLE]: '未播放',
  [Phase.CONNECTING]: '连接中',
  [Phase.PLAYING]: '播放中',
  [Phase.FAILED]: '连接失败',
};
const playing = computed(() => live.value.phase === Phase.PLAYING);
const canPlay = computed(
  () => wasmReady.value && (live.value.phase === Phase.IDLE || live.value.phase === Phase.FAILED),
);

// 卡片只展示概要。弹层改的是草稿，确定才写回 form，取消丢掉。
const editor = ref(null);
const draft = reactive({
  deviceId: '',
  token: '',
  appId: '',
});
const toast = reactive({
  show: false,
  message: '',
  type: 'info',
});

const toastClassByType = {
  error: 'alert-error',
  success: 'alert-success',
  info: 'alert-info',
};

let session = null;
let toastTimer = null;

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = toastClassByType[type] || toastClassByType.info;
  toast.show = true;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.show = false;
  }, 4000);
}

function shortenMiddle(value, head = 4, tail = 4) {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatCredential(value) {
  const text = value.trim();
  if (!text) return '未填写';
  return shortenMiddle(text, 12, 8);
}

function openEditor() {
  draft.deviceId = form.deviceId;
  draft.token = form.token;
  draft.appId = form.appId;
  editor.value?.showModal();
}

function closeEditor() {
  editor.value?.close();
}

function confirmEditor() {
  const nextAppId = draft.appId.trim();
  const appIdChanged = nextAppId !== form.appId.trim();
  form.deviceId = draft.deviceId;
  form.token = draft.token;
  form.appId = draft.appId;
  closeEditor();
  // initialize 只认当时传入的 App ID。和进页时不一样，确定后要再调一次。
  // 设备 ID、Token 下次点播放才用，这里不用重连。
  if (appIdChanged) initTiRtc(nextAppId);
}

function initTiRtc(appId) {
  TiRtc.initialize(TiRtcInitOptions({ appId }));
}

// 失败提示统一在这里出，会话本身不弹提示
function toastError(prefix) {
  return (error) => showToast(`${prefix}：${error.message}`, 'error');
}

function handlePlay() {
  const deviceId = form.deviceId.trim();
  if (!deviceId) {
    openEditor();
    showToast('请输入设备ID');
    return;
  }
  session.start({ deviceId, token: form.token.trim() }).catch(toastError('连接失败'));
}

function handleStop() {
  session.stop();
}

function handleStartTalkback() {
  session.startTalkback().catch(toastError('开始对讲失败'));
}

function handleStopTalkback() {
  session.stopTalkback().catch(toastError('停止对讲失败'));
}

// 发送成功只表示设备收到了请求，状态结果在 onDeviceCommand 里
function handleSendCommand() {
  requestDeviceStatus(session.connection)
    .then(() => showToast('已发送设备状态请求'))
    .catch(toastError('发送命令失败'));
}

function handleSendStreamMessage() {
  sendHelloMessage(session.connection)
    .then(() => showToast('已发送流消息'))
    .catch(toastError('发送流消息失败'));
}

function onDeviceCommand({ commandId, data }) {
  const text = textOf(data);
  if (commandId === COMMAND.GET_DEVICE_STATUS_RESULT) {
    showToast(`设备状态响应: ${text}`, 'success');
    return;
  }
  console.log(`received command ${hex(commandId)} payload=${text}`);
}

function onDeviceStreamMessage({ streamId, timestampMs, data }) {
  const text = textOf(data);
  if (text) showToast(`收到设备流消息: ${text}`, 'success');
  console.log(`received stream message stream_id=${hex(streamId)} timestamp_ms=${timestampMs} payload=${text}`);
}

function readUrlParams() {
  const search = new URLSearchParams(window.location.search);
  return {
    deviceId: search.get('device_id') || '',
    appId: search.get('app_id') || '',
    token: search.get('token') || '',
  };
}

onMounted(async () => {
  // 1. 从 URL 带回 device_id / token / app_id
  Object.assign(form, readUrlParams());

  // 2. 进页先 initialize。之后只在弹框里改了 App ID 并确定时再调一次
  initTiRtc(form.appId);

  // 3. 创建会话，订阅状态和设备消息
  session = new LiveSession({
    view: canvas.value,
    streams: STREAMS,
    audioInputOptions: { sampleRate: AUDIO_INPUT_SAMPLE_RATE },
  });
  session.on('change', (state) => {
    live.value = state;
  });
  session.on('command', onDeviceCommand);
  session.on('streamMessage', onDeviceStreamMessage);

  // 4. 等 wasm 就绪后才能点播放
  try {
    await TiRtc.videoOutputReady();
    wasmReady.value = true;
  } catch (error) {
    showToast(`播放器加载失败：${error.message}`, 'error');
  }
});

onUnmounted(() => {
  clearTimeout(toastTimer);
  session?.dispose();
  session = null;
});
</script>

<template>
  <AppHeader title="实时直播" />

  <AppContainer extraClass="space-y-2">
    <!-- canvas 不要加边框或内边距，否则画面坐标会偏 -->
    <canvas ref="canvas" class="block aspect-video w-full bg-neutral-900 rounded-lg"></canvas>

    <div class="card card-sm bg-base-100 shadow-sm">
      <div class="card-body">
        <div class="flex items-center justify-between gap-2">
          <h2 class="card-title text-base">控制台</h2>
          <div class="flex items-center gap-1">
            <span
              class="badge badge-sm"
              :class="{ 'badge-success': playing, 'badge-error': live.phase === Phase.FAILED }"
              :title="live.error?.message"
            >
              {{ phaseText[live.phase] }}{{ live.talking ? ' · 对讲中' : '' }}
            </span>
            <button type="button" class="btn btn-ghost btn-sm" @click="openEditor">编辑</button>
            <div class="tooltip tooltip-left" data-tip="生成链接">
              <RouterLink to="/play-url/rtc" class="btn btn-ghost btn-sm btn-circle" aria-label="生成链接">
                <IconLink class="h-4 w-4" />
              </RouterLink>
            </div>
          </div>
        </div>

        <dl class="space-y-1 text-sm">
          <div class="flex items-center gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">设备 ID</dt>
            <dd
              class="min-w-0 flex-1 truncate"
              :class="form.deviceId.trim() ? '' : 'text-warning'"
              :title="form.deviceId"
            >
              {{ form.deviceId.trim() || '未填写' }}
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">Token</dt>
            <dd
              class="min-w-0 flex-1 truncate font-mono"
              :class="form.token.trim() ? '' : 'text-warning'"
              :title="form.token"
            >
              {{ formatCredential(form.token) }}
            </dd>
          </div>
          <div class="flex items-center gap-3">
            <dt class="w-16 shrink-0 text-base-content/50 text-xs">App ID</dt>
            <dd
              class="min-w-0 flex-1 truncate font-mono"
              :class="form.appId.trim() ? '' : 'text-warning'"
              :title="form.appId"
            >
              {{ formatCredential(form.appId) }}
            </dd>
          </div>
        </dl>

        <!-- 按钮不在 form 里，不必再套一层弹层组件。showModal 已处理 Esc 和点遮罩关闭。 -->
        <dialog ref="editor" class="modal modal-bottom sm:modal-middle">
          <div class="modal-box">
            <h3 class="text-lg font-medium">连接参数</h3>
            <div class="mt-4 grid grid-cols-1 gap-4">
              <fieldset class="fieldset">
                <label class="fieldset-label" for="device-id">设备ID</label>
                <input id="device-id" v-model="draft.deviceId" type="text" class="input w-full" />
              </fieldset>

              <fieldset class="fieldset">
                <label class="fieldset-label" for="token">Token</label>
                <input id="token" v-model="draft.token" type="text" class="input w-full" autocomplete="off" />
              </fieldset>

              <fieldset class="fieldset">
                <label class="fieldset-label" for="app-id">App ID</label>
                <input id="app-id" v-model="draft.appId" type="text" class="input w-full" />
              </fieldset>
            </div>
            <div class="modal-action">
              <button type="button" class="btn" @click="closeEditor">取消</button>
              <button type="button" class="btn btn-primary" @click="confirmEditor">确定</button>
            </div>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button>关闭</button>
          </form>
        </dialog>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!canPlay" @click="handlePlay">播放</button>
          <button type="button" class="btn btn-sm" :disabled="live.phase === Phase.IDLE" @click="handleStop">
            停止
          </button>
          <button type="button" class="btn btn-sm" :disabled="!playing || live.talking" @click="handleStartTalkback">
            开始对讲
          </button>
          <button type="button" class="btn btn-sm" :disabled="!live.talking" @click="handleStopTalkback">
            停止对讲
          </button>
        </div>
      </div>
    </div>

    <div class="card card-sm bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title text-base">命令 & 流消息</h2>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm" :disabled="!playing" @click="handleSendCommand">发送命令</button>
          <button type="button" class="btn btn-sm" :disabled="!playing" @click="handleSendStreamMessage">
            发送流消息
          </button>
        </div>
      </div>
    </div>

    <div class="toast toast-top toast-end z-50">
      <div v-if="toast.show" class="alert" :class="toast.type">
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </AppContainer>
</template>
