import type { FeishuCardAction, FeishuConfig, FeishuStore, JsonObject } from "../types.js";
import type { SessionHostManager } from "./session-host-manager.js";
/**
 * 卡片事件处理总入口。
 * 根据 actionValue.cmd 分发到 permission / stop / session / model 分支。
 */
export declare function handleCardAction(options: {
    config: FeishuConfig;
    store: FeishuStore;
    manager: SessionHostManager;
    event: FeishuCardAction;
    updateCardByToken(token: string, card: JsonObject): Promise<void>;
}): Promise<void>;
