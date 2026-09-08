<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { readUrlParams, initTiRtc, SamplePlayer } from './index.module.js';

const form = reactive({
  deviceId: '',
  token: '',
  appId: '',
});

const playerReady = ref(false);
const toast = reactive({
  show: false,
  message: '',
  type: 'info',
});

let player = null;
let toastTimer = null;

function showToast(message, type = 'info') {
  toast.message = message;
  toast.type = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-success' : 'alert-info';
  toast.show = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.show = false;
  }, 4000);
}

function handlePlay() {
  player?.play({
    deviceId: form.deviceId.trim(),
    token: form.token.trim(),
  });
}

function handleStop() {
  player?.stop();
}

function handleStartTalkback() {
  player?.startTalkback();
}

function handleStopTalkback() {
  player?.stopTalkback();
}

function handleSendCommand() {
  player?.sendStatusCommand();
}

function handleSendStreamMessage() {
  player?.sendHelloStreamMessage();
}

onMounted(async () => {
  const params = readUrlParams();
  form.deviceId = params.deviceId;
  form.token = params.token;
  form.appId = params.appId;

  initTiRtc(form.appId);

  player = new SamplePlayer({
    onToast: showToast,
    onError: (error) => {
      showToast(String(error), 'error');
    },
  });

  await player.ready();
  playerReady.value = true;
});

onUnmounted(() => {
  clearTimeout(toastTimer);
  player?.stop();
  player = null;
});
</script>

<template>
  <div>
    <!-- 当前 SDK 要求 canvas 的 id 必须是 canvas；不能有边框/内边距，否则鼠标坐标会错 -->
    <canvas id="canvas" class="video-container"></canvas>

    <div class="mx-auto max-w-3xl space-y-4 p-4">
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">实时直播</h2>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset class="fieldset">
              <label class="fieldset-label">设备ID</label>
              <input v-model="form.deviceId" type="text" class="input w-full" />
            </fieldset>

            <fieldset class="fieldset">
              <label class="fieldset-label">Token</label>
              <input v-model="form.token" type="text" class="input w-full" />
            </fieldset>
          </div>

          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn btn-primary" :disabled="!playerReady" @click="handlePlay">播放</button>
            <button type="button" class="btn" @click="handleStop">停止</button>
            <button type="button" class="btn" @click="handleStartTalkback">开始对讲</button>
            <button type="button" class="btn" @click="handleStopTalkback">停止对讲</button>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">命令 & 流消息</h2>
          <div class="flex flex-wrap gap-3">
            <button type="button" class="btn" @click="handleSendCommand">发送命令</button>
            <button type="button" class="btn" @click="handleSendStreamMessage">发送流消息</button>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">公共参数</h2>
          <fieldset class="fieldset">
            <label class="fieldset-label">App ID</label>
            <input v-model="form.appId" type="text" class="input w-full" disabled />
          </fieldset>
        </div>
      </div>
    </div>

    <div class="toast toast-top toast-end z-50">
      <div v-if="toast.show" class="alert" :class="toast.type">
        <span>{{ toast.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* the canvas *must not* have any border or padding, or mouse coords will be wrong */
.video-container {
  display: block;
  width: calc(100vw * 0.96);
  height: calc(100vw * 0.96 * 9 / 16);
  margin: 10px auto 0;
  padding: 0;
  background-color: #111;
}

@media screen and (min-width: 576px) {
  .video-container {
    width: calc(100vw * 0.56);
    height: calc(100vw * 0.56 * 9 / 16);
  }
}
</style>
