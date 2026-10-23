import type { JsonObject } from "../types.js";
/**
 * 权限确认卡片：Pi 的 ui.select 在飞书上的呈现。
 * 每个选项生成一个按钮，按钮 value 携带 dialogId 和该选项，
 * 用户点击后由 card-actions 的 cmd: "permission" 分支兑现等待中的 Promise。
 */
export declare function buildPermissionCard(title: string, options: string[], dialogId: string): JsonObject;
/** 权限确认完成后的结果卡片（展示用户选择了什么） */
export declare function buildPermissionResultCard(choice: string | undefined): JsonObject;
