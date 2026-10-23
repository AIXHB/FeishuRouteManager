---
id: bot-skills
type: module
layer: 3
status: active
summary: "按 App ID 隔离的专属 skill 安装、卸载、预览和每次任务加载"
load_when: [skill, skills, "技能", "独立安装", "卸载", "skill隔离"]
globs: [RouterManager.Core/BotSkills.cs, RouterManager.App/SkillManagement.cs, RouterManager.App/SkillManagerWindow.cs, RouterManager.Tests/skills.test.mjs, "integrations/pi-feishu/patched-package/dist/skills/bot-skills.*", integrations/pi-feishu/skill-runtime.test.mjs, integrations/pi-feishu/patched-package/dist/bridge/runtime-host.js, integrations/lark-channel-bridge/src/agent/bot-skills.ts, integrations/lark-channel-bridge/tests/unit/agent/bot-skills.test.ts]
related: [product-design, architecture-design, desktop-ui, routing-runtime, development-guide, deployment-reference]
depends_on: []
last_updated: 2026-10-22
token_est: 917
module: bot-skills
implements: []
public_api: [BotSkills.Root, BotSkills.List, BotSkills.Install, BotSkills.Uninstall, RouterBackend.ChangeSkillAsync, SkillManagerWindow, botSkillPrompt, withBotSkills]
tests: [RouterManager.Tests/Program.cs, RouterManager.Tests/skills.test.mjs, integrations/lark-channel-bridge/tests/unit/agent/bot-skills.test.ts, integrations/pi-feishu/skill-runtime.test.mjs, "WPF --demo --probe"]
key_files: [RouterManager.Core/BotSkills.cs, RouterManager.App/SkillManagement.cs, RouterManager.App/SkillManagerWindow.cs, integrations/lark-channel-bridge/src/agent/bot-skills.ts, integrations/pi-feishu/patched-package/dist/skills/bot-skills.js, integrations/pi-feishu/patched-package/dist/bridge/runtime-host.js]
---

# 机器人专属 Skills

主窗口选择机器人 → 专属 Skills → 安装本地文件夹/预览 SKILL.md/卸载。安装来源必须是含 SKILL.md 的单个目录，保留 scripts、references、assets 等配套文件。不会下载远程仓库或执行安装脚本。

存储键是 App ID：ManagerRoot/bots/<App ID>/skills/<skill-id>。改机器人名称、工作目录或切换 Agent 不改变安装范围；同工作目录的机器人也使用不同副本。后端内置和用户原有的全局 skill 不在本管理器的安装/卸载范围，此隔离是专属 skill 的存储与任务目录隔离，不是 OS 文件权限沙箱。

BotSkills 仅使用标准库。名称取 YAML 头部的简单 name 字段，缺失时取来源目录名；要求小写字母、数字、短横线，最长 64 字符，拒绝 Windows 保留名。安装先复制到隐藏 staging，再原子改名发布，同名拒绝覆盖。每项最多 2048 文件、64 MB、20 层目录，SKILL.md 最多 128 KB，每个机器人最多 128 项。拒绝符号链接/目录联接、路径穿越、来源与目标运行目录重叠、运行状态/凭据/依赖目录。操作使用单机器人 skills.lock 文件锁。

卸载将目标原子移入该机器人的 skill-archives/<id>-<uuid>，保留来源和其他机器人；归档不被任务发现。删除失败不视为成功。后端 ChangeSkillAsync 经控制台操作锁刷新真实对象，要求机器人不忙碌、无活动 PID、任务不为 Running，避免任务正在读取文件时卸载。界面不自动停止或重启机器人，用户通过现有服务按钮操作。

运行加载采用 SKILL.md 目录提示协议：每次任务读取当前机器人的专属目录，提供技能名称、摘要和绝对路径，要求 Agent 在适用时先读 SKILL.md，再按相对路径使用资源。不是将全部 skill 正文塞入提示词，也不更改全局 skill 目录。Lark createRuntimeAgent 使用 withBotSkills 包装 Codex/Antigravity/Claude，保留认证、模型、权限、进程和会话参数；pi RuntimeHost.prompt 在用户任务前注入相同目录协议。目录读取拒绝链接和过大文档。空目录明确声明没有专属安装项；卸载后下一次任务不再列出该项，历史消息本身不删除。

目录协议实现在 pi 分发快照 dist/skills/bot-skills.js 和类型声明，Lark 从该同一源码导入并由 tsup 打包进 dist/cli.js。管理器 supervisor 通过 FEISHU_ROUTER_MANAGER_ROOT 传递运行数据根；未托管入口使用默认 LocalAppData/FeishuRouterManager。App ID 来自真实 profile 或 pi config，不来自聊天文本。

验证涵盖两机器人同目录、独立副本、重名拒绝、归档卸载、失败清理、路径穿越/联接拒绝、跨机器人目录不泄漏、下一次任务目录更新、模型/历史会话参数和 pi UI 上下文保持。WPF 探针只打开只读预览，不安装到真实对象。首次生效需要显式部署新版控制台和对应桥接，遵守 [[deployment-reference]]；快照构建不等于生产更新。

办公与财务源包位于 skill-packages/dangdang：daily-office、finance-management、office-spreadsheets。2026-10-22 用户授权安装到当当的专属目录，其他机器人不安装。源包包含任务交付规则、金额 Decimal 只读汇总脚本和空台账模板，不含真实账目及凭据。财务脚本支持期间过滤、按币种分组、重复 ID 和非法数据拒绝；模拟数据测试见 RouterManager.Tests/dangdang_skills_test.py。工作流按实际工具读取材料并交付文件，不因安装而开通飞书文档、审批或定时能力；飞书豆包仅作为产品流程参考。

2026-10-22 另按用户链接为当当安装 [lgwanai/echart-skill](https://github.com/lgwanai/echart-skill)，固定提交 86c8200177f22636c2ac0e7d013b2b0aa77a9282。使用上游 full 分发白名单，添加本机运行说明和 Windows 浏览器检测兼容；专属 Python 在同 App ID 的 skill-runtimes/echart-skill，核心依赖与其他机器人隔离。支持本地 Excel/CSV、DuckDB 查询及 ECharts 成果；核心链路已用模拟数据核验。没有开通外部数据库、轮询或服务。技能以自然语言按需发现，仓库 commands 文档不会自动注册为飞书 slash 指令。真实安装副本、venv 和分析产物仍是运行数据，不随工程打包。
