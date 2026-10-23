import type { JsonObject, SessionMapping } from "../types.js";
/**
 * 会话管理卡片（/sessions 命令触发）：
 * 展示"新建会话"按钮，以及最多 10 条持久化的历史会话；
 * 每个历史会话有"切换"和"删除"按钮，点击后由 card-actions 的 cmd: "session" 分支处理。
 */
export declare function buildSessionsCard(options: {
    currentSessionKey: string;
    mappings: SessionMapping[];
    sessionMode: string;
}): JsonObject;
