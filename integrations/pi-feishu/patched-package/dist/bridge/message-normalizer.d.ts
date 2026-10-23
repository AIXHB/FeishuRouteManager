import type { ConversationRoute, FeishuMessage, ImageInput, NormalizedPiInput } from "../types.js";
/**
 * 归一化消息：
 * 把飞书消息 + 路由结果 + 附件信息，转换成传给 Pi 的 NormalizedPiInput。
 *
 * 重点：
 * - 群聊文本会剥掉 @机器人 前缀
 * - 群聊会拼入发送者身份和会话模式的上下文说明，让模型知道在群里回复谁
 * - 附件处理结果（文本内容/保存路径/失败原因）会追加到提示词里
 * - 如果消息是 /命令，解析出 command 字段
 */
export declare function normalizeMessage(options: {
    message: FeishuMessage;
    route: ConversationRoute;
    images?: ImageInput[];
    attachmentNotes?: string[];
}): NormalizedPiInput;
