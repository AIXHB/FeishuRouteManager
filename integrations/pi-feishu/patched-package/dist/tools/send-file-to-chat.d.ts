import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { FeishuConfig } from "../types.js";
/**
 * ============================================================
 * send_file_to_chat 工具
 * ------------------------------------------------------------
 * 供 Pi 在生成过程中调用：把本地生成的文件回传到当前飞书聊天。
 *
 * 安全校验：
 * - 必须在飞书请求上下文内（getFeishuContext）才可用
 * - 文件路径必须在 allowedOutputDirs 白名单内
 * - 必须是文件且大小不超过 maxUploadBytes
 * ============================================================
 */
/** 工具参数 schema（typebox 描述，Pi 会据此生成函数签名给模型看） */
declare const sendFileSchema: Type.TObject<{
    filePath: Type.TString;
    fileName: Type.TOptional<Type.TString>;
}>;
/**
 * 创建 send_file_to_chat 工具。
 * 在 Pi 的运行时中注册后，模型生成完文件即可调用它把文件发回飞书。
 */
export declare function createSendFileToChatTool(config: FeishuConfig): ToolDefinition<typeof sendFileSchema, undefined>;
export {};
