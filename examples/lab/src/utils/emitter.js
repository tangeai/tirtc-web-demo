// 最小的事件发布订阅。会话类继承它，页面用 on() 订阅状态变化，卸载时调用返回的函数取消订阅。
class Emitter {
  #listeners = new Map();

  on(name, listener) {
    if (!this.#listeners.has(name)) this.#listeners.set(name, new Set());
    this.#listeners.get(name).add(listener);
    return () => this.off(name, listener);
  }

  off(name, listener) {
    this.#listeners.get(name)?.delete(listener);
  }

  emit(name, ...args) {
    this.#listeners.get(name)?.forEach((listener) => listener(...args));
  }

  removeAllListeners() {
    this.#listeners.clear();
  }
}

export default Emitter;
