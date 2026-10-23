import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
export const DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** 会话空闲回收默认值：30 分钟 */
export const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000;
/* ---------- 安全读取辅助：类型不对/空串一律返回 undefined ---------- */
function readString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
function readBoolean(value) {
    return typeof value === "boolean" ? value : undefined;
}
function readNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function readStringArray(value) {
    if (!Array.isArray(value))
        return undefined;
    const strings = value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
    return strings.length === value.length ? strings : undefined;
}
function withString(target, key, value) {
    if (value !== undefined) {
        target[key] = value;
    }
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readGroupScope(value) {
    return value === "shared-chat" || value === "per-user" ? value : undefined;
}
function readStoreKind(value) {
    return value === "json" || value === "sqlite" ? value : undefined;
}
/**
 * 把任意 JSON 值安全解析成部分配置。
 * 非法字段会被忽略，不会抛错（配置来源可能是用户手写的文件）。
 */
export function parsePartialConfig(value) {
    if (!isObject(value))
        return {};
    // ---- policy ----
    const policyValue = value.policy;
    let policy;
    if (isObject(policyValue)) {
        policy = {};
        const requireMention = readBoolean(policyValue.requireMention);
        const dmEnabled = readBoolean(policyValue.dmEnabled);
        const groupEnabled = readBoolean(policyValue.groupEnabled);
        const allowUsers = readStringArray(policyValue.allowUsers);
        const allowChats = readStringArray(policyValue.allowChats);
        if (requireMention !== undefined)
            policy.requireMention = requireMention;
        if (dmEnabled !== undefined)
            policy.dmEnabled = dmEnabled;
        if (groupEnabled !== undefined)
            policy.groupEnabled = groupEnabled;
        if (allowUsers)
            policy.allowUsers = allowUsers;
        if (allowChats)
            policy.allowChats = allowChats;
    }
    // ---- sessions ----
    const sessionsValue = value.sessions;
    let sessions;
    if (isObject(sessionsValue)) {
        sessions = {};
        const groupScope = readGroupScope(sessionsValue.groupScope);
        const defaultCwd = readString(sessionsValue.defaultCwd);
        const store = readStoreKind(sessionsValue.store);
        const idleTtlMs = readNumber(sessionsValue.idleTtlMs);
        if (sessionsValue.privateScope === "per-user")
            sessions.privateScope = "per-user";
        if (groupScope)
            sessions.groupScope = groupScope;
        if (defaultCwd)
            sessions.defaultCwd = defaultCwd;
        if (store)
            sessions.store = store;
        if (idleTtlMs !== undefined)
            sessions.idleTtlMs = idleTtlMs;
    }
    // ---- rendering ----
    const renderingValue = value.rendering;
    let rendering;
    if (isObject(renderingValue)) {
        rendering = {};
        const showToolEvents = readBoolean(renderingValue.showToolEvents);
        if (renderingValue.mode === "stream-card" || renderingValue.mode === "markdown" || renderingValue.mode === "text") {
            rendering.mode = renderingValue.mode;
        }
        if (renderingValue.showThinking === "hide" ||
            renderingValue.showThinking === "quote" ||
            renderingValue.showThinking === "plain") {
            rendering.showThinking = renderingValue.showThinking;
        }
        if (showToolEvents !== undefined)
            rendering.showToolEvents = showToolEvents;
    }
    // ---- files ----
    const filesValue = value.files;
    let files;
    if (isObject(filesValue)) {
        files = {};
        const allowedOutputDirs = readStringArray(filesValue.allowedOutputDirs);
        const maxUploadBytes = readNumber(filesValue.maxUploadBytes);
        const tempDir = readString(filesValue.tempDir);
        if (allowedOutputDirs)
            files.allowedOutputDirs = allowedOutputDirs;
        if (maxUploadBytes !== undefined)
            files.maxUploadBytes = maxUploadBytes;
        if (tempDir)
            files.tempDir = tempDir;
    }
    // ---- webhook ----
    const webhookValue = value.webhook;
    let webhook;
    if (isObject(webhookValue)) {
        webhook = {};
        const host = readString(webhookValue.host);
        const port = readNumber(webhookValue.port);
        const path = readString(webhookValue.path);
        if (host)
            webhook.host = host;
        if (port !== undefined)
            webhook.port = port;
        if (path)
            webhook.path = path;
    }
    // ---- debug ----
    const debugValue = value.debug;
    let debug;
    if (isObject(debugValue)) {
        debug = {};
        const logIncomingEvents = readBoolean(debugValue.logIncomingEvents);
        if (logIncomingEvents !== undefined)
            debug.logIncomingEvents = logIncomingEvents;
    }
    // ---- 顶层字段 ----
    const result = {};
    withString(result, "appId", readString(value.appId));
    withString(result, "appSecret", readString(value.appSecret));
    withString(result, "encryptKey", readString(value.encryptKey));
    withString(result, "verificationToken", readString(value.verificationToken));
    withString(result, "botName", readString(value.botName));
    if (value.transport === "webhook" || value.transport === "websocket") {
        result.transport = value.transport;
    }
    if (webhook)
        result.webhook = webhook;
    if (policy)
        result.policy = policy;
    if (sessions)
        result.sessions = sessions;
    if (rendering)
        result.rendering = rendering;
    if (files)
        result.files = files;
    if (debug)
        result.debug = debug;
    return result;
}
/**
 * 合并多份部分配置：后面的覆盖前面的（子对象逐层浅合并）。
 * 用于按优先级合并 环境变量 < 配置文件 < CLI 参数。
 */
export function mergeConfig(...configs) {
    const merged = {};
    for (const config of configs) {
        Object.assign(merged, {
            ...config,
            policy: { ...merged.policy, ...config.policy },
            sessions: { ...merged.sessions, ...config.sessions },
            rendering: { ...merged.rendering, ...config.rendering },
            files: { ...merged.files, ...config.files },
            webhook: { ...merged.webhook, ...config.webhook },
            debug: { ...merged.debug, ...config.debug },
        });
    }
    return merged;
}
/**
 * 补默认值并生成完整配置。
 * - appId / appSecret 为必填，缺失直接抛错
 * - 各子配置使用默认值（如 requireMention 默认 true、groupScope 默认 shared-chat）
 * - 目录类字段统一 resolve 成绝对路径
 */
export function normalizeConfig(partial, cwd) {
    if (!partial.appId) {
        throw new Error("Missing Feishu appId");
    }
    if (!partial.appSecret) {
        throw new Error("Missing Feishu appSecret");
    }
    const policy = {
        requireMention: partial.policy?.requireMention ?? true,
        dmEnabled: partial.policy?.dmEnabled ?? true,
        groupEnabled: partial.policy?.groupEnabled ?? true,
        ...(partial.policy?.allowUsers ? { allowUsers: partial.policy.allowUsers } : {}),
        ...(partial.policy?.allowChats ? { allowChats: partial.policy.allowChats } : {}),
    };
    const sessions = {
        privateScope: "per-user",
        groupScope: partial.sessions?.groupScope ?? "shared-chat",
        defaultCwd: resolve(partial.sessions?.defaultCwd ?? cwd),
        store: partial.sessions?.store ?? "json",
        idleTtlMs: partial.sessions?.idleTtlMs ?? DEFAULT_IDLE_TTL_MS,
    };
    const rendering = {
        mode: partial.rendering?.mode ?? "stream-card",
        showThinking: partial.rendering?.showThinking ?? "quote",
        showToolEvents: partial.rendering?.showToolEvents ?? true,
    };
    const files = {
        allowedOutputDirs: partial.files?.allowedOutputDirs?.map((dir) => resolve(dir)) ?? [resolve(sessions.defaultCwd ?? cwd)],
        maxUploadBytes: partial.files?.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
        tempDir: resolve(partial.files?.tempDir ?? join(tmpdir(), "pi-remote-feishu")),
    };
    const debug = {
        logIncomingEvents: partial.debug?.logIncomingEvents ?? false,
    };
    return {
        appId: partial.appId,
        appSecret: partial.appSecret,
        ...(partial.encryptKey ? { encryptKey: partial.encryptKey } : {}),
        ...(partial.verificationToken ? { verificationToken: partial.verificationToken } : {}),
        ...(partial.botName ? { botName: partial.botName } : {}),
        transport: partial.transport ?? "websocket",
        webhook: {
            host: partial.webhook?.host ?? "127.0.0.1",
            port: partial.webhook?.port ?? 8787,
            path: partial.webhook?.path ?? "/feishu/events",
        },
        policy,
        sessions,
        rendering,
        files,
        debug,
    };
}
/** 用户级默认配置文件路径：~/.pi/agent/feishu.json */
export function defaultUserConfigPath() {
    return join(homedir(), ".pi", "agent", "feishu.json");
}
//# sourceMappingURL=schema.js.map