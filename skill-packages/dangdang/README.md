# 当当办公与财务技能源包

2026-10-22 按用户要求为当当定制。三个子目录分别是可单独安装的 skill，README 不随任何一个 skill 安装。

| skill | 用途 |
|---|---|
| daily-office | 会议、待办、日报周报、项目跟进及沟通草稿 |
| finance-management | 收支、报销、对账、应收应付、预算与现金流 |
| office-spreadsheets | Excel/CSV 清洗分析及可编辑文件交付 |

参考飞书官方豆包工作产品的任务与成果交付流程（链接见 daily-office/references/capabilities.md）；均为本项目编写，没有复制第三方技能实现，不包含官方豆包服务或凭据。检索过 skills.sh 及 Anthropic 表格技能，本包选择与本机已有 Python 库配合的简洁流程，不依赖其他产品专用工具。

finance-management 的 Python 脚本只需标准库；其他流程按需发现本机已有 openpyxl、python-docx、pypdf。没有系统 Python 时可以使用现存 Codex 缓存运行时，缓存迁移需重新发现。验证命令：`<Python> -B RouterManager.Tests/dangdang_skills_test.py`。

安装：控制台选中目标 → 停止目标机器人 → 专属 Skills → 逐个选择以上单个子目录 → 恢复启动。当前源包可包含在源码中；真实安装副本、财务原件、输出和机器人配置不得加入工程或打包。这里只保存无数据的 CSV 表头模板及通用代码。安装不自动开通飞书文档、日历或审批权限。
