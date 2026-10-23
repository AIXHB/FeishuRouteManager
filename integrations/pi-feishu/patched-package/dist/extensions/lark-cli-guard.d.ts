/** 检测本机是否安装了 lark-cli（运行 `lark-cli --version`） */
export declare function isLarkCliInstalled(): boolean;
/**
 * 判断一条 bash 命令是否需要被拦截：
 * 仅当它调用 lark-cli im 且包含被禁动作时才拦截。
 * 动作匹配使用 +action 或 action 两种写法均可（正则做了转义）。
 */
export declare function isBlockedLarkImCommand(command: string): boolean;
/** 系统提示词护栏：检测到 lark-cli 时注入（允许文档/只读 IM，禁止 IM 写/收） */
export declare const FEISHU_CLI_PROMPT_GUARD = "\n## Feishu CLI Boundary\n\nThis session may expose Lark CLI skills for Feishu documents and read-only IM inspection.\n\n- Use lark-doc-cli for Feishu document tasks such as fetching, creating, updating, and inserting media into docs.\n- Use lark-im-readonly only for read-only IM tasks such as looking up chats, listing members, searching existing messages, or downloading message resources.\n- Do not use lark-cli IM commands to send, reply, forward, delete, update, receive, or listen for messages.\n- In a Feishu-triggered run, the pi-remote-feishu transport is the only normal reply channel back to the current chat.\n- To return generated local files to the current Feishu chat, use send_file_to_chat instead of manually sending IM messages with lark-cli.\n";
/** 系统提示词护栏：未检测到 lark-cli 时注入 */
export declare const FEISHU_NO_CLI_PROMPT_GUARD = "\n## Feishu CLI Boundary\n\nThe lark-cli executable was not detected when pi-remote-feishu loaded.\n\n- Do not attempt to use lark-cli commands unless the user installs and authenticates lark-cli, then reloads Pi.\n- Use pi-remote-feishu transport features for the current Feishu chat.\n- To return generated local files to the current Feishu chat, use send_file_to_chat.\n- If the user asks to read or edit a Feishu document and no SDK document tool is available yet, ask for the document link or token and explain that SDK document tooling is not implemented in this extension version.\n";
