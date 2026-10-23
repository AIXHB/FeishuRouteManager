import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
/**
 * 扩展主函数。
 * 注意：本文件是"TUI 侧"的扩展集成；serve 模式的运行时工具注入在
 * runtime-host.ts 的扩展工厂里（两者独立）。
 */
export default function feishuExtension(pi: ExtensionAPI): void;
