---
id: chat-commands
type: module
layer: 3
status: active
summary: "飞书聊天命令、远程模型选择与桥接补丁边界"
load_when: ["飞书指令", "聊天命令", /model, /help, "云端切换"]
globs: ["integrations/lark-channel-bridge/src/commands/**", integrations/lark-channel-bridge/src/config/config-ops.ts, integrations/lark-channel-bridge/src/card/templates.ts, "integrations/lark-channel-bridge/tests/integration/commands/**", integrations/pi-feishu/chat-commands.test.mjs, "integrations/pi-feishu/patched-package/dist/bridge/message-*.js", integrations/pi-feishu/patched-package/dist/cards/help.js, integrations/pi-feishu/patched-package/dist/types.d.ts]
related: [product-design, architecture-design, desktop-ui, routing-runtime, deployment-reference]
depends_on: []
last_updated: 2026-10-23
token_est: 780
module: chat-commands
implements: []
public_api: [tryHandleCommand, saveModelConfig, handleFeishuMessage]
tests: [integrations/lark-channel-bridge/tests/integration/commands/commands-v1.test.ts, integrations/pi-feishu/chat-commands.test.mjs]
key_files: [integrations/lark-channel-bridge/src/commands/index.ts, integrations/lark-channel-bridge/src/config/config-ops.ts, integrations/lark-channel-bridge/src/card/templates.ts, integrations/pi-feishu/patched-package/dist/bridge/message-handler.js, integrations/pi-feishu/patched-package/dist/bridge/message-normalizer.js]
---

# 飞书聊天指令

2026-10-23 指令扩充：Lark /sessions [N] 复用 /resume 的处理器和私聊历史边界；/cancel 复用 /stop（包括指定 scope 的管理员检查）；/pwd 只读查询当前 scope 目录并回退 profile 默认目录，要求管理员。pi /cancel 复用当前会话 abort；/pwd 只读取当前 sessionKey 映射的 cwd，缺失时回退已解析的默认目录，不初始化 Agent 或处理附件。pi 类型声明同步新增命令。帮助卡片补充分类、示例及模型/会话/桌面控制台的作用范围。已按用户授权于当天部署 Lark dist 及 pi 四项分发文件，三台机器人重启恢复连接，任务侧代码与 pi 私有包哈希核验通过；见 [[rec-2026-10-23-chat-command-deploy]]。

消息经原有用户/群聊/@策略校验后，由桥接处理命令。/help 显示帮助；/model 和 /models 在两个桥接都有效。未知的英文字母命令回复 /help 提示，不进入模型推理；含路径分隔符的文本仍按普通消息处理。

Lark（Codex/Antigravity/Claude）/model 无参数显示当前模型、参考列表及作用域；/model <ID> 保存当前机器人所有聊天的下一条任务模型，default 表示后端默认。管理员门禁、全机器人忙碌检查（包括预约任务）、pauseNewRuns 防止模型写入期间新任务进入。模型合法性沿用 resolveModelArg；Codex/Antigravity 支持合法手工 ID，实际可用性取决于账号。saveModelConfig 在配置锁内重读原始 JSON，核对 App ID 和 Agent，仅修改目标 preferences.model，原子保存后更新内存；保留未知字段、其他 profile、权限和凭据。失败不更新内存。

pi 的 /model、/models 无参数打开现有模型/思考等级卡片；/model provider/model 仅切换当前会话已认证可用模型，拒绝生成中或排队中的会话。命令在附件和普通生成流程前处理；/help、未知指令无需初始化 Agent。不调用推理验证，不主动压缩历史。pi 的工具权限、会话隔离和已有卡片回调维持原约定。

桌面管理器读取 Lark profile 的实际模型（优先于旧 route.json），无未保存编辑时刷新模型输入；pi 的会话级模型不冒充全机器人默认值。

模型设置使用 normalizeModelSelection 的统一合法性规则，Codex/Antigravity 不再被旧静态清单截断。modelOptions 为当前合法自定义 ID 追加显示项，确保飞书 select_static 的 initial_option 可匹配；/config 和网页设置未提交模型时保留当前自定义值。原 supportedModels 只是参考列表，不宣称账号支持其中模型。

savePreferencesConfig 的 v2 写入合并原始 JSON，保留目标和其他 profile 的未知字段；内存仍使用规范化的配置对象，写盘成功才刷新。

验证：桥接目录执行 node_modules/.bin/vitest run tests/integration/commands tests/unit/agent/models.test.ts、tsc --noEmit、vite build web、tsup；pi 目录安装锁定依赖后 node --test chat-commands.test.mjs，测试直接导入 patched-package。主工程仍跑 test.ps1。测试全部用模拟通道/临时配置，不发送飞书消息。

integrations 是工程快照；2026-10-22 已按用户“安装重启”授权将构建后的 Lark dist 及 pi 修改文件安装到实际运行路径并重启三台机器人，连接核验通过。之后部署仍须按 [[deployment-reference]] 备份活动桥接、核对版本、等待空闲并逐机器人应用，不能把快照构建成功当作线上生效。
