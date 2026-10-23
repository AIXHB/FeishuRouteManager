---
id: architecture-design
type: design
layer: 3
status: active
summary: "桌面控制面与后台服务的数据边界及事务设计"
load_when: ["架构", "事务", "进程", "安全", "回滚"]
globs: []
related: []
depends_on: []
last_updated: 2026-10-22
token_est: 708
design_type: technical
modules: [desktop-ui, routing-runtime, discovery-core, agent-observability, delivery-tooling, chat-commands, bot-skills]
acceptance: ["服务寿命独立于窗口", "凭据不写入路由清单", "失败只回滚目标机器人", "源码包可重新构建且不携带用户状态"]
decisions: [adr-local-service-boundaries]
---

# 技术设计

## 分层与数据流

~~~mermaid
flowchart LR
  UI[WPF 界面] --> BE[RouterBackend 协调]
  BE --> CORE[Core 发现/日志/设置]
  BE --> NODE[Node 事务辅助器]
  NODE --> CFG[profile 与加密凭据引用]
  NODE --> TASK[Windows 计划任务]
  TASK --> SERVE[隐藏 supervisor]
  SERVE --> BRIDGE[Lark Bridge 或独立 pi 包]
  BRIDGE --> AGENT[Codex / Antigravity / pi]
  BRIDGE <--> FEISHU[飞书长连接]
~~~

界面只管理状态与显式用户操作。Windows 计划任务启动 Node supervisor，服务不依赖 WPF 进程。Core 结合任务、日志、注册表和真实 PID 判断状态；任务为 Running 不足以证明桥接上线。

## 身份与持久化

专属 skill 使用 ManagerRoot/bots/<App ID>/skills 独立副本；安装 staging 发布与卸载归档均以单机器人锁保护。桌面操作要求目标服务停止，不改全局 skill、认证或历史会话。各后端在每次任务构建时读取当前 App ID 的目录提示并要求按需读取 SKILL.md，不因工作目录相同共享安装。边界和实现见 [[bot-skills]]。

App ID 是机器人身份键，profile 是桥接配置标签。Lark config 存多个 profile；管理器 route.json 保存映射、来源、目标和任务信息，不含 Secret。原生 pi 入口通过安装根目录配置发现；被接管后每机器人有独立 pi 包根、Agent 目录、文件缓存与会话映射，依赖可共享。

新增先在独立 channelHome 中调用原桥接配置流程，验证并加密凭据，再带配置锁把新 profile 和它的加密文件合并到真实根。此设计防止原 CLI 全文件规范化意外改写其他 profile/未知字段。密钥派生依赖本机/用户与盐，工程 ZIP 不能作为凭据迁移包。

## 操作事务

路由切换：验证输入/忙碌→备份→准备 profile→停止旧入口→加锁更新目标→写清单→等待退出→注册独立任务→验证真实桥接连接。失败停止新任务、恢复该 profile/旧清单、恢复旧服务。不要在事务恢复中杀死 helper。

新增：输入及唯一性校验→隔离凭据构建→合并目标 profile→配置目标/权限→写清单→注册任务（可只保存）→可选上线验证。失败清理新增任务和 profile，其他机器人不变。

删除：重新读取对象和忙碌状态→导出任务/配置→停止对应入口→移除目标 profile、原生 pi 活动配置和清单→注销任务。失败只恢复所改目标文件与任务状态。原生 pi 来源已被其他机器人复用时，不删除那台机器人的任务。

配置文件锁保证单次 JSON 更新；UI SemaphoreSlim 串行用户操作，lifecycle.lock 协调生命周期 helper。尚不存在涵盖所有外部程序操作的全局事务锁；外部同时手动编辑配置仍需避免。备份用于恢复证据，不能盲目整体覆盖正在更新的根配置。

## 查询与安全边界

健康状态属于观测数据，其瞬时写入失败不能中断真实服务；保留旧快照、下一心跳重试并记录失败/恢复。配置更新仍必须严格失败并回滚。Windows 文件占用可能拒绝原子替换，不能把异步定时器里的未捕获 I/O 异常留给进程退出机制。

每机器人自动路由是独立显式开关，默认关闭。它在后台 supervisor 中按失败事件触发真实额度查询，不依赖窗口内额度轮询总开关；恢复时间与通知状态独立持久化。自动 Codex → pi 仍走原 apply 回滚事务，额外以单机器人 route-operation 锁协调手动路由、服务和删除，以带过期时间的接单门禁消除检查忙碌后继续进入新任务的窗口。不同后端不自动重放请求或复用会话，额度恢复仅提醒用户。实现见 [[auto-routing]]。

飞书聊天模型指令由桥接在访问控制后、普通推理前处理。Lark 的模型修改锁内合并目标字段，核对身份，写盘成功才刷新内存；不重启服务或复用其他后端会话。pi 只修改当前会话的已配置模型。桌面发现优先读取 Lark 的实际模型，保留用户未保存的编辑。实现和快照部署边界见 [[chat-commands]]。

子进程全部用 UTF-8 stdin/stdout JSON，CreateNoWindow 或隐藏窗口启动。只允许模型/额度查询方法，无推理费用调用；每次有超时/取消处理。实时日志先截尾再脱敏，审计只记录必要摘要。模板/密码框不展示旧 Secret。

## 交付与可扩展点

源码、集成快照和文档随工程移动；运行数据与用户安装独立。增加 Agent 应同时扩展发现/模型/额度适配、路由校验、启动与回滚，再更新产品验收，不能只给 UI 多加一项。专属 skill 管理契约见 [[bot-skills]]，当前不包含在线编辑或远程仓库安装。

实现入口见 [[routing-runtime]]、[[discovery-core]]、[[agent-observability]]、[[desktop-ui]]，交付见 [[delivery-tooling]]；决策见 [[adr-local-service-boundaries]]。
