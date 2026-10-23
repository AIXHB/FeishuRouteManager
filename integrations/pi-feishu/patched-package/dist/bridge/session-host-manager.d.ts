import type { FeishuChannel, FeishuConfig, FeishuIdentity, FeishuStore, SessionHost, SessionMapping } from "../types.js";
import { PromptQueue } from "./prompt-queue.js";
import { type RuntimeHost } from "./runtime-host.js";
/** 被管理器管理的会话宿主：在 SessionHost 基础上增加 runtimeHost 和强类型 queue */
interface ManagedSessionHost extends SessionHost {
    runtimeHost: RuntimeHost;
    queue: PromptQueue;
}
/**
 * 会话宿主管理器：
 * 以 sessionKey 为维度，在内存中维护一组 Pi 运行时实例，
 * 并通过 FeishuStore 把"会话 key <-> 会话文件/工作目录"持久化到磁盘。
 *
 * 职责：
 * - getHost：按需创建/复用运行时（懒加载）
 * - newSession / switchToMapping / deleteMapping：会话生命周期管理
 * - abort：中止当前生成
 * - evictIdle：按 idleTtlMs 回收长时间不用的会话，释放内存
 */
export declare class SessionHostManager {
    private readonly hosts;
    private readonly config;
    private readonly store;
    private readonly channel;
    private idleEvictionTimer;
    constructor(options: {
        config: FeishuConfig;
        store: FeishuStore;
        channel: FeishuChannel;
    });
    /**
     * 获取（或创建）某个会话 key 的宿主。
     * - 内存中已有：刷新 lastUsedAt 直接返回
     * - 没有：查存储恢复历史会话（cwd、sessionFile），否则新建，并持久化映射
     */
    getHost(sessionKey: string, identity: FeishuIdentity): Promise<ManagedSessionHost>;
    /** 只读查询内存中是否有该会话的宿主（不创建） */
    getActiveHost(sessionKey: string): ManagedSessionHost | undefined;
    /** 新建一个空会话（/new 命令），清空上下文并重新绑定扩展 */
    newSession(sessionKey: string, identity: FeishuIdentity): Promise<void>;
    /** 切换到另一个持久化的会话（/sessions 卡片上的"切换"按钮） */
    switchToMapping(sessionKey: string, targetSessionKey: string, identity: FeishuIdentity): Promise<boolean>;
    /** 中止当前生成（/stop 或卡片"停止生成"按钮）。没有活动会话时返回 false */
    abort(sessionKey: string): Promise<boolean>;
    /** 启动空闲会话回收定时器。定时器只触发检查，是否回收由 idleTtlMs 决定。 */
    startIdleEviction(options?: {
        intervalMs?: number;
        onError?: (error: Error) => void;
    }): void;
    /** 停止空闲会话回收定时器。 */
    stopIdleEviction(): void;
    /** 删除会话：先释放内存中的运行时，再删除持久化映射 */
    deleteMapping(sessionKey: string): Promise<void>;
    /** 列出全部持久化的会话映射 */
    listMappings(): Promise<SessionMapping[]>;
    /**
     * 回收空闲会话：超过 idleTtlMs 未使用且当前没有生成任务的会话，
     * 释放运行时并移出内存（下次使用会从磁盘恢复）。
     */
    evictIdle(now?: Date): Promise<void>;
    /**
     * 把宿主的会话信息持久化到 FeishuStore：
     * 记录会话文件路径、工作目录、创建/更新时间，以及（私聊或 per-user 模式下）用户 id。
     */
    private persistHost;
}
export {};
