<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import {
  saveLastFormInfo,
  getDefaultFormValues,
  getNewPageParamsString,
  fetchToken,
  fetchConnectionInfo,
} from './index.module.js';

const form = reactive({
  environment: 'production',
  appId: '',
  appPkgname: '',
  getTokenMode: 'input',
  token: '',
  username: '',
  password: '',
  deviceId: '',
  deviceConnectionString: '',
  otherUrlSearchString: '',
});

const showLogin = ref(false);

onMounted(() => {
  const defaultValues = getDefaultFormValues();
  Object.entries(defaultValues).forEach(([key, value]) => {
    form[key] = value || '';
  });
  showLogin.value = form.getTokenMode === 'loginByAccount';
});

watch(
  () => form.getTokenMode,
  (newVal) => {
    showLogin.value = newVal === 'loginByAccount';
  },
);

const handleGetToken = async () => {
  const token = await fetchToken(form);
  if (token) {
    form.token = token;
    saveLastFormInfo(form);
  }
};

const handleGetConnectionInfo = async () => {
  const { deviceConnectionString } = (await fetchConnectionInfo(form)) || {};
  if (deviceConnectionString) {
    form.deviceConnectionString = deviceConnectionString;
    saveLastFormInfo(form);
  }
};

const openPlayerPage = () => {
  const url = `/device-player?${getNewPageParamsString(form)}`;
  window.open(url, 'device-player-page');
};

const openPlayerIframe = () => {
  const url = `/device-player-iframe?${getNewPageParamsString(form)}`;
  window.open(url, 'device-player-iframe-page');
};
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-4">
    <!-- 公共参数卡片 -->
    <div class="p-1 card bg-base-100 card-sm shadow-sm">
      <div class="card-body">
        <h2 class="card-title">公共参数</h2>

        <div>
          <!-- 环境选择 -->
          <fieldset class="fieldset">
            <label class="fieldset-label">Environment</label>
            <select v-model="form.environment" class="select select-bordered w-full">
              <option value="production">正式环境</option>
              <option value="pre">预发布环境</option>
              <option value="test">测试环境</option>
            </select>
          </fieldset>

          <!-- App ID 和 Pkgname -->
          <div class="flex gap-4">
            <fieldset class="fieldset basis-1/2">
              <label class="fieldset-label">App ID</label>
              <input v-model="form.appId" type="text" class="input w-full" />
            </fieldset>

            <fieldset class="fieldset basis-1/2">
              <label class="fieldset-label">App Pkgname</label>
              <input v-model="form.appPkgname" type="text" class="input w-full" />
            </fieldset>
          </div>

          <!-- token -->
          <div class="flex gap-4 items-end">
            <fieldset class="fieldset basis-1/3">
              <label class="fieldset-label">Token</label>
              <select v-model="form.getTokenMode" class="select select-bordered w-full">
                <option value="input">手动输入</option>
                <option value="loginByAccount">登录获取</option>
              </select>
            </fieldset>

            <fieldset class="fieldset basis-2/3">
              <input v-model="form.token" type="text" class="input w-full" />
            </fieldset>
          </div>

          <!-- login -->
          <div v-if="showLogin" class="flex gap-4 items-end">
            <fieldset class="fieldset basis-1/3">
              <label class="fieldset-label">Username</label>
              <input v-model="form.username" type="text" class="input w-full" />
            </fieldset>

            <fieldset class="fieldset basis-1/3">
              <label class="fieldset-label">Password</label>
              <input v-model="form.password" type="password" class="input w-full" />
            </fieldset>

            <div class="basis-1/3 mb-1.5 flex justify-end">
              <button @click="handleGetToken" class="btn btn-primary">Get token</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 设备连接信息卡片 -->
    <div class="p-1 card bg-base-100 card-sm shadow-sm">
      <div class="card-body">
        <h2 class="card-title">设备连接信息</h2>

        <div>
          <!-- Device ID 和 获取按钮 -->
          <div class="flex gap-4 items-end">
            <fieldset class="fieldset basis-1/2">
              <label class="fieldset-label">Device ID</label>
              <input v-model="form.deviceId" type="text" class="input w-full" />
            </fieldset>

            <div class="basis-1/2 mb-1.5 flex justify-end">
              <button @click="handleGetConnectionInfo" class="btn btn-primary">Get connection info</button>
            </div>
          </div>

          <fieldset class="fieldset">
            <label class="fieldset-label">Device connection string</label>
            <input v-model="form.deviceConnectionString" type="text" disabled class="input w-full" />
          </fieldset>

          <fieldset class="fieldset">
            <label class="fieldset-label">Other url search string</label>
            <input
              v-model="form.otherUrlSearchString"
              type="text"
              placeholder="tg-enable-xxx&tg-enable-yyy"
              class="input w-full"
            />
          </fieldset>

          <!-- 操作按钮 -->
          <div class="mt-4 flex gap-4 items-end">
            <div class="basis-1/2 mb-1.5 flex justify-left">
              <button class="btn btn-primary" @click="openPlayerPage">播放页</button>
            </div>

            <div class="basis-1/2 mb-1.5 flex justify-left">
              <button class="btn" @click="openPlayerIframe">播放组件</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
