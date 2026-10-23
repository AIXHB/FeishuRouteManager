# v0.3.0 — 飞书机器人路由控制台

发布日期：2026-10-23。

## 功能

- 多机器人管理：Codex、Antigravity、pi 路由选择，模型与工作目录设置，启动、停止、重启及新增、删除。
- 配置修改使用锁和目标 profile 合并，失败恢复；保留其他机器人配置和未知字段。
- 每个机器人独立的 skill 安装、卸载和副本隔离。
- 飞书聊天指令 `/help`、`/model`、`/models`、`/cancel`、`/pwd`；Lark 增加 `/sessions [N]`。Lark 模型设置作用于机器人后续任务，pi 模型选择作用于当前会话。
- Codex 额度明确耗尽后可自动切换 pi，并反馈额度和记录恢复时间；到点提醒用户选择切回。开关默认关闭，需单独配置备用模型。
- 深浅及系统主题、机器人与 Agent 日志分类、可选额度查询。
- 后台心跳写入失败自动重试，避免文件短暂占用导致服务退出；持续断线恢复按连续断线时间计时。

## 下载与安装

- `FeishuRouteManager-Windows.zip`：完整 Windows 程序。解压后运行 `app/FeishuRouterManager.exe`；保留整个 app 目录。`install-start-menu.ps1` 可添加开始菜单入口。
- `FeishuRouteManager-Source.zip`：工程、两套桥接补丁快照、测试、构建脚本和文档；不含 node_modules、构建缓存或机器人运行数据。
- `source-manifest.json`：源码文件 SHA256 清单；`SHA256SUMS.txt`：发布附件校验和。

需要 Windows 10/11、.NET 8 Desktop Runtime、Node.js 22.19+，以及已安装并登录的相应 Agent。桥接依赖和飞书应用凭据需自行配置；源码构建按 `setup-dependencies.ps1` → `build.ps1` → `test.ps1`。integrations 是补丁快照，生产桥接需显式部署。

## 验证与边界

.NET 8 Release 构建、31 项 C# 检查和 38 项 Node 测试通过。桥接新增指令已通过 Lark 89 项、pi 5 项测试及 Lark typecheck/build；本机三台机器人部署后通过只读连接核验。

包内不含用户凭据、会话、工作目录、额度缓存或运行日志。没有使用新飞书凭据完成跨机器端到端验收，没有自动发送飞书测试消息。pi 和 Antigravity 没有统一额度查询接口，不显示推测余额。
