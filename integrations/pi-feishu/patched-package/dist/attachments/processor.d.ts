import type { FeishuChannel, FeishuConfig, FeishuMessage, ImageInput } from "../types.js";
/**
 * ============================================================
 * 附件处理
 * ------------------------------------------------------------
 * 对消息携带的附件资源分类处理：
 * 1. 表情包(sticker)：直接跳过
 * 2. 图片 + 模型支持图片输入：转 base64 图片传给 Pi
 * 3. 小型文本文件（非音视频、≤32KB、内容像文本）：内容内联到提示词
 * 4. 其余文件：下载保存到临时目录，提示词里记录保存路径
 * 5. 下载失败：提示词里记录失败原因
 * ============================================================
 */
/** 附件处理结果：图片列表 + 文字说明列表 */
export interface ProcessedAttachments {
    images: ImageInput[];
    notes: string[];
}
/**
 * 处理一条消息的所有附件。
 * 每个资源单独 try/catch：单个失败不影响其他资源。
 */
export declare function processAttachments(options: {
    channel: Pick<FeishuChannel, "downloadResource">;
    config: FeishuConfig;
    message: FeishuMessage;
    sessionKey: string;
    supportsImages: boolean;
}): Promise<ProcessedAttachments>;
