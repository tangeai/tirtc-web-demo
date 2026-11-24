import { TiCloudStorage, TiCloudStorageErrorCode as ErrorCode } from '@/libs/tirtc';

// 云存客户端。查询、播放、导出共用这一个 TiCloudStorage。
// 不发事件，也不管界面状态。页面把它交给查询，再把 storage 传给播放和导出。
//
// 用法：
//   const client = new CloudClient();
//   const code = await client.open({ appId, token, endpoint });
//   client.storage;  // 建连成功后的 TiCloudStorage，还没连上时为 null
//   client.dispose();

export class CloudClient {
  storage = null;

  // 上一次成功建连的凭证。三者都没变就复用客户端，留下 dispatch 域名和 OSS 凭证缓存
  #credentials = null;
  // 每次建连加一。建连是异步的，回来时编号变了说明又发起了新的建连，结果作废
  #seq = 0;

  // 凭证没变就返回 OK。变了就丢掉旧客户端，重新 init。
  async open({ appId, token, endpoint }) {
    if (this.#sameCredentials({ appId, token, endpoint })) return ErrorCode.OK;

    const seq = ++this.#seq;
    this.#drop();
    const code = await TiCloudStorage.init({ appId, endpoint });
    if (seq !== this.#seq) return ErrorCode.CANCELLED;
    if (code !== ErrorCode.OK) return code;

    this.storage = new TiCloudStorage(token);
    this.#credentials = { appId, token, endpoint };
    return ErrorCode.OK;
  }

  // 页面卸载时调用。之后不能再用
  dispose() {
    this.#seq += 1;
    this.#drop();
  }

  #sameCredentials({ appId, token, endpoint }) {
    const prev = this.#credentials;
    if (!this.storage || !prev) return false;
    return prev.appId === appId && prev.token === token && prev.endpoint === endpoint;
  }

  #drop() {
    this.storage?.dispose();
    this.storage = null;
    this.#credentials = null;
  }
}
