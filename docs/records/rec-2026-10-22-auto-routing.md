---
id: rec-2026-10-22-auto-routing
type: record
layer: 4
status: active
summary: "实现机器人自动 Codex→pi、额度反馈与持久恢复提醒，尚未生产部署"
load_when: ["自动路由", "额度耗尽", "备用 pi", "切回"]
globs: []
related: [auto-routing, product-design, architecture-design, deployment-reference]
depends_on: []
last_updated: 2026-10-22
token_est: 546
module: auto-routing
change_type: feat
date: 2026-10-22
files: [RouterManager.App/AutoRouting.cs, RouterManager.App/AutoRouteWindow.cs, RouterManager.App/Assets/auto-route.mjs, RouterManager.App/Assets/manager.mjs, RouterManager.App/Assets/agent-data.mjs, RouterManager.App/Assets/lifecycle.mjs, RouterManager.App/MainWindow.xaml, RouterManager.App/MainWindow.xaml.cs, RouterManager.App/RouterBackend.cs, RouterManager.App/BotLifecycle.cs, integrations/lark-channel-bridge/src/runtime/run-executor.ts, RouterManager.Tests/auto-route.test.mjs, integrations/lark-channel-bridge/tests/unit/runtime/run-executor.test.ts, build.ps1, test.ps1]
doc_impact: [auto-routing, routing-runtime, agent-observability, desktop-ui]
sync_status: synced
---

# 自动路由与恢复提醒

用户要求机器人级自动路由开关，Codex 无反馈/额度耗尽后自动切 pi，反馈额度并记录刷新时间，到点提醒可切回。按 [[auto-routing]] 实现默认关闭、显式开关，终止超时须真实额度为零，明确额度错误可直接判定；普通输出、网络错误不直接触发。只消费启用后的新失败，原请求不重放，忙碌保护和各后端历史继续隔离。

新增持久 policy/state、后台 worker、单机器人操作/worker 锁和 Lark 接单门禁；自动路由、手动路由、托管服务和删除串行。沿用原 apply 配置锁及失败回滚，不整体恢复其他 profile。通知经加密读取器取 Secret、仅内存发送到触发会话，稳定 UUID 防止重试重复；切换成功后通知失败不能再次切换。到期查询与“接口未知”区分，仍耗尽继续查询或通知新时间。窗口内总额度开关保持原行为，后台自动路由是此次用户新增的独立显式授权能力。

界面含开关、备用 pi 模型、时间状态和切回原 Codex 路由。先保存独立服务；首次启用要求活动桥接已有门禁，空闲目标按现有任务重启。主列表无脏编辑时同步后台改变的后端/目录/模型。build.ps1 增加可选 OutputDirectory，便于不覆盖活动 app 的构建。

Windows worker 使用 WMI 启动到计划任务 Job 外，防止普通 detached 子进程仍随 Stop-ScheduledTask 被终止。已用 artifacts/auto-worker-smoke 的假目录/仅写本地文件脚本执行真实 WMI 启动验证：请求读取后删除且产生 done.json，未创建计划任务或连接外部服务。真实停止任务后的完整跨后端切换尚未执行。

验证：test.ps1 的 31 项 C# 检查与 35 项 Node 测试通过（自动路由新增 18 项）；桥接 runtime/commands 共 130 项测试通过，新增门禁测试复跑通过；tsc、vite、tsup 成功。build.ps1 -OutputDirectory artifacts/auto-route-build 成功。--demo --probe 验证设置窗口 660×630、1 个开关/3 个按钮，深浅对比度通过。所有网络反馈测试均为 mock，服务事务使用临时配置和 hooks；未发飞书真实消息，未模拟真实额度耗尽，未更改真实策略或启停机器人。本轮未部署活动 bridge 或 app。

设计、模块和部署步骤已更新。根 AGENTS 的常规额度窗口轮询约束仍有效；本次用户明确增加的后台恢复提醒在独立开关下运行，不手改该人工维护入口。
