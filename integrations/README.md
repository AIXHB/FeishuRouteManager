# 桥接代码快照

本目录保存迁移时实际本地修改的代码基线，不含用户运行数据。它不是生产路径切换指令。

2026-10-23 聊天指令扩充（已部署）：两套桥接增加 `/cancel`、`/pwd`，Lark 增加 `/sessions [N]` 历史入口；帮助补充分类、示例及作用范围。已按用户“重新部署”授权安装 Lark dist 及 pi 四项分发文件，三台机器人重启连接通过；实际任务侧哈希和 pi 私有包核验通过。验证及边界见 [聊天命令模块](../docs/modules/chat-commands.md)。

2026-10-22 自动路由补丁：Lark RunExecutor 增加 FEISHU_ROUTER_PAUSE_FILE 接单门禁，配合管理器 Codex 额度耗尽后切 pi 的事务。已按用户“全部生效启动”部署活动桥接和控制台，三台机器人连接核验通过；自动路由策略保持默认关闭。后台 helper 增至 manager/lifecycle/auto-route/agent-data 四文件。后续更新仍须显式部署。详见 [自动路由](../docs/modules/auto-routing.md)。

2026-10-22 专属 skill 补丁：Lark 的运行 Agent 和 pi RuntimeHost 每次任务按 App ID 加载机器人专属目录提示，名称/描述和路径来自同一份 pi 分发源码 dist/skills/bot-skills.js，Lark 构建时打包该模块。控制台安装/卸载用私有副本，运行数据不进入本目录。详见 [机器人专属 Skills](../docs/modules/bot-skills.md)。当天已按用户“安装重启”授权部署到生产，三台机器人连接核验通过；后续改动仍需明确部署，快照不会自动同步。

2026-10-21 聊天指令补丁：两套桥接支持 `/help`、`/model` / `/models`；Lark 的 `/model <ID>` 修改机器人默认模型（管理员、空闲时），pi 的 `/model provider/model` 修改当前会话。说明与验证见 [聊天命令模块](../docs/modules/chat-commands.md)。本轮快照未部署到生产；pi 回归入口为 `node --test chat-commands.test.mjs`（先安装本目录锁定依赖）。

## Lark Channel Bridge

- 版本：package.json 标识 0.7.1，MIT；上游 github.com/zarazhangrui/feishu-claude-code-bridge。
- 来源：本机 2026-10-14/pi/outputs/lark-multi-agent；保留 LICENSE、源码、测试、bin、dist、web 与 npm/pnpm 锁文件，不带 .git 和 node_modules。
- 本机补丁已包含 Antigravity adapter、动态模型 ID、--model 转发等；不能用一份干净 npm 同版本包替换后宣称等价。
- 主工程只需 setup-dependencies.ps1。改桥接先 -BridgeDevelopment，再在该目录执行 .\node_modules\.bin\vite.cmd build web、.\node_modules\.bin\tsup.cmd，及 vitest/typecheck。package.json 的完整 build 使用 pnpm。

## pi-feishu

- 根依赖锁来自实际 pi 安装；pi-remote-feishu 0.1.6，依赖 pi-coding-agent 0.83.0，MIT（按原包声明）。
- patched-package 是已安装并本地修改的 npm 分发源码（dist JS/类型/上游 README/架构/skills），不是完整 TypeScript 仓库。
- service-runtime、connection-health、workflow-limits、bounded-bash 是原部署使用的本地辅助源码。没有复制 .pi/.agent、用户数据、日志、视频、凭据或任务包装脚本。
- 执行 setup-dependencies.ps1 -IncludePi 后，将 patched-package 覆盖到安装的包上。仅 npm ci 会丢失本地补丁。源包保留原导入约定，部署前须检查相对/原绝对引用；不能仅复制此目录就假定飞书服务可运行。

跨机器应重新安装 CLI、登录、添加机器人并选择正确集成路径。生产路径和备份说明见 ../docs/ref/deployment-reference.md。
