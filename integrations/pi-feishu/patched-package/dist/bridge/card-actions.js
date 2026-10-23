import { copyFile } from "node:fs/promises";
import { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { buildModelsCard } from "../cards/models.js";
import { buildResolvedPermissionCard } from "./ui-context.js";
/**
 * ============================================================
 * 卡片事件处理
 * ------------------------------------------------------------
 * 飞书交互卡片上的按钮/下拉被点击后，会触发 cardAction 事件。
 * 本文件根据按钮 value 中的 cmd 字段分发处理：
 *
 * - permission：权限卡片选择 -> 兑现 ui.select 的 Promise
 * - stop：停止生成
 * - session：会话管理（新建/切换/删除）
 * - model：切换模型 / 思考等级
 * ============================================================
 */
/** 从 value 对象中安全读取字符串字段 */
function readString(value, key) {
    const entry = value[key];
    return typeof entry === "string" ? entry : undefined;
}
/**
 * 仅凭 sessionKey 推断身份信息（找不到存储映射时的兜底）：
 * 前缀 dm: -> 私聊；group:/group-user: -> 群聊。
 */
function identityFromSessionKey(config, event, sessionKey) {
    const group = sessionKey.startsWith("group:");
    const groupUser = sessionKey.startsWith("group-user:");
    return {
        appId: config.appId,
        chatType: group || groupUser ? "group" : "private",
        chatId: event.chatId,
        userOpenId: event.userOpenId ?? "unknown",
    };
}
/**
 * 优先从存储里的会话映射恢复完整身份（含 userId、tenantKey），
 * 存储里没有时退回 identityFromSessionKey。
 */
async function identityFromStore(config, store, event, sessionKey) {
    const mapping = await store.getSessionMapping(sessionKey);
    if (!mapping)
        return identityFromSessionKey(config, event, sessionKey);
    return {
        appId: config.appId,
        chatType: mapping.chatType,
        chatId: mapping.chatId,
        userOpenId: mapping.userId ?? event.userOpenId ?? "unknown",
        ...(mapping.tenantKey ? { tenantKey: mapping.tenantKey } : {}),
    };
}
/** 从宿主读取可用模型列表（与 message-handler 中的实现一致） */
function modelEntries(host) {
    const registry = new ModelRegistry(host.runtime.services.modelRuntime);
    return registry
        .getAvailable()
        .filter((model) => model !== undefined && model !== null)
        .map((model) => ({
        provider: model.provider,
        id: model.id,
        ...(model.name ? { name: model.name } : {}),
        ...(typeof model.reasoning === "boolean" ? { thinking: model.reasoning } : {}),
    }));
}
/** 根据 sessionKey 前缀生成会话模式的中文说明 */
function sessionModeLabel(sessionKey) {
    if (sessionKey.startsWith("dm:")) {
        return "私聊独立会话";
    }
    if (sessionKey.startsWith("group-user:")) {
        return "群聊按用户隔离";
    }
    return "群聊共享会话";
}
/**
 * 卡片事件处理总入口。
 * 根据 actionValue.cmd 分发到 permission / stop / session / model 分支。
 */
export async function handleCardAction(options) {
    const value = options.event.actionValue;
    const cmd = readString(value, "cmd");
    // ---- permission：权限卡片选择 ----
    if (cmd === "permission") {
        // 有 token 时顺便把卡片更新为"已确认"状态
        if (options.event.token) {
            await options.updateCardByToken(options.event.token, buildResolvedPermissionCard(value));
        }
        else {
            buildResolvedPermissionCard(value);
        }
        return;
    }
    const sessionKey = readString(value, "sessionKey");
    if (!sessionKey)
        return;
    // ---- stop：停止生成 ----
    if (cmd === "stop") {
        await options.manager.abort(sessionKey);
        return;
    }
    // 其余分支需要身份信息（优先用存储里的映射）
    const identity = await identityFromStore(options.config, options.store, options.event, sessionKey);
    // ---- session：会话管理 ----
    if (cmd === "session") {
        const action = readString(value, "action");
        if (action === "new") {
            // 新建会话（清空上下文）
            await options.manager.newSession(sessionKey, identity);
        }
        else if (action === "switch") {
            // 切换到另一个历史会话
            const targetSessionKey = readString(value, "targetSessionKey");
            if (targetSessionKey) {
                await options.manager.switchToMapping(sessionKey, targetSessionKey, identity);
            }
        }
        else if (action === "delete") {
            // 删除某个历史会话
            const targetSessionKey = readString(value, "targetSessionKey") ?? sessionKey;
            await options.manager.deleteMapping(targetSessionKey);
        }
        return;
    }
    // ---- model：切换模型 / 思考等级 ----
    if (cmd === "model") {
        const host = await options.manager.getHost(sessionKey, identity);
        const registry = new ModelRegistry(host.runtime.services.modelRuntime);
        const provider = readString(value, "provider");
        const modelId = readString(value, "modelId");
        const thinkingLevel = readString(value, "thinkingLevel") ?? "off";
        if (provider && modelId) {
            const model = registry.find(provider, modelId);
            if (model) {
                const session = host.runtime.session;
                // 去重：目标模型与当前一致时不做任何切换，避免无效的 model_change
                // 触发一次 17 万 token 的全量重发（见问题2诊断）。
                if (session.model?.provider !== provider || session.model?.id !== modelId) {
                    // 切换模型会让整段历史以未缓存输入重新计费（实测 cacheRead=0）。
                    // 缓解手段是切换前把历史压成 summary：AgentSession 上有 compact()。
                    // 注意 fork()/switchSession() 存在于 host.runtime（AgentSessionRuntime）
                    // 而非 session 上，且会 teardown 整个 runtime、使此处捕获的 host 失效，
                    // 不适合在卡片动作里内联调用，故不采用。
                    //
                    // 仅在上下文确实很大时才压缩：小会话 compact() 会抛
                    // "Nothing to compact (session too small)"，不应让它影响切换。
                    const usage = session.getContextUsage();
                    const contextTokens = usage?.tokens ?? null;
                    const contextWindow = usage?.contextWindow ?? 0;
                    const needsCompaction = contextTokens !== null && contextWindow > 0 &&
                        contextTokens > contextWindow * 0.6;
                    if (needsCompaction) {
                        try {
                            // 压缩会改写会话文件，先备份便于回滚。
                            if (session.sessionFile) {
                                await copyFile(session.sessionFile, session.sessionFile +
                                    ".bak-" + new Date().toISOString().replace(/[:.]/g, "-"));
                            }
                            await session.compact();
                        }
                        catch (error) {
                            // 压缩失败（小会话、无有效 usage、模型报错等）不应阻断切换，
                            // 只是拿不到省 token 的收益，继续走 setModel。
                            console.error("Pre-switch compaction skipped (" + provider + "/" + modelId +
                                "): " + (error instanceof Error ? error.message : String(error)));
                        }
                    }
                    // Fail closed：只有 setModel 真的失败才保留原模型。
                    try {
                        await session.setModel(model);
                    }
                    catch (error) {
                        console.error("Model switch failed (" + provider + "/" + modelId +
                            "): " + (error instanceof Error ? error.message : String(error)));
                    }
                }
                host.runtime.session.setThinkingLevel(thinkingLevel);
            }
        }
        // 有 token 时刷新模型卡片，让界面反映新选择
        if (options.event.token) {
            const current = host.runtime.session.model
                ? {
                    provider: host.runtime.session.model.provider,
                    id: host.runtime.session.model.id,
                    thinkingLevel: host.runtime.session.thinkingLevel,
                }
                : undefined;
            await options.updateCardByToken(options.event.token, buildModelsCard({
                sessionKey,
                ...(current ? { current } : {}),
                models: modelEntries(host),
                sessionMode: sessionModeLabel(sessionKey),
            }));
        }
    }
}
//# sourceMappingURL=card-actions.js.map