---
id: adr-local-service-boundaries
type: adr
layer: 5
status: accepted
summary: "桌面管理、独立后台服务和用户状态分离的交付边界"
load_when: []
globs: []
related: [architecture-design, deployment-reference]
depends_on: []
last_updated: 2026-10-21
token_est: 212
date: 2026-10-21
supersedes: []
---

# ADR：控制台与后台服务分离

## 背景

本机已有多个不同来源的飞书桥接。用户要求集中管理，同时继续使用本机 CLI 登录，窗口关闭后机器人仍需在线。工程要迁移目录并支持后续 AI 继续维护。

## 决策

控制台使用 C# WPF；后台由 Windows 计划任务启动隐藏 CLI supervisor。机器人身份用 App ID，各后端会话和 pi 运行包按机器人隔离。工程移动只移动代码、补丁快照和发布物；用户凭据、历史和 Agent 安装保持独立。源代码包不包含用户运行状态。

采用内置文档工具将 AGENTS、设计、模块和记录关联；由它生成 MAP、Claude/Cursor 入口。把现有桥接补丁快照纳入工程，但不自动将它们部署成生产路径。

## 后果与替代方案

优点是关窗不停止服务、迁移不影响机器人、代码包可交接且不泄漏用户状态。代价是跨机器还需安装 CLI、登录和重新配置外部路径；不能把 ZIP 当作完整账号环境。替代的一体化桌面托管会让关窗影响服务；直接移动整个用户工作目录会夹带凭据和会话，均不采用。

实现方案见 [[architecture-design]]，运维边界见 [[deployment-reference]]。此 accepted 决策后续只以新 ADR supersedes 替代。
