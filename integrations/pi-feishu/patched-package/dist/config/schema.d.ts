import type { FeishuConfig, FeishuDebugConfig, FeishuFilesConfig, FeishuPolicyConfig, FeishuRenderingConfig, FeishuSessionsConfig, FeishuWebhookConfig } from "../types.js";
/**
 * ============================================================
 * 配置系统
 * ------------------------------------------------------------
 * 负责把 环境变量 / 配置文件 / CLI 参数 三层配置合并、校验、
 * 补默认值，最终生成完整的 FeishuConfig。
 *
 * 三个函数：
 * - parsePartialConfig：把任意 JSON 安全解析成部分配置（忽略非法字段）
 * - mergeConfig：浅合并多个部分配置（子对象也逐层合并）
 * - normalizeConfig：补默认值并生成完整配置，缺 appId/appSecret 会抛错
 * ============================================================
 */
/** 文件回传大小上限的默认值：20MB */
export declare const DEFAULT_MAX_UPLOAD_BYTES: number;
/** 会话空闲回收默认值：30 分钟 */
export declare const DEFAULT_IDLE_TTL_MS: number;
/** 部分配置：所有字段可选，代表"用户只写了其中一部分" */
export interface PartialFeishuConfig {
    appId?: string;
    appSecret?: string;
    encryptKey?: string;
    verificationToken?: string;
    botName?: string;
    transport?: "websocket" | "webhook";
    webhook?: Partial<FeishuWebhookConfig>;
    policy?: Partial<FeishuPolicyConfig>;
    sessions?: Partial<FeishuSessionsConfig>;
    rendering?: Partial<FeishuRenderingConfig>;
    files?: Partial<FeishuFilesConfig>;
    debug?: Partial<FeishuDebugConfig>;
}
/**
 * 把任意 JSON 值安全解析成部分配置。
 * 非法字段会被忽略，不会抛错（配置来源可能是用户手写的文件）。
 */
export declare function parsePartialConfig(value: unknown): PartialFeishuConfig;
/**
 * 合并多份部分配置：后面的覆盖前面的（子对象逐层浅合并）。
 * 用于按优先级合并 环境变量 < 配置文件 < CLI 参数。
 */
export declare function mergeConfig(...configs: PartialFeishuConfig[]): PartialFeishuConfig;
/**
 * 补默认值并生成完整配置。
 * - appId / appSecret 为必填，缺失直接抛错
 * - 各子配置使用默认值（如 requireMention 默认 true、groupScope 默认 shared-chat）
 * - 目录类字段统一 resolve 成绝对路径
 */
export declare function normalizeConfig(partial: PartialFeishuConfig, cwd: string): FeishuConfig;
/** 用户级默认配置文件路径：~/.pi/agent/feishu.json */
export declare function defaultUserConfigPath(): string;
