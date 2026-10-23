---
id: rec-2026-10-21-engineering-migration
type: record
layer: 4
status: active
summary: "工程迁移到 E 盘并建立后续 AI 接入文档和交付脚本"
load_when: []
globs: []
related: [product-design, architecture-design]
depends_on: []
last_updated: 2026-10-21
token_est: 261
module: delivery-tooling
change_type: docs
date: 2026-10-21
files: [.gitignore, test.ps1, setup-dependencies.ps1, package.ps1, install-start-menu.ps1, tools/create-app-icon.ps1, AGENTS.md, README.md]
doc_impact: [delivery-tooling]
sync_status: synced
---

# 工程迁移与交接

工程、发布物和受控集成代码快照迁往 E:/AIDesign/AIRGC/FeishuRouteManager；不迁移凭据、会话和用户工作目录。增加开发/设计/模块/运维文档、依赖准备、快捷方式和源码/运行包脚本。图标生成脚本改为项目相对路径；test.ps1 默认使用随工程桥接快照。

本轮行为意图和实现知识已写入 [[context]]、[[product-design]]、[[architecture-design]]、[[delivery-tooling]]、[[development-guide]]、[[deployment-reference]]。迁移后的实际验证结果以根 TEST-RESULTS.md 和 artifacts 中报告为准，不以复制前旧记录代替。

新增/删除事务此前已通过 22 C# + 14 Node 检查和 WPF/Windows task 烟雾验证。本次已从 E 盘独立安装随工程桥接运行依赖、重新 restore/publish，并通过 22 项 C# 检查和 14 项 Node 测试（零跳过）；新路径 WPF 探针正常，三个机器人已连接，额度开关仍关闭。设计与模块已沉淀，可 fold 标记 synced。
