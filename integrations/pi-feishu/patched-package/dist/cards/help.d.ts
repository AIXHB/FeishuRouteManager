import type { JsonObject } from "../types.js";
/**
 * 帮助卡片（/help 命令触发）：
 * 列出常用命令、文件能力，以及当前聊天类型/会话模式的说明。
 */
export declare function buildHelpCard(options: {
    botName: string;
    chatType: "private" | "group";
    sessionMode: string;
    requireMention: boolean;
}): JsonObject;
