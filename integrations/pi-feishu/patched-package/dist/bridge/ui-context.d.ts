import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
/**
 * 兑现一张待确认的权限卡片：
 * 根据卡片按钮携带的 dialogId 找到等待中的 Promise，把用户选择传回去。
 * 返回用户的选择（undefined 表示找不到对应弹窗）。
 */
export declare function resolvePermissionCardAction(value: Record<string, unknown>): string | undefined;
/**
 * 创建"飞书版"的 ExtensionUIContext：
 * 把 Pi 的 ui.select / ui.confirm / notify 等 UI 能力桥接到飞书聊天。
 *
 * - select：发送一张"权限确认"卡片到当前聊天，等待用户在卡片上选择（可中止/超时）
 * - confirm：复用 select，选项固定为 Yes/No
 * - notify：往聊天发送一条普通文本消息
 * - 其余编辑器/TUI 相关方法在飞书模式下为空实现或抛错
 */
export declare function createFeishuUIContext(): ExtensionUIContext;
/** 根据卡片事件携带的 value，构建"权限已确认"的结果卡片 */
export declare function buildResolvedPermissionCard(value: Record<string, unknown>): import("../types.js").JsonObject;
