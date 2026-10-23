---
id: rec-2026-10-22-bot-skills
type: record
layer: 4
status: active
summary: "新增按机器人隔离的本地 skill 安装卸载和 Agent 任务目录加载"
load_when: []
globs: []
related: [product-design, architecture-design]
depends_on: []
last_updated: 2026-10-22
token_est: 527
module: bot-skills
change_type: feat
date: 2026-10-22
files: [RouterManager.Core/BotSkills.cs, RouterManager.App/SkillManagement.cs, RouterManager.App/SkillManagerWindow.cs, RouterManager.App/MainWindow.xaml, RouterManager.App/MainWindow.xaml.cs, RouterManager.App/Assets/manager.mjs, RouterManager.Tests/Program.cs, RouterManager.Tests/skills.test.mjs, test.ps1, integrations/lark-channel-bridge/src/agent/bot-skills.ts, integrations/lark-channel-bridge/src/runtime/agent-runtime.ts, integrations/lark-channel-bridge/tests/unit/agent/bot-skills.test.ts, integrations/lark-channel-bridge/dist/cli.js, integrations/pi-feishu/patched-package/dist/skills/bot-skills.js, integrations/pi-feishu/patched-package/dist/skills/bot-skills.d.ts, integrations/pi-feishu/patched-package/dist/bridge/runtime-host.js, integrations/pi-feishu/skill-runtime.test.mjs]
doc_impact: [bot-skills, desktop-ui, routing-runtime, delivery-tooling]
sync_status: synced
---

# 机器人专属 Skills

新增主窗口“专属 Skills”入口：绑定选中 App ID，安装本地含 SKILL.md 的目录、预览正文、卸载选中项。存储为 bots/<App ID>/skills 独立副本，卸载移到同机器人 skill-archives；不改工作目录或全局 skill，不执行脚本。后台刷新实际状态并拒绝运行/忙碌对象，避免任务读取期间修改。文件锁、staging 原子发布、名称/路径/目录联接/文件数量与体积限制保护目标与其他机器人；失败清理 staging。

Lark createRuntimeAgent 包装 Codex/Antigravity/Claude 的 run，pi RuntimeHost.prompt 在每次任务开始时加载当前 App ID 的目录提示，要求适用时读取专属 SKILL.md 与相对资源。目录协议共用 pi 分发源码，由 tsup 打包 Lark dist。只提供当前机器人目录；空目录也明确声明，无跨后端会话或认证目录变更。此处是安装命名空间隔离，既有后端全局/内置 skill 和 OS 文件访问权限仍由后端管理。

知识已沉淀到 [[bot-skills]]、[[desktop-ui]]、[[routing-runtime]]、[[delivery-tooling]]，产品/架构及部署说明同步更新。

验证：31 C# + 17 Node 主工程检查通过；Lark Agent/运行时/命令回归 197 项通过，tsc、vite、tsup 成功；pi RuntimeHost 模拟任务 1 项通过。独立 artifacts/bot-skills-build publish 成功；WPF --demo --probe 打开只读 Skills 窗口（860×680、3 按钮、1 列表、1 预览框），不读取或安装真实 skill。运行中控制台未关闭，使用独立 publish 目录替代 build.ps1 的 app 覆盖，未改生产桥接、真实机器人配置/任务，未发送飞书测试消息。未执行真实模型推理验收，功能首次生效需要后续授权部署对应控制台/桥接。
