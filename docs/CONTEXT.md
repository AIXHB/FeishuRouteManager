---
id: context
type: context
layer: 1
status: active
summary: "项目目标、技术栈、当前状态与全局边界"
load_when: [always, context, "现状"]
globs: []
related: [protocol, map, product-design, architecture-design, development-guide, deployment-reference]
depends_on: []
last_updated: 2026-10-22
token_est: 455
---

# 项目上下文

## 目标与当前能力

统一管理同机多个飞书机器人，使每个机器人选择 Codex、Antigravity 或 pi，配置模型与工作目录，管理服务和日志。当前 v0.3.0 已有新增/删除配置、事务路由、独立后台任务、深浅/系统主题、模型发现、机器人/Agent 双向日志分类、窗口内额度查询及定制应用图标。

技术栈为 C#/.NET 8 WPF、无第三方 UI 框架；Node.js ESM 管理桥接事务；Windows 计划任务和隐藏 VBS 启动服务。SDK 固定 8.0.422（global.json），Node 最低按 pi 依赖要求 22.19，迁移验证环境为 Node 24。核心无额外 NuGet 包。程序集名保留 FeishuRouterManager，目录名为 FeishuRouteManager。

## 项目与运行数据分离

新工程目录是 E:/AIDesign/AIRGC/FeishuRouteManager；旧 C 盘工程作为迁移回退副本。app 是可重建的发布目录，不是运行数据。用户配置、加密密钥、计划任务、会话和真实 Agent 安装仍在各自原位，详见 [[deployment-reference]]。迁移工程不会迁移机器人工作目录。

现有机器人曾核查为当当→Codex、路飞→Codex、娟娟→pi；这仅是迁移时快照，后续必须重新发现，不当作固定产品数据。

## 交接事实和已知限制

- 控制台是管理入口，关窗不会停机器人；额度轮询随窗口关闭停止，默认关、默认间隔 15 分钟。
- Codex 模型来自已有缓存或只读 model/list，额度来自 account/rateLimits/read；同本地账户上下文合并查询。Antigravity models 和 pi 已配置目录可发现模型，但暂无统一额度查询。
- 原始 pi 本地部署有定制运行代码；已保存补丁分发包和辅助源码快照，不含用户模型认证与历史。
- 新机器人保存会联网校验飞书凭据；尚未使用一套新真实凭据做全链路新增/删除验收。隔离事务测试和真实 WPF/计划任务烟雾验证已完成。
- 当前没有自动恢复归档的 UI；删除失败会自动恢复，成功删除后的人工恢复方法见部署指南。机器人专属 skill 本地安装、预览和卸载隔离（见 [[bot-skills]]）及前轮聊天模型补丁已于 2026-10-22 经用户授权部署；三台机器人重启并确认连接。skill 不包含在线编辑。
- 机器人级 Codex 额度耗尽自动切 pi 与恢复时间提醒已按用户“全部生效启动”于 2026-10-22 部署，见 [[auto-routing]]；三台机器人已启动并确认连接，各策略保持默认关闭。它是独立的后台故障处理开关，不改变普通额度页仅窗口内轮询的行为。
- 2026-10-22 后续修复心跳文件被占用时未捕获异常导致守护退出，并发现常规部署与计划任务实际文件视图不同，已补系统侧代码核验与实际部署，见 [[rec-2026-10-22-heartbeat-exit]]。健康写入失败现在重试而不终止桥接，配置事务写入仍严格回滚。

## 最小验证入口

先执行 setup-dependencies.ps1，然后 build.ps1、test.ps1 和 node .ai-docs/docctl.js validate。按 [[development-guide]] 逐步操作。产品行为与技术设计分别见 [[product-design]]、[[architecture-design]]；按 [[map]] 定位模块。
