import { inferMimeType, isLikelyText } from "./mime.js";
import { writeTempAttachment } from "./temp-files.js";
/** 文本文件大小上限：超过则视为不可内联 */
const TEXT_SIZE_LIMIT = 32 * 1024;
/** 附件落盘文件名：优先用原始文件名，没有则用 fileKey.bin */
function resourceFileName(fileKey, fileName) {
    return fileName ?? `${fileKey}.bin`;
}
/**
 * 处理一条消息的所有附件。
 * 每个资源单独 try/catch：单个失败不影响其他资源。
 */
export async function processAttachments(options) {
    const images = [];
    const notes = [];
    for (const resource of options.message.resources) {
        if (resource.type === "sticker")
            continue;
        const fileName = resourceFileName(resource.fileKey, resource.fileName);
        try {
            const buffer = await options.channel.downloadResource(options.message.messageId, resource.fileKey, resource.type);
            // 图片且模型支持：转 base64 作为图像输入
            if (resource.type === "image" && options.supportsImages) {
                images.push({
                    type: "image",
                    data: buffer.toString("base64"),
                    mimeType: inferMimeType(fileName),
                });
                continue;
            }
            // 小型文本（非音视频）：内容直接内联进提示词
            if (resource.type !== "audio" && resource.type !== "video" && buffer.length <= TEXT_SIZE_LIMIT && isLikelyText(buffer)) {
                notes.push(`[Attachment text: ${fileName}]\n${buffer.toString("utf-8")}`);
                continue;
            }
            // 其他文件：下载到临时目录，提示词记录路径（模型可用它读取）
            const filePath = await writeTempAttachment(options.config.files.tempDir ?? ".", options.sessionKey, fileName, buffer);
            notes.push(`[Attachment saved: ${fileName} -> ${filePath}]`);
        }
        catch (error) {
            // 下载/处理失败：提示词里记录原因
            const message = error instanceof Error ? error.message : String(error);
            notes.push(`[Attachment failed: ${fileName}: ${message}]`);
        }
    }
    return { images, notes };
}
//# sourceMappingURL=processor.js.map