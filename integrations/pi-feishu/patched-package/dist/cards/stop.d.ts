import type { JsonObject } from "../types.js";
/**
 * "正在处理"卡片：每次普通消息入队生成时，先发送这张卡片。
 * 黄色头部 + "停止生成"按钮（danger），点击后由 card-actions 的 cmd: "stop" 分支中止生成。
 */
export declare function buildStopCard(options: {
    sessionKey: string;
    chatType: "private" | "group";
    senderName?: string;
    sessionMode: string;
}): JsonObject;
/**
 * 生成结束卡片：生成完成后把"正在处理"卡片原地更新为这张。
 * title 一般为"Pi 已完成"或"Pi 失败"，message 是结果说明。
 */
export declare function buildStopDoneCard(title: string, message: string): JsonObject;
