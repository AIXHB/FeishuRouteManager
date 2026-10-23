---
id: protocol
type: protocol
layer: 1
status: active
summary: "所有 AI 读取、开发、验证和记录本项目的共同协议"
load_when: [always, protocol, workflow]
globs: []
related: [context, map]
depends_on: []
last_updated: 2026-10-21
token_est: 179
---

# 文档连续性协议

## 证据顺序

1. 读根目录 `AGENTS.md`、[[protocol]] 和 [[context]]。
2. 按任务关键词或目标文件定位文档；不确定归属时读 [[map]]。
3. 读命中的设计、模块及其直接依赖，再读目标模块的 pending records。
4. 修改前读模块 `key_files` 指向的真实源码；代码是当前实现真相。
5. 实现后运行项目测试。行为或验收变化立即更新设计，代码变化追加 record。
6. 完成前运行 `status`、`validate` 和 `sync`。

## 真相分层

- 设计文档：为什么做、做什么、边界和验收。
- 模块文档：当前代码如何工作。
- pending record：尚未沉淀进活文档的最新事实。
- ADR：决策历史；接受后不可改写含义。

## 关系与命名

文档使用全局唯一英文 slug `id`。普通文档文件名必须等于 `id.md`。机器关系写在 YAML ID 数组，正文用指向真实文档 ID 的 Obsidian WikiLink；两者都必须可解析。
