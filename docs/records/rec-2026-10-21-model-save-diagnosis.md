---
id: rec-2026-10-21-model-save-diagnosis
type: record
layer: 4
status: active
summary: "诊断控制台状态和模型保存失败，保留失败编辑并统一模型校验"
load_when: ["已暂停", "保存失败"]
globs: []
related: [product-design, deployment-reference]
depends_on: []
last_updated: 2026-10-21
token_est: 524
module: chat-commands
change_type: fix
date: 2026-10-21
files: [RouterManager.App/MainWindow.xaml.cs, RouterManager.App/RouterBackend.cs, RouterManager.App/Assets/manager.mjs, RouterManager.Tests/routes.test.mjs, integrations/lark-channel-bridge/src/agent/models.ts, integrations/lark-channel-bridge/src/commands/index.ts, integrations/lark-channel-bridge/src/config/config-ops.ts, integrations/lark-channel-bridge/src/card/config-card.ts, integrations/lark-channel-bridge/src/ui/api.ts, integrations/lark-channel-bridge/tests/unit/agent/models.test.ts, integrations/lark-channel-bridge/tests/integration/commands/profile-config-command.test.ts, integrations/lark-channel-bridge/dist/cli.js]
doc_impact: [desktop-ui, routing-runtime, chat-commands]
sync_status: synced
---

# 状态与模型保存诊断

只读核查 2026-10-21 本机日志/配置/任务/进程；用户明确“已暂停”出现在路由控制台。当前源码没有这个文案，PID 不存在时显示“已停止”，连接恢复时显示“重连中/启动或重连中”。检查时当当桥接 PID 6316 存活、托管任务 Running、健康状态 running。今天 08:50、08:58、09:07、09:23、09:37 有 WebSocket 重连并恢复；这些记录不能直接证明用户看到的每次暂停由网络造成。保存路由先停止服务再启动，状态可能在此期间显示停止；需保留具体发生时间来关联。

审计明确记录：路飞 09:17:58 和 09:30:10 尝试保存 gpt-6.1-sol，分别在 09:19:46、09:31:58 因新后端未上线而回滚。对应托管任务 LastTaskResult=1、Disabled；娟娟 09:23:46 的应用也在 09:25:37 失败且任务退出码 1。当当 09:09/09:33 的 default 保存成功。失败对象 runtime 没有 service.log/health.json；只确认早期启动失败，尚未证明是模型无权限、具体 Node 异常或 VBS 失败。不要重新启动真实对象来猜原因。

发现并修复：桌面 RunOperation 无论成功失败都会 resetEditor，导致失败后模型输入消失；现在失败保留编辑。桥接 /config 和网页设置仍只认旧静态列表，自定义合法模型被归一为 default；现在与执行层统一、补充当前自定义选项并在其他偏好保存时保留。ApplyAsync 使用显式 UTF-8 修复中文错误乱码。上线超时附加任务状态/退出码；supervisor 启动异常尽力写脱敏 bootstrap.log，不取消回滚。

保存偏好同时修复整根配置序列化会丢弃未知字段的问题：锁内合并原始 JSON 的目标偏好等字段，其他 profile 和目标扩展字段保留，并补充断言。

验证：桥接命令/模型 86 项通过，tsc、vite、tsup 成功；主工程 C# 22 项、Node 15 项临时事务测试通过；独立 artifacts/model-save-fix-build 构建和 --demo --probe 成功。未覆盖运行中 app/生产桥接，未更改真实配置/任务或发送飞书消息。运行中的 app 仍是旧构建，前轮 /model 补丁也未获得生产部署授权，不能宣称本轮线上已修复。
