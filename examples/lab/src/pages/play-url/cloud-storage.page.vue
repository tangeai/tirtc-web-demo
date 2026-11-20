<script setup>
import { reactive, ref, onMounted } from 'vue';
import AppContainer from '../../components/AppContainer.vue';
import AppHeader from '../../components/AppHeader.vue';
import { getDefaultFormValues, saveForm, createToken, buildPlayerUrl } from './cloud-storage.module.js';

const form = reactive({
  accessKeyId: '',
  secretKeyId: '',
  deviceId: '',
  appId: '',
  endpoint: '',
  durationSeconds: '3600',
});

const playerUrl = ref('');
const errorMessage = ref('');
const copyHint = ref(false);
const pending = ref(false);

function isFormReady() {
  return Boolean(form.accessKeyId && form.secretKeyId && form.deviceId && form.appId);
}

async function generateAndShow() {
  if (!isFormReady() || pending.value) return false;

  pending.value = true;
  errorMessage.value = '';
  copyHint.value = false;

  try {
    const issued = await createToken({
      accessKeyId: form.accessKeyId.trim(),
      secretKeyId: form.secretKeyId.trim(),
      deviceId: form.deviceId.trim(),
      appId: form.appId.trim(),
      endpoint: form.endpoint.trim(),
      durationSeconds: form.durationSeconds,
    });

    playerUrl.value = buildPlayerUrl({
      appId: form.appId.trim(),
      token: issued.token,
      endpoint: issued.endpoint,
    });

    saveForm({
      accessKeyId: form.accessKeyId.trim(),
      secretKeyId: form.secretKeyId.trim(),
      deviceId: form.deviceId.trim(),
      appId: form.appId.trim(),
      endpoint: form.endpoint.trim(),
      durationSeconds: issued.durationSeconds,
    });
    return true;
  } catch (error) {
    playerUrl.value = '';
    errorMessage.value = error instanceof Error ? error.message : String(error);
    return false;
  } finally {
    pending.value = false;
  }
}

function handleSubmit() {
  generateAndShow();
}

function openPlayerPage() {
  if (!playerUrl.value) return;
  window.location.assign(playerUrl.value);
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
  <AppHeader />

  <AppContainer extraClass="space-y-2">
    <!-- 申请云录像播放链接。SK 只用于本页签名，不会写入播放 URL -->
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h2 class="card-title">生成云录像播放链接</h2>

        <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="handleSubmit">
          <fieldset class="fieldset">
            <label class="fieldset-label" for="access-key-id">Access Key (ACCESS_KEY_ID)</label>
            <input
              id="access-key-id"
              v-model="form.accessKeyId"
              type="text"
              class="input w-full"
              autocomplete="off"
              required
            />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="secret-key-id">Secret Key (SECRET_KEY_ID)</label>
            <input
              id="secret-key-id"
              v-model="form.secretKeyId"
              type="password"
              class="input w-full"
              autocomplete="off"
              required
            />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="device-id">设备 ID (DEVICE_ID)</label>
            <input id="device-id" v-model="form.deviceId" type="text" class="input w-full" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="app-id">App ID (TIRTC_APP_ID)</label>
            <input id="app-id" v-model="form.appId" type="text" class="input w-full" required />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="endpoint">服务地址 (ENDPOINT)</label>
            <input
              id="endpoint"
              v-model="form.endpoint"
              type="text"
              class="input w-full"
              placeholder="https://api-cloudstorage.tange365.com"
            />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label" for="duration-seconds">有效秒数 (DURATION_SECONDS)</label>
            <input
              id="duration-seconds"
              v-model="form.durationSeconds"
              type="number"
              min="900"
              max="43200"
              class="input w-full"
            />
          </fieldset>

          <div class="sm:col-span-2">
            <button type="submit" class="btn btn-primary" :disabled="pending">生成链接</button>
          </div>

          <p v-if="errorMessage" class="whitespace-pre-line text-error sm:col-span-2">{{ errorMessage }}</p>
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
  </AppContainer>
</template>
