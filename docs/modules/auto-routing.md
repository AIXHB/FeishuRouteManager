---
id: auto-routing
type: module
layer: 3
status: active
summary: "机器人级 Codex 额度耗尽后切 pi、持久时间和飞书恢复提醒"
load_when: ["自动路由", "备用", "额度耗尽", "切回", "刷新提醒"]
globs: [RouterManager.App/AutoRouting.cs, RouterManager.App/AutoRouteWindow.cs, RouterManager.App/Assets/auto-route.mjs, RouterManager.Tests/auto-route.test.mjs]
related: [routing-runtime, agent-observability, desktop-ui, product-design, architecture-design, deployment-reference]
depends_on: [routing-runtime, agent-observability]
last_updated: 2026-10-22
token_est: 742
module: auto-routing
implements: []
public_api: [SaveAutoRouteAsync, ReturnPrimaryAsync, autoRouteTick, runAutoRoute, shouldLaunch, savePolicy, routeLock]
tests: [RouterManager.Tests/auto-route.test.mjs, integrations/lark-channel-bridge/tests/unit/runtime/run-executor.test.ts, "WPF --demo --probe"]
key_files: [RouterManager.App/AutoRouting.cs, RouterManager.App/AutoRouteWindow.cs, RouterManager.App/Assets/auto-route.mjs, RouterManager.App/Assets/manager.mjs, integrations/lark-channel-bridge/src/runtime/run-executor.ts]
---

# 自动路由和恢复提醒

选中机器人 → 自动路由。每机器人独立开关，默认关闭；主路由 Codex，备用 pi，可填 default 或 provider/model。要求托管 route、可用 pi 和已部署的 Lark 接单保护补丁。启用时目标必须空闲，运行中的目标会重启；关闭策略不重启，也不自动切回。

policy 是 runtimeRoot/auto-route.json；state 是 auto-route-state.json，记录原模型/目录、失败事件、触发会话、checkedAt/resetAt/nextCheckAt、切换与提醒状态。不写凭据。状态属于用户运行数据，不进入源码或发布包。

supervisor 每 15 秒检查最近两份结构日志（每文件最多 2 MB）。仅处理启用后、15 分钟内未处理的 Codex run.failed，并要求原日志有合法 chatId；模型普通输出、工具日志、旧失败、普通 429、认证/网络错误不触发。明确 usage limit / insufficient quota 可以触发；终止超时/无反馈错误必须经真实额度查询确认 Codex 总额度为零。正在执行、尚无终止事件的任务不会被强杀。没有可通知会话的后台任务不会静默切换。

触发时查询真实 Codex account/rateLimits/read，沿用该 profile 的 binary/codexHome；后台不是推理试探，不消费手动 reset。多 bucket 保留 limitId，其他模型独立 bucket 的零额度不能用来判定 Codex 总额度耗尽；恢复仅在全部已返回 bucket 大于零时确认。所有耗尽窗口都有有效未来 resetsAt 时取最晚时间；缺失则未知，每 5 分钟复查。接口来源：[官方 App Server](https://learn.chatgpt.com/docs/app-server)。

worker 由 Windows WMI Win32_Process.Create 隐藏启动到计划任务 Job 外，在现有 apply 事务中停止/重启 supervisor，避免 Stop-ScheduledTask 连带杀掉普通 detached 子进程。启动命令经 PowerShell stdin 传递，随机请求文件在 ManagerRoot/auto-route-requests，内容仅 runtimeRoot、读取即删除；命令行不带真实机器人 runtimeRoot，避免服务停止的进程匹配误杀。auto-worker 锁阻止重复处理；route-operation 锁串行手动路由、自动路由、策略保存、托管服务与删除。锁定后复查预期后端和开关。自动切换建立带 5 分钟过期的 route-paused 门禁；Lark RunExecutor 在排队/准备前后拒绝接新任务，再检查忙碌。原配置锁、回滚、其他 profile 保留及 pi 独立权限继续生效。

用目标机器人的加密 Secret 读取器取凭据，仅内存 HTTP 使用，通知发送至失败所在飞书会话。开始切换前反馈原因、各额度窗口剩余与预计刷新；上线后反馈 pi 模型和重发提示。切换成功后的通知失败只重试通知，不重切；消息带稳定 uuid，状态在发送成功后标记。失败尝试恢复原服务并反馈，已处理失败不无限循环。通知协议见[飞书发送消息](https://open.feishu.cn/document/server-docs/im-v1/message/create)。

关闭控制台不停止后台提醒；关闭策略或停止机器人会停止后台检查，重启后读取持久时间继续。到点真实复查：恢复则提醒可切回，仍耗尽且有新时间则通知推迟，仍耗尽但时间未知则继续每 5 分钟复查；查询不可用只说明预计时间已到、尚未确认恢复。提醒一次，不自动切回。界面可“切回原 Codex 路由”，要求 pi 空闲并经用户确认，恢复保存的原模型和目录。不同后端的会话 ID 不混用；原请求不自动重放。

普通控制台额度轮询仍遵循窗口内总开关。本功能是用户单独启用的机器人后台故障处理，与 UI 额度轮询分开。2026-10-22 已按用户“全部生效启动”授权部署新版控制台、活动 Lark 门禁及四个 helper，三台机器人启动并确认连接；策略保持默认关闭，未做真实额度耗尽/自动切换验收。部署步骤见 [[deployment-reference]]，本轮证据见 [[rec-2026-10-22-deploy-all]]。
