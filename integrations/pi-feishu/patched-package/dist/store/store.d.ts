import type { FeishuConfig, FeishuStore } from "../types.js";
/**
 * 存储工厂：根据配置创建对应的 FeishuStore 实现。
 * 目前只支持 json（sqlite 预留但未实现）。
 * 会话映射文件放在 files.tempDir 下的 sessions.json。
 */
export declare function createStore(config: FeishuConfig): FeishuStore;
