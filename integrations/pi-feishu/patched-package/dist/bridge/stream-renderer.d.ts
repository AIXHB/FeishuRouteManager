import type { FeishuChannel, FeishuConfig } from "../types.js";
/**
 * ============================================================
 * 流式渲染器
 * ------------------------------------------------------------
 * 把 Pi 会话运行过程中产生的事件流（文本增量、思考、工具调用、
 * 压缩、自动重试等）实时转发成飞书流式 Markdown 消息。
 *
 * 支持三种渲染模式（config.rendering.mode）：
 * - stream-card：默认。通过 channel.streamMarkdown 流式输出
 * - text：不渲染任何事件，只跑 prompt（静默执行）
 * ============================================================
 */
/** 助手消息事件（来自 Pi session 的事件流） */
interface AssistantMessageEvent {
    type: string;
    delta?: string;
    error?: unknown;
}
/** 运行时事件（Pi session 订阅到的事件） */
interface RuntimeEvent {
    type: string;
    assistantMessageEvent?: AssistantMessageEvent;
    toolName?: string;
    partialResult?: unknown;
    isError?: boolean;
    attempt?: number;
    maxAttempts?: number;
    success?: boolean;
}
/** 可订阅会话接口：Pi 的 session 满足此结构 */
export interface SubscribableSession {
    subscribe(listener: (event: RuntimeEvent) => void): () => void;
}
export interface StreamRenderOptions {
    config: FeishuConfig;
    channel: FeishuChannel;
    chatId: string;
    replyTo?: string;
    session: SubscribableSession;
    runPrompt(): Promise<void>;
}
/**
 * 运行一次 prompt 并渲染输出：
 * - mode 为 text 时静默执行，不渲染
 * - 其他模式通过 channel.streamMarkdown 创建流式消息，期间把会话事件
 *   转发给 writer，消息发送完成后 Pi 侧会自动结束流
 */
export declare function renderPromptStream(options: StreamRenderOptions): Promise<void>;
export {};
