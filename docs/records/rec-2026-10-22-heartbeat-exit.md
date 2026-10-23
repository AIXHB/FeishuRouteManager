---
id: rec-2026-10-22-heartbeat-exit
type: record
layer: 4
status: active
summary: "修复 Windows 心跳替换占用导致守护退出，并补实际任务侧版本核验"
load_when: ["全部暂停", "自动退出", "心跳", EPERM]
globs: []
related: [routing-runtime, deployment-reference, architecture-design]
depends_on: []
last_updated: 2026-10-22
token_est: 582
module: routing-runtime
change_type: fix
date: 2026-10-22
files: [RouterManager.App/Assets/manager.mjs, RouterManager.Tests/routes.test.mjs, docs/modules/routing-runtime.md, docs/designs/architecture-design.md, docs/ref/development-guide.md, docs/ref/deployment-reference.md]
doc_impact: [routing-runtime, delivery-tooling]
sync_status: synced
---

# 全部暂停的排查与修复

用户报告三台全部暂停并要求修复后启动。实际任务为 Ready、LastTaskResult=1、旧桥接 PID 已不存在，各自动路由策略关闭；没有窗口状态误判或额度切换证据。多次历史停机均留下 health.json.<supervisor PID>.tmp，时间恰为最后成功心跳后两秒，指向每两秒心跳发布的 rename 失败。任务无执行超时、允许电池运行，故不是这些策略主动停止。

用临时文件的 Windows FileShare.ReadWrite（不含 Delete）复现原子替换：fs.renameSync 报 EPERM、Node 退出码 1，与现场残留相符。原 setInterval(sample) 无异常捕获，异常绕过最外层 await serve 的 catch，bootstrap 没有记录；wscript 随 Node 退出结束，桥接也退出。未确定历史占用文件的具体程序。

createHealthWriter 只容错健康快照：失败保留旧快照并在下一轮重试，失败日志限频 30 秒，恢复仅记录一次，诊断日志写失败也不终止服务。配置原子写入仍严格失败/回滚。新增 supervisorPid 供实际版本和进程验证，uncaughtExceptionMonitor 记录其他未捕获异常。两项回归覆盖占用、持续失败限频、日志盘不可写、恢复。

第一阶段常规命令部署后，实际任务心跳仍缺 supervisorPid；对旧服务做文件占用复现时三台再次退出，证明未加载修复。进一步由 WMI 系统进程读取同一路径发现：工程和 app/Assets 是新哈希，但任务侧 C 盘 manager 为旧哈希 ad9ae6...，且 lifecycle/auto-route/agent-data 三文件缺失，命令部署环境的文件视图核验不足。此前 [[rec-2026-10-22-deploy-all]] 的文件核对不能作为实际任务侧已加载的证明。

经用户本次修复/启动授权，从 WMI 系统上下文备份真实代码并复制工程四个 helper 和已测试 Lark cli.js；系统侧核对 manager 为 e9b8d8...，新任务心跳明确出现 supervisorPid。未复制/覆盖配置、凭据、会话或工作目录，系统侧确认当当四项技能仍在。真实备份与核验结果见 artifacts/system-side-deployment-result.json；常规发布备份为 artifacts/deployment-all-20261022-114420。

观察还发现 pi 短暂重连触发过早回收：旧代码按进程 born 时间判断 90 秒，在线超过该时长后第一次连接状态波动即 kill。改为 connectionRecovery 跟踪连续断线时间，成功连接立即清零；增加正常运行、瞬时断线、90 秒阈值、恢复重置回归。后续最终发布目录 artifacts/heartbeat-final-20261022-115554，系统侧再次核对最终 helper 哈希后启动。

test.ps1 通过 31 项 C# 与 38 项 Node 检查，build.ps1 成功。新进程对三台同时持有 8 秒只读心跳句柄，三台桥接/守护均存活；释放后恢复心跳。持续观察结果记录在 artifacts/heartbeat-fix-live-result.json。未发送飞书测试消息、未运行真实模型任务。

最终占用验证及随后 90 秒三轮观察全部通过，期间守护 PID 和桥接 PID 保持不变。11:58（北京时间）路飞桥接/守护为 26668/15588、娟娟 9396/29280、当当 27864/20192，均 running、计划任务 Running。bootstrap 日志明确记录本轮 EPERM 后 recovered；真实 WPF 探针三台已连接、Busy=false，原模型保持。至此修复与全部启动完成。
