import type { JsonObject } from "../types.js";
/** 模型卡片的单条模型信息（展示 + 切换用） */
export interface ModelCardEntry {
    provider: string;
    id: string;
    name?: string;
    /** 是否支持 thinking */
    thinking?: boolean;
}
/**
 * 模型选择卡片（/models 命令触发）：
 * 展示当前模型，并列出可用模型，每个模型配"使用"（普通）和"高思考"（high thinking）两个按钮。
 * 按钮点击后由 card-actions 的 cmd: "model" 分支处理。
 */
export declare function buildModelsCard(options: {
    sessionKey: string;
    current?: {
        provider: string;
        id: string;
        thinkingLevel?: string;
    };
    models: ModelCardEntry[];
    sessionMode: string;
}): JsonObject;
