import type { ConversationRouteResult, FeishuConfig, FeishuIdentity, FeishuMessage } from "../types.js";
/**
 * 会话路由：决定一条飞书消息是否被接受。
 *
 * 依次检查：
 * 1. 私聊是否开启
 * 2. 群聊是否开启
 * 3. 群聊是否要求 @机器人（未 @ 则拒绝）
 * 4. 用户是否在允许名单
 * 5. 聊天是否在允许名单
 *
 * 通过后返回会话 key 和身份信息（identity）。
 */
export declare function routeConversation(config: FeishuConfig, message: FeishuMessage): ConversationRouteResult;
/**
 * 计算会话 key（决定会话隔离粒度）：
 * - 私聊：dm:<userOpenId>（每个用户独立会话）
 * - 群聊 + shared-chat：group:<chatId>（整群共享一个会话）
 * - 群聊 + per-user：group-user:<chatId>:<userOpenId>（群里每人独立会话）
 */
export declare function buildSessionKey(config: FeishuConfig, identity: FeishuIdentity): string;
