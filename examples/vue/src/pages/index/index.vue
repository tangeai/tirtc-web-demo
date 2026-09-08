<script setup>
import { reactive, ref, onMounted } from 'vue';
import { getDefaultFormValues, saveForm, createToken, buildPlayerUrl } from './index.module.js';

const form = reactive({
  ak: '',
  sk: '',
  uid: '',
  deviceId: '',
  appId: '',
  ttl: '300',
});

const playerUrl = ref('');
const copyHint = ref(false);

function isFormReady() {
  return Boolean(form.ak && form.sk && form.uid && form.deviceId && form.appId);
}

async function generateAndShow() {
  if (!isFormReady()) return false;

  const ttl = Number.parseInt(form.ttl, 10) || 300;
  if (ttl <= 0) {
    window.alert('ttl 必须是正整数');
    return false;
  }

  const token = await createToken({
    ak: form.ak.trim(),
    sk: form.sk.trim(),
    uid: form.uid.trim(),
    deviceId: form.deviceId.trim(),
    ttl,
  });

  playerUrl.value = buildPlayerUrl({
    deviceId: form.deviceId.trim(),
    appId: form.appId.trim(),
    token,
  });
  copyHint.value = false;

  saveForm({
    ak: form.ak.trim(),
    sk: form.sk.trim(),
    uid: form.uid.trim(),
    deviceId: form.deviceId.trim(),
    appId: form.appId.trim(),
    ttl,
  });
  return true;
}

function handleSubmit() {
  generateAndShow();
}

function openPlayerPage() {
  if (!playerUrl.value) return;
  window.open(playerUrl.value, 'device-player-page');
}

async function copyPlayerUrl() {
  if (!playerUrl.value) return;
  await navigator.clipboard.writeText(playerUrl.value);
  copyHint.value = true;
}

onMounted(() => {
  Object.assign(form, getDefaultFormValues());
  // 必填项齐全则自动生成一次，方便本机反复调试
  generateAndShow();
});
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4 p-4">
    <!-- 生成本地播放链接；SK 只用于本页签名，不会写入播放 URL -->
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">生成播放链接</h2>

        <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="handleSubmit">
          <fieldset class="fieldset">
            <label class="fieldset-label" for="ak">Access Key (ak)</label>
            <input id="ak" v-model="form.ak" type="text" class="input w-full" autocomplete="off" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="sk">Secret Key (sk)</label>
            <input id="sk" v-model="form.sk" type="password" class="input w-full" autocomplete="off" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="uid">用户 ID (uid)</label>
            <input id="uid" v-model="form.uid" type="text" class="input w-full" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="device-id">设备 ID (device_id)</label>
            <input id="device-id" v-model="form.deviceId" type="text" class="input w-full" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="app-id">App ID (app_id)</label>
            <input id="app-id" v-model="form.appId" type="text" class="input w-full" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="ttl">有效秒数 (ttl)</label>
            <input id="ttl" v-model="form.ttl" type="number" min="1" class="input w-full" />
          </fieldset>

          <div class="sm:col-span-2">
            <button type="submit" class="btn btn-primary">生成链接</button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="playerUrl" class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">播放链接</h2>
        <p class="break-all">{{ playerUrl }}</p>
        <div class="flex flex-wrap items-center gap-3">
          <button type="button" class="btn btn-primary" @click="openPlayerPage">打开播放页</button>
          <button type="button" class="btn" @click="copyPlayerUrl">复制链接</button>
          <span v-if="copyHint" class="text-success">已复制</span>
        </div>
      </div>
    </div>
  </div>
</template>
