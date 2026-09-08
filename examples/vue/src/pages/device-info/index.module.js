import lo from 'lodash';

function getJsonFromLocalStorage(name) {
  let value = null;
  if (!name) return value;

  try {
    const temp = window.localStorage.getItem(name) || null;
    value = JSON.parse(temp);
  } catch (e) {
    value = null;
  }

  return value;
}

// 转小驼峰命名
function toCamel(obj) {
  const newObj = {};
  lo.forEach(obj, (value, key) => {
    const newKey = lo.camelCase(key);
    newObj[newKey] = value;
  });

  return newObj;
}

// 转中划线命名
function toKebab(obj) {
  const newObj = {};
  lo.forEach(obj, (value, key) => {
    const newKey = lo.kebabCase(key);
    newObj[newKey] = value;
  });

  return newObj;
}

// 转下划线命名
function toSnakeCase(obj) {
  const newObj = {};
  lo.forEach(obj, (value, key) => {
    const newKey = lo.snakeCase(key);
    newObj[newKey] = value;
  });

  return newObj;
}

// 从本地存储获取上一次填写的表单
const lastFormStorageKey = 'last-login-info';
function getLastFormInfo() {
  let lastFormInfo = getJsonFromLocalStorage(lastFormStorageKey) || null;
  if (lastFormInfo) {
    lastFormInfo = toCamel(lastFormInfo);

    const { uuid, deviceId } = lastFormInfo;
    if (!deviceId && uuid) lastFormInfo.deviceId = lastFormInfo.uuid;
  }

  console.log('last form info: ', lastFormInfo);
  return lastFormInfo;
}

// 保存登录表单
function saveLastFormInfo(formData) {
  const lastFormInfo = toKebab(formData);

  if (lastFormInfo.token && lastFormInfo.username) {
    localStorage.setItem(lastFormStorageKey, JSON.stringify(lastFormInfo));
  }
}

// 获取默认表单值
function getDefaultFormValues() {
  const saved = getLastFormInfo();
  const urlParams = Object.fromEntries(new URLSearchParams(window.location.search));
  let formValues = {
    environment: 'production',
    getTokenMode: 'input',
    ...saved,
    ...toCamel(urlParams),
  };

  formValues = lo.pick(formValues, [
    'environment',
    'appId',
    'appPkgname',
    'getTokenMode',
    'token',
    'username',
    'password',
    'deviceId',
    'deviceConnectionString',
    'otherUrlSearchString',
  ]);

  // token的获取模式 默认值
  if (formValues.username) formValues.getTokenMode = 'loginByAccount';

  return formValues;
}

function getNewPageParamsString(formData) {
  const { environment, otherUrlSearchString } = formData;
  let params = {};
  if (environment !== 'production') params['tgsdk-env'] = environment;

  const newFormData = lo.pick(formData, ['deviceId', 'appId', 'token', 'deviceConnectionString']);
  params = { ...params, ...newFormData };
  params = toSnakeCase(params);

  let paramsString = new URLSearchParams(params).toString();
  if (otherUrlSearchString) {
    paramsString = `${otherUrlSearchString}&${paramsString}`;
  }

  return paramsString;
}

async function fetchToken(formData) {}

async function fetchConnectionInfo(formData) {}

export {
  getLastFormInfo,
  saveLastFormInfo,
  getDefaultFormValues,
  getNewPageParamsString,
  fetchToken,
  fetchConnectionInfo,
};
