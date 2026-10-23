---
id: deployment-reference
type: reference
layer: 6
status: active
summary: "迁移范围、本机外部依赖、数据与备份恢复说明"
load_when: ["部署", "迁移", "路径", "恢复", "计划任务"]
globs: []
related: [context, architecture-design, routing-runtime, delivery-tooling]
depends_on: []
last_updated: 2026-10-22
token_est: 827
---

# 部署与迁移说明

## 本次边界

目标工程：E:/AIDesign/AIRGC/FeishuRouteManager。原工程：C:/Users/15700/Documents/Codex/2026-10-20/new-chat/outputs/FeishuRouterManager，保留为只读使用习惯的回退副本（未设置文件 ACL）。后续只在 E 盘工程开发，开始菜单“飞书机器人路由控制台”指向 E 盘 app/FeishuRouterManager.exe。

仅迁移工程和发布程序；下述路径是机器现状记录，不是产品常量，不得把它们硬编码进源码。

| 数据/依赖 | 当前本机位置 | 随工程移动 |
|---|---|---|
| 多 profile 配置和加密凭据 | %USERPROFILE%/.lark-channel | 否 |
| 管理器设置/路由/工具/归档/审计 | %LOCALAPPDATA%/FeishuRouterManager | 否 |
| 活动 Lark Bridge | C:/Users/15700/Documents/Codex/2026-10-14/pi/outputs/lark-multi-agent | 否；工程有补丁快照 |
| 活动 pi 安装及娟娟工作目录 | C:/Users/15700/Documents/Codex/2026-10-11/https-juejin-cn-post-7669024144830791686-https/outputs/pi-feishu | 否；工程有代码快照 |
| 当当工作目录 | C:/Users/15700/Documents/Codex/2026-10-20/new-chat/outputs/dangdang | 否 |
| CLI 登录与模型认证 | 对应 Codex home、agy、.agent 等用户目录 | 否 |

不要删除旧聊天父目录：那里仍有真实机器人工作目录和活动桥接。迁移成功只意味着 WPF 工程/入口已移动，不代表这些运行依赖可清理。

## 运行布局

部署核验必须覆盖实际后台任务的文件视图。2026-10-22 排查发现命令环境读取 C 盘 helper 为新文件，但 WMI 系统进程读取同一路径仍为旧文件；仅在部署命令中 Get-FileHash 不足以证明任务加载新代码。应从任务侧读取并核对哈希，或核验新进程心跳中的 supervisorPid 版本字段；必要时在用户授权范围内由同一系统进程上下文执行备份/复制，并再次验证。详见 [[rec-2026-10-22-heartbeat-exit]]。

ManagerRoot 下 integrations.json 指向活动依赖；preferences.json 保存主题/额度开关。bots/<App ID>/route.json 描述当前托管路由；tools 下的 helper 是服务启动依赖，不能随意删除。bots 各目录包含 health、日志、pi-agent、pi-package、pi-config、backups 等。archives 保存删除前配置与任务 XML；quota/latest.json 是可重查缓存。

专属 skill 位于 bots/<App ID>/skills，卸载副本在同机器人 skill-archives；均为用户运行数据，不进入工程源码或运行 ZIP。首次使用须显式部署新版控制台、Lark dist 及 pi 分发补丁，再在目标空闲时重启使运行时接入目录协议；之后按 [[bot-skills]] 停止目标再安装/卸载。不要直接复制新快照覆盖活动服务。该功能不迁移/卸载各 Agent 的原有全局技能。

计划任务一般为 FeishuRouterManager.<App ID>；未接管的 Lark 为 LarkChannelBridge.Bot.<profile>，原生 pi 为 Pi-Feishu-Autostart。实际名字必须以当前 inventory 和清单为准。关控制台仅停止 UI/额度轮询，不停止任务。

## 回退和手工恢复

自动路由（[[auto-routing]]）已于 2026-10-22 按用户“全部生效启动”授权部署并启动三台机器人，证据见 [[rec-2026-10-22-deploy-all]]，各策略仍默认关闭。后续部署需备份控制台 app、活动 Lark dist/cli.js 和 ManagerRoot/tools 中 helper；在目标空闲后部署构建后的 Lark 接单保护补丁，以及 manager.mjs、lifecycle.mjs、auto-route.mjs、agent-data.mjs 四文件，再按原计划任务重启目标。不能只更新 manager.mjs：其静态 import 依赖新 helper。pi 分发包本轮无新增补丁。控制台检测到活动桥接缺少 FEISHU_ROUTER_PAUSE_FILE 保护时拒绝启用。部署代码不等于启用策略；各机器人需单独选择并保存备用模型。auto-route.json、auto-route-state.json 和锁/门禁均是运行数据，不打包，不清理历史。回退前先关闭相关策略；不能用旧 route/config 整体覆盖当前机器人配置。

程序迁移回退：关闭新控制台，用旧工程的 install-start-menu 脚本或明确创建快捷方式指回旧 app，再打开旧程序。不要恢复机器人配置来回退一个纯 UI 迁移。

路由/删除失败由 helper 自动回滚目标。若提示恢复不完整，先停止该机器人相关任务、确认无重复实例；从对应 backup/archive 提取目标 profile、route 和任务 XML，合并目标配置后恢复任务。不得将整个 channel.json 覆盖到当前 config.json，因为其他机器人可能已有更新。

成功删除后人工恢复：确认 App ID 未被重新配置；把归档 profile 合并回根配置，必要时将归档原生 feishu.json 放回原根的 .pi/feishu.json；恢复该 App ID 的 route.json 和 tasks.json 中对应任务 XML，检查 sourceRoot、工作目录及 helper 路径仍存在后决定是否启动。加密库和盐留在原 profile 目录；换机器/用户不能直接保证解密成功。恢复目前没有 UI，需要维护者操作并验证连接。

## 在另一台机器部署

解压源码、安装 SDK/Node 并构建；安装需要的 Agent CLI、登录、准备飞书应用和工作目录，再在设置配置 ChannelHome/BridgeEntry/PiRoot/NodeBinary。集成快照可作为源码基线，先安装依赖并验证，再显式选择是否替代生产桥接；不要自动从旧 integrations.json 继承不存在的绝对路径。

更多构建操作见 [[delivery-tooling]]，运行事务见 [[routing-runtime]]；边界决策见 [[architecture-design]]。
