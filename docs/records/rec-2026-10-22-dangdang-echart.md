---
id: rec-2026-10-22-dangdang-echart
type: record
layer: 4
status: active
summary: "按用户 GitHub 链接为当当独立安装 echart-skill 和 Python 核心依赖"
load_when: ["当当", echart, "图表", "数据分析"]
globs: []
related: [bot-skills, deployment-reference]
depends_on: []
last_updated: 2026-10-22
token_est: 427
module: bot-skills
change_type: config
date: 2026-10-22
files: [docs/modules/bot-skills.md]
doc_impact: [bot-skills]
sync_status: synced
---

# 当当安装 Echart Skill

用户指定 https://github.com/lgwanai/echart-skill 安装给当当。skill-installer 下载固定提交 86c8200177f22636c2ac0e7d013b2b0aa77a9282 到 artifacts 临时目录，审阅 SKILL、依赖和执行入口，再使用上游 full 白名单打包（247 文件，约 10.6 MB）并通过其发布校验器；不安装仓库开发规划、测试或用户数据。

在当当 App ID 下的 skill-runtimes/echart-skill 创建独立 Python venv，核心 requirements 仅安装 wheel，不改全局 Python 或其他机器人；版本冻结清单位于 artifacts/echart-runtime-requirements.txt。外部数据库驱动、轮询和本地服务器未配置/启动。新增本机运行说明和 Windows Edge/Chrome 检测兼容，保留上游分析算法与完整交付门禁。

quick_validate 和临时 Core.BotSkills.Install 验证通过；独立环境 pip check 通过。模拟 CSV 导入 DuckDB、审计 SQL 查询返回 30.5 并生成元数据；模拟离线图表通过真实 Edge 浏览器渲染、数据核对及数据表控件检查。没有使用真实业务数据或发送飞书消息。

重新核对当当身份及空闲状态，使用活动版 helper 只停止当当，以发布版 Core.BotSkills.Install 安装私有副本并逐文件核对哈希，恢复原任务。保留原三项办公财务技能，各 route、config 和原有技能文件安装期间哈希保持。未部署自动路由新版本，未更新活动桥接。安装证据和快照仅在 artifacts/echart-install-result.json 与 artifacts/echart-source-commit.txt；真实技能/venv 不进入工程或发布包。

恢复后当当 PID 1120 存活、心跳 running，运行目录列出四项技能，已安装副本再次通过模拟图表浏览器检查。之后复核发现根 config.json 哈希与安装前不同，缺少字段级前置快照，无法把变化确定归因于启动规范化或并发外部编辑；未用旧配置回滚。保护清单中全部 route 与原技能哈希保持，当当当前 gpt-6.1-sol 与其未变的 route 一致，权限仍为 full。不能据此宣称重启前后整份配置未变化。

用户随后明确要求“重启生效一下”。重新确认空闲后，仅通过活动 helper 停止当当、等待旧锁释放并恢复其原计划任务；未部署新代码或操作其他机器人。2026-10-22 09:32（北京时间）核验新 PID 9592 存活、心跳 running、任务 Running，日志显示上线监听；运行技能目录仍包含 echart-skill 及原三项。没有发送测试消息或运行真实模型任务。
