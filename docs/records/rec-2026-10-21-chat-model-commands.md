---
id: rec-2026-10-21-chat-model-commands
type: record
layer: 4
status: active
summary: "补齐飞书聊天模型指令及控制台模型同步，提供未部署的桥接补丁"
load_when: []
globs: []
related: [product-design, architecture-design]
depends_on: []
last_updated: 2026-10-21
token_est: 468
module: chat-commands
change_type: feat
date: 2026-10-21
files: [integrations/lark-channel-bridge/src/commands/index.ts, integrations/lark-channel-bridge/src/config/config-ops.ts, integrations/lark-channel-bridge/src/card/templates.ts, integrations/lark-channel-bridge/tests/integration/commands/commands-v1.test.ts, integrations/lark-channel-bridge/tests/integration/commands/claude-commands.test.ts, integrations/lark-channel-bridge/dist/cli.js, integrations/pi-feishu/patched-package/dist/bridge/message-handler.js, integrations/pi-feishu/patched-package/dist/bridge/message-normalizer.js, integrations/pi-feishu/patched-package/dist/cards/help.js, integrations/pi-feishu/patched-package/dist/types.d.ts, integrations/pi-feishu/chat-commands.test.mjs, RouterManager.App/RouterBackend.cs, RouterManager.App/MainWindow.xaml.cs]
doc_impact: [chat-commands, desktop-ui, discovery-core]
sync_status: synced
---

# 飞书聊天模型指令

用户澄清“云端切换”为飞书聊天 /model、/help 操作，不是改 App ID/Secret 或平台。Lark 新增 /model、/models 查看/保存模型，沿用管理员权限并检查全机器人空闲；锁内只合并模型字段，保留其他配置、未知字段和凭据，写入成功后更新内存。pi 增加 /model 别名和 provider/model 直接选择，拒绝忙碌或排队，所有命令在附件/推理前分发。未知英文命令返回帮助提示。/help 增加模型/后端说明并合并为单张卡片。

控制台托管 Lark 模型展示以实际 profile 为准，无 dirty 编辑时同步模型输入。设计及实现已沉淀到 [[product-design]]、[[architecture-design]]、[[chat-commands]]、[[desktop-ui]] 和 [[discovery-core]]。

验证：主工程 22 C# + 14 Node 全通过，pi 模拟通道 3 项通过；Lark 命令/模型回归 83 项通过，tsc、vite、tsup 完成。build.ps1 在 SDK 路径访问时被沙箱拒绝，未替换 app；检测到控制台在运行后，授权环境下改为 dotnet publish -c Release -o artifacts/chat-command-build，成功。独立构建 --demo --probe 探针通过（1320×860、3 张机器人卡片）。未停止控制台或机器人，未修改生产桥接、凭据/用户配置，未发送飞书测试消息。快照 dist 已重建，生产部署仍需单独授权；本轮不代表线上生效。
