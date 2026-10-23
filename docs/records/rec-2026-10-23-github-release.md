---
id: rec-2026-10-23-github-release
type: record
layer: 4
status: active
summary: "准备 GitHub 首版 v0.3.0，补充下载说明并将发布说明纳入 Windows 包"
load_when: ["GitHub 发布", Release]
globs: []
related: [deployment-reference]
depends_on: []
last_updated: 2026-10-23
token_est: 215
module: delivery-tooling
change_type: config
date: 2026-10-23
files: [package.ps1, README.md, RELEASE-NOTES.md, TEST-RESULTS.md]
doc_impact: [delivery-tooling]
sync_status: synced
---

# GitHub 首版发布准备

用户授权打包发布，指定公开仓库 AIXHB/FeishuRouteManager，检查时仓库为空。使用工程当前版本 v0.3.0，不替换任何已有标签。

独立目录 Release 构建及 31 项 C#、38 项 Node 检查通过。控制台未运行，先备份 app 再同步新构建；仅复制内容不同文件，避免覆盖被 Shell 占用但内容相同的图标。未启停机器人。

README 补充当前功能、运行环境、下载和跨机器集成边界，TEST-RESULTS 追加发布验证；新增 RELEASE-NOTES.md 并纳入 Windows ZIP。发布附件限定两份 ZIP、源码 manifest、SHA256SUMS。发布前校验 ZIP 条目、manifest 哈希和凭据/运行目录排除，再按 manifest 精确添加 Git 源码。发布结果和附件校验值另存 artifacts，不收录用户运行数据。
