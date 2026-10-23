---
id: development-guide
type: reference
layer: 6
status: active
summary: "从零接入、构建测试、模块定位及发布操作指南"
load_when: ["开发", "构建", "测试", "交接", setup]
globs: []
related: [context, map, delivery-tooling, deployment-reference, routing-runtime]
depends_on: []
last_updated: 2026-10-22
token_est: 908
---

# 开发指南

## 五分钟接入

从根 AGENTS.md 开始，读 CONTEXT，再运行 node .ai-docs/docctl.js locate "要修改的功能"。当前唯一工程目录是 E:/AIDesign/AIRGC/FeishuRouteManager。不要继续修改旧聊天 outputs 中的副本。

## 环境

Windows 10/11，.NET SDK 8.0.422 及 Windows Desktop Runtime 8，Node.js >=22.19，PowerShell。global.json 要从项目根被发现；从其他目录调用 dotnet 可能选到 .NET 10 并缺少 .NET 8 目标包。无需 Visual Studio；VS 2022 或 C# 编辑器也可打开 FeishuRouterManager.sln。

~~~powershell
Set-Location E:\AIDesign\AIRGC\FeishuRouteManager
dotnet --version
node --version
.\setup-dependencies.ps1
.\build.ps1
.\test.ps1
node .ai-docs/docctl.js validate
~~~

setup 下载锁文件指定依赖，需要 npm 网络或缓存。使用 --ignore-scripts 避免触发桥接 prepare 的 pnpm/web 构建。主程序源代码没有第三方 NuGet 包，但首次 restore 仍需 SDK 的 Windows 引用包。没有依赖时不得把跳过的测试称为通过。

默认 Node 测试 BridgeEntry 位于 integrations/lark-channel-bridge/bin；可传 -BridgeEntry <已有副本>。迁移验证优先装随工程快照依赖，防止测试偷偷依赖旧聊天目录。

## 结构与修改入口

| 目标 | 入口 |
|---|---|
| 界面、主题、图标 | RouterManager.App/MainWindow*、Themes.xaml、ThemeManager.cs、NewBotWindow.cs |
| 发现、健康与路径 | RouterManager.Core/BotDiscovery.cs、IntegrationPaths.cs，RouterBackend.RefreshAsync |
| 服务、切换、增删 | RouterBackend.cs、BotLifecycle.cs、Assets/manager.mjs、Assets/lifecycle.mjs |
| 机器人专属 Skills | Core/BotSkills.cs、SkillManagement.cs、SkillManagerWindow.cs、[[bot-skills]] |
| 自动路由、额度耗尽与切回提醒 | AutoRouting.cs、AutoRouteWindow.cs、Assets/auto-route.mjs、[[auto-routing]] |
| 模型、额度、日志 | AgentServices.cs、Assets/agent-data.mjs、RouteLogs.cs、LogWindow.cs |
| 回归 | RouterManager.Tests/Program.cs、*.test.mjs |

## 运行验证

~~~powershell
.\app\FeishuRouterManager.exe --demo
Start-Process .\app\FeishuRouterManager.exe -ArgumentList '--probe', 'E:\AIDesign\AIRGC\FeishuRouteManager\artifacts\ui-probe.json' -Wait
~~~

先创建 artifacts 目录。--demo 是模拟列表；--probe 读取真实状态、模型缓存与日志，输出布局/对比度/新窗口控件后退出，不会增删机器人。--probe-quota 还会真实查询额度并写缓存/审计，只有需要时附加。不要自动发送飞书消息或用真实机器人做删除测试。新凭据真实收发尚待用户提供一台新应用验证。

Node fixture 使用临时配置，hooks 模拟服务；C# 为控制台断言程序而非 xUnit。当前基线是 31 C# 检查、38 Node 测试，包含心跳写入失败容错、连续断线计时、自动路由/通知/恢复提醒及专属 skill 隔离；pi 真实 RuntimeHost 的模拟任务测试另执行 node --test integrations/pi-feishu/skill-runtime.test.mjs（需 pi 依赖）。桥接修改另做 upstream vitest/typecheck/build，不能用主工程测试替代。

## 维护桥接补丁

Lark 快照先安装开发依赖：setup-dependencies.ps1 -BridgeDevelopment。按 integrations/README.md 构建 web 和 tsup，使用精确锁文件与已补丁源码。模型 ID 放行、Antigravity --model 转发必须保留。pi 需要 setup-dependencies.ps1 -IncludePi 后覆盖 patched-package；只有分发源码快照，改动时应明确是维护 dist 还是取得对应上游源码重建。

## 发布与工程打包

关闭控制台，备份 app，再执行 build.ps1；确认本轮检查后运行 install-start-menu.ps1 和 package.ps1。输出 artifacts/FeishuRouteManager-Source.zip、FeishuRouteManager-Windows.zip 与 source-manifest.json。源码 ZIP 包含构建脚本、补丁、文档，不含 node_modules 或 bin/obj；运行 ZIP 包含完整 app，不能只拷 EXE。

不覆盖活动 app 的构建可用 build.ps1 -OutputDirectory artifacts/<目录>；发布时仍须按上述备份步骤。自动路由首次部署需要四个 helper 和活动 Lark 门禁补丁，不能只换 WPF，见 [[deployment-reference]]。

当前打包默认 framework-dependent，目标机需要 .NET 8 Desktop Runtime。图标脚本为 tools/create-app-icon.ps1；修改矢量后重新生成 ICO，再构建嵌入 EXE。

## AI 文档维护与故障排查

代码为实现事实，设计为意图，module 为当前知识，pending record 为最新变化。行为变化立即改设计；实现后 new record，给实际 files、module、doc_impact、验证证据；沉淀后 fold <module> <record> --mark-synced。最后 map、tokens --update、validate、sync。不手改 MAP/CLAUDE/Cursor rules。

SDK/引用包拒绝访问是执行环境沙箱问题，优先使用获得授权的本机命令；不要改 global.json 来绕过。UTF-8 必须同时设置标准输入输出错误流，中文 JSON 编码错误曾导致额度解析失败。Windows 任务 Running 不等于飞书已连接。凭据错误从脱敏日志排查，禁止把密钥全文贴入文档。

本机运行路径与恢复见 [[deployment-reference]]；完整模块入口见 [[map]]、[[routing-runtime]]、[[delivery-tooling]]。
