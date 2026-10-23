---
id: rec-2026-10-22-install-restart
type: record
layer: 4
status: active
summary: "用户授权部署控制台/桥接补丁并重启三机器人，修正 pi 在线状态显示"
load_when: ["安装重启", "生产部署"]
globs: []
related: [deployment-reference, context]
depends_on: []
last_updated: 2026-10-22
token_est: 398
module: delivery-tooling
change_type: fix
date: 2026-10-22
files: [RouterManager.App/RouterBackend.cs, docs/CONTEXT.md, integrations/README.md]
doc_impact: [delivery-tooling, discovery-core, chat-commands, bot-skills]
sync_status: synced
---

# 安装与重启

用户明确授权“安装重启一下”。核对三个现有 route、任务、实际依赖路径，确认无活动桥接进程和未完成任务。关闭控制台，备份 app 和本轮将改写的代码文件，执行 build.ps1 发布并更新开始菜单。只更新活动 Lark dist/cli.js、pi 五个已修改分发文件及两个新增 skill 目录模块、AppData tools 中 manager/lifecycle；不整包覆盖 pi 本地定制包，不替换凭据、工作目录或历史会话。

备份为 artifacts/deployment-20261022-084722，含旧 app、旧代码、patches.json 和只含哈希的配置保护清单；不含真实配置正文或加密凭据。部署后 10 个目标文件与源哈希一致，pi 独立运行包的 skill 模块也核对一致。三个 route.json 哈希未变；config.json 在桥接启动后发生写回（时间及启动规范化代码路径支持此判断），未用任何旧配置整体覆盖，最终模型/后端/App ID 核对保持。原生 pi 源配置未编辑。

启动三台原有托管任务，旧来源任务保持禁用，未新建机器人或切换后端。Lark 初始遭遇残余锁/瞬时锁元数据冲突，未手动删除锁；supervisor 自动重试后恢复，当当于 08:48:04 左右、路飞于 08:48:40 左右建立新桥接，娟娟 08:47:34 左右已连接。

真实只读探针暴露 pi 已在线但 UI 借用同名 Lark profile 的离线状态；RouterBackend 修正为使用新鲜托管 running 心跳及 PID 判定 pi 连接。重新 build.ps1 只替换控制台，不重启后台机器人。computer-use 确认实际窗口的“3 个机器人 / 3 个运行中”、三项“已连接”及“专属 Skills”按钮。最终只读探针：当当/Codex PID 15852/default，娟娟/pi PID 14808/default，路飞/Codex PID 25996/gpt-6.1-sol；全部 Busy=false、Connection=已连接。没有发送飞书消息或真实模型推理测试，也没有代用户安装示例 skill。

模块状态已沉淀到 [[context]]、[[chat-commands]]、[[discovery-core]]，安装管理细节见 [[bot-skills]]。外部活动 Lark 源码仍是部署前工作副本，工程 E 盘快照才是本轮构建源码，不能从外部旧 src 重建覆盖新 dist。
