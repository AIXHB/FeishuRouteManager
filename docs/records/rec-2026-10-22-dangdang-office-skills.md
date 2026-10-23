---
id: rec-2026-10-22-dangdang-office-skills
type: record
layer: 4
status: active
summary: "为当当配置隔离的日常办公、财务管理与办公表格技能"
load_when: ["当当", "办公", "财务", "对账"]
globs: []
related: [bot-skills, product-design]
depends_on: []
last_updated: 2026-10-22
token_est: 381
module: bot-skills
change_type: feat
date: 2026-10-22
files: [skill-packages/dangdang, RouterManager.Tests/dangdang_skills_test.py]
doc_impact: [bot-skills]
sync_status: synced
---

# 当当办公与财务技能

用户授权为当当配置日常办公和财务管理相关 skill，并参考飞书自带豆包机器人。查看 skills.sh、飞书官方产品与智能伙伴手册，以及 Anthropic 表格技能来源；选择自编三个独立包，避免依赖其他产品特有工具。来源链接和能力边界见 daily-office/references/capabilities.md。

源包 skill-packages/dangdang 包含 daily-office（会议/待办/周报/沟通草稿）、finance-management（收支/报销/对账/账龄/预算/现金流）和 office-spreadsheets（Excel/CSV 与可编辑文件）。金额使用 Decimal，分币种汇总并拒绝非法行/重复 ID；无真实财务数据，模板仅表头。文件生成检测现有 Python/openpyxl/docx/pypdf，安装不增加线上权限；外发、支付、正式账簿或审批提交遵循用户具体动作授权。

通过 skill-creator quick_validate 验证三个包；PyYAML 仅临时放 artifacts/skill-validation，未全局安装。6 组纯模拟财务测试通过，临时 BotSkills.Install 验证三个完整目录可安装且其他 App ID 为空。

原有 test.ps1 回归通过：31 项 C# 检查、17 项 Node 测试。未修改 C#/WPF 发布代码，不需要替换控制台 app；新增 Python 脚本已单独执行测试。

重新发现三台真实机器人并通过 assertIdle。仅停止当当，调用发布版 RouterManager.Core.BotSkills.Install 安装三个副本至其 App ID 目录，逐文件核验 SHA256 后恢复其原计划任务。config.json 安装前后哈希一致，保护清单中各 route 和其他机器人技能文件均未改变。恢复后当当心跳 running、PID 18016 存活；路飞 PID 25996 和娟娟 PID 14808 保持原进程。启动时遇到旧锁占用，按现有 supervisor 重试恢复，未手工删锁。

运行目录协议只列出当当这三个包，另两台目录为空；保留 default 模型和原会话。未发送飞书消息、未进行真实模型或真实财务操作，也未开通飞书文档/日历/审批工具。安装证据 artifacts/dangdang-skills-result.json 仅包含文件哈希和技能标识，不含配置正文或凭据。
