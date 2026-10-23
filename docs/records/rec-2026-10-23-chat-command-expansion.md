---
id: rec-2026-10-23-chat-command-expansion
type: record
layer: 4
status: active
summary: "补齐聊天任务、会话与目录指令入口及帮助示例，工程快照未部署"
load_when: []
globs: []
related: [product-design]
depends_on: []
last_updated: 2026-10-23
token_est: 363
module: chat-commands
change_type: feat
date: 2026-10-23
files: [integrations/lark-channel-bridge/src/commands/index.ts, integrations/lark-channel-bridge/src/card/templates.ts, integrations/lark-channel-bridge/tests/integration/commands/commands-v1.test.ts, integrations/lark-channel-bridge/dist/cli.js, integrations/pi-feishu/patched-package/dist/bridge/message-handler.js, integrations/pi-feishu/patched-package/dist/bridge/message-normalizer.js, integrations/pi-feishu/patched-package/dist/cards/help.js, integrations/pi-feishu/patched-package/dist/types.d.ts, integrations/pi-feishu/chat-commands.test.mjs, integrations/README.md]
doc_impact: [chat-commands]
sync_status: synced
---

# 聊天指令扩充

按聊天斜杠指令理解用户“丰富飞书路由管理的指令”。增加 /cancel（原 stop 别名）、/pwd（只读当前目录），并为 Lark 增加 /sessions（原 resume 别名）。复用原权限、会话隔离和停止逻辑；pi 目录查询不创建 Agent，仅查询当前映射并回退默认目录。帮助补齐分类、示例及生效范围，管理服务、pi 后端路由、专属 skill 等仍引导桌面控制台。

验证：Lark 命令/模型 89 项、pi 命令 5 项通过；Lark tsc、Vite、tsup 通过且 dist 已重建。test.ps1 的 31 项 C#、38 项 Node 检查通过。build.ps1 -OutputDirectory artifacts/chat-command-expansion-build 因 SDK 读取 C:/Users/15700/AppData/Local/Microsoft SDKs 被沙箱拒绝而失败，未改 SDK 或覆盖 app；本轮没有 WPF 代码变化。未部署活动服务、未重启机器人、未发送飞书测试消息。

设计与模块知识已合并至 [[product-design]]、[[chat-commands]]。
