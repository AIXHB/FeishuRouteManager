import type { FeishuChannel } from "../types.js";
/**
 * ============================================================
 * 飞书通道实现
 * ------------------------------------------------------------
 * 封装 @larksuiteoapi/node-sdk 的 WebSocket 通道，向业务层暴露
 * 统一、友好的 FeishuChannel 接口：
 *
 * - SDK 事件 -> 归一化后的 FeishuMessage / FeishuCardAction
 * - 各种 send/stream/update/download 方法 -> Promise 化
 *
 * 注意：这里用 as unknown as RawLarkChannel 做窄接口化，
 * 只声明我们实际用到的 SDK 能力，方便替换实现。
 * ============================================================
 */
/** 创建飞书通道的选项 */
export interface CreateFeishuChannelOptions {
    appId: string;
    appSecret: string;
    logLevel?: string;
    /** 群聊是否要求 @机器人（由 SDK 侧 policy 处理） */
    requireMention: boolean;
}
/**
 * 创建飞书通道（FeishuChannel 的唯一实现）。
 * 通过 createLarkChannel 建立 WebSocket 长连接，并包一层统一接口。
 */
export declare function createFeishuChannel(options: CreateFeishuChannelOptions): FeishuChannel;
