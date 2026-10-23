import type { FeishuChannel, FeishuConfig, FeishuMessage, FeishuStore } from "../types.js";
import type { SessionHostManager } from "./session-host-manager.js";
/**
 * 处理一条飞书消息（serve 主流程中每个消息事件都会调用）。
 *
 * 流程：
 * 1. routeConversation 路由：被拒绝则回复原因（未@机器人时静默忽略）
 * 2. 获取/创建会话宿主
 * 3. 处理附件（图片转 base64、文本内联、其他文件落盘）
 * 4. 归一化消息
 * 5. 若是命令走 handleCommand；否则入队生成
 *
 * 生成期间：先发送"正在处理"卡片（可点击停止），
 * 结束后把卡片更新为"完成/失败"。
 */
export declare function handleFeishuMessage(options: {
    config: FeishuConfig;
    channel: FeishuChannel;
    store: FeishuStore;
    manager: SessionHostManager;
    message: FeishuMessage;
}): Promise<void>;
