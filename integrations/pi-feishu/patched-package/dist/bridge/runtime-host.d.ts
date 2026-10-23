import { type AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import type { FeishuChannel, FeishuConfig, NormalizedPiInput } from "../types.js";
/**
 * 运行时宿主：把一个 Pi 的 AgentSessionRuntime 与飞书通道绑定，
 * 并提供 prompt（生成）、abort（中止）、dispose（释放）等操作。
 *
 * 每次 prompt：
 * 1. 注入飞书 UI 上下文（让 ui.select 变成飞书权限卡片）
 * 2. 在 AsyncLocalStorage 里挂载 FeishuRunContext（供 send_file_to_chat 等工具读取）
 * 3. 通过 renderPromptStream 以流式卡片方式渲染回复
 * 4. 结束后清理临时附件、恢复之前的 UI 上下文
 */
export declare class RuntimeHost {
    readonly sessionKey: string;
    readonly runtime: AgentSessionRuntime;
    private readonly config;
    private readonly channel;
    constructor(options: {
        sessionKey: string;
        runtime: AgentSessionRuntime;
        config: FeishuConfig;
        channel: FeishuChannel;
    });
    /** 当前模型是否支持图片输入（决定附件图片是转为 base64 还是落盘） */
    supportsImages(): boolean;
    /** 把一条归一化消息送入 Pi 会话生成，并以流式方式渲染到飞书 */
    prompt(input: NormalizedPiInput): Promise<void>;
    /** 中止当前生成（/stop 或卡片上的"停止生成"按钮） */
    abort(): Promise<void>;
    /** 释放运行时资源（会话被回收/删除时调用） */
    dispose(): Promise<void>;
}
/**
 * 创建一个新的运行时宿主：
 * - 有历史会话文件（sessionFile）则用 SessionManager.open 恢复
 * - 否则用 SessionManager.create 新建
 * - 注册 pi-remote-feishu-runtime 隐藏扩展，注入 send_file_to_chat 工具
 */
export declare function createRuntimeHost(options: {
    sessionKey: string;
    sessionFile?: string;
    cwd: string;
    config: FeishuConfig;
    channel: FeishuChannel;
}): Promise<RuntimeHost>;
