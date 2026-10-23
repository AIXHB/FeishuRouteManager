---
id: rec-2026-10-22-deploy-all
type: record
layer: 4
status: active
summary: "用户授权部署全部已完成功能并启动三台机器人，连接与设置核验通过"
load_when: ["全部生效", "全部启动", "自动路由部署"]
globs: []
related: [auto-routing, deployment-reference, context]
depends_on: []
last_updated: 2026-10-22
token_est: 339
module: delivery-tooling
change_type: config
date: 2026-10-22
files: [docs/CONTEXT.md, docs/modules/auto-routing.md, docs/ref/deployment-reference.md, integrations/README.md]
doc_impact: [delivery-tooling, auto-routing, routing-runtime]
sync_status: synced
---

# 全部功能部署和启动

用户明确要求“全部生效启动一下”。重新发现三台既有机器人，任务当时为 Ready、旧心跳 PID 已不存在，逐个通过 assertIdle。test.ps1 的 31 项 C# 和 35 项 Node 检查通过。

先以 build.ps1 构建到临时发布目录，正常关闭旧控制台，备份 app、活动 Lark dist/cli.js 和四个 helper。只更新 Lark cli.js 与 manager/lifecycle/auto-route/agent-data.mjs，安装新 app 并更新开始菜单；未覆盖 pi 分发包、本地定制服务、认证、历史或工作目录。旧入口与技能不更改。备份及证据位于 artifacts/deployment-all-20261022-105305，不含凭据或根配置正文。

等待旧锁过期后启动三个原有计划任务，重开正式控制台。2026-10-22 10:54（北京时间）只读核验：当当 Codex/gpt-6.1-sol PID 3200、娟娟 pi/default PID 12028、路飞 Codex/gpt-6.1-sol PID 27540，均进程存活、心跳新鲜、任务 Running；真实 WPF 探针均显示已连接、Busy=false。

五个补丁目标哈希与源码相同。所有 route、已有 skill 和策略文件保护哈希保持；启动前及连接后 profile 的 App ID、Agent、模型、权限和工作目录快照一致。当当四项技能仍可发现，包括 echart-skill。自动路由新窗口探针确认 1 个开关/3 个按钮，活动桥接已有接单门禁。三个机器人均没有自动路由策略文件，保持默认关闭，未代用户统一启用。

没有发送飞书测试消息或真实模型任务，没有人为触发额度耗尽或自动切换。用户可在新控制台单独启用自动路由，运行机制见 [[auto-routing]]。
