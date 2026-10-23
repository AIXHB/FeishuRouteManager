import type { JsonObject } from "../types.js";
/**
 * 运行状态卡片（/status 命令触发）：
 * 展示连接状态、聊天类型、会话模式、队列深度、是否运行中、当前模型等信息。
 * 头部颜色随连接状态变化（已连接=绿，未连接=红）。
 */
export declare function buildStatusCard(options: {
    sessionKey: string;
    connected: boolean;
    queueDepth: number;
    active: boolean;
    model?: string;
    chatType: "private" | "group";
    sessionMode: string;
}): JsonObject;
