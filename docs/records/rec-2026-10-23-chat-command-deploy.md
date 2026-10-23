---
id: rec-2026-10-23-chat-command-deploy
type: record
layer: 4
status: active
summary: "按用户授权部署新增聊天指令，三台机器人重启及实际任务侧代码核验通过"
load_when: ["指令部署", "重新部署"]
globs: []
related: [rec-2026-10-23-chat-command-expansion, deployment-reference]
depends_on: []
last_updated: 2026-10-23
token_est: 384
module: chat-commands
change_type: config
date: 2026-10-23
files: [integrations/lark-channel-bridge/dist/cli.js, integrations/pi-feishu/patched-package/dist/bridge/message-handler.js, integrations/pi-feishu/patched-package/dist/bridge/message-normalizer.js, integrations/pi-feishu/patched-package/dist/cards/help.js, integrations/pi-feishu/patched-package/dist/types.d.ts, integrations/README.md]
doc_impact: [chat-commands]
sync_status: synced
---

# 聊天指令实际部署

用户要求“飞书机器人远程有修改，重新部署一下”。确认工程最新待部署内容为 [[rec-2026-10-23-chat-command-expansion]]，没有覆盖补丁的上游拉取。Lark 89 项、pi 5 项指令测试及 test.ps1 的 31 项 C#、38 项 Node 检查通过；Lark tsc、Vite、tsup 重新通过。本次不涉及 WPF 代码，不替换 app 或后台 helper。

由 WMI 启动隐藏 Node，在计划任务实际文件视图发现三台机器人，确认空闲，持有各自 route-operation 锁，备份活动 Lark cli.js 和 pi 四项修改文件后停止原任务、复制并验证哈希。等待旧锁过期后启用并启动原任务。失败路径只回退代码并恢复任务，不恢复整份旧配置。代码备份在 artifacts/chat-bridge-backup-1792713767613，不含凭据或运行数据。

2026-10-23 08:04（北京时间）实际任务侧确认：路飞 Codex PID 20936 / supervisor 6920，娟娟 pi PID 25796 / supervisor 17296，当当 Codex PID 1888 / supervisor 15996；三台心跳 running 且新鲜、进程存活、计划任务 Running。五项共享代码哈希与工程相同，娟娟 pi 私有运行包四项哈希同步。route.json 全部保持原哈希；当当四项专属技能仍在。部署、核验和只读 WPF 探针证据见 artifacts/chat-deploy-*-result.json、artifacts/chat-deploy-ui-probe.json。

未发送飞书测试消息、未执行真实模型任务或额度查询。会话、技能和模型未作配置变更。
