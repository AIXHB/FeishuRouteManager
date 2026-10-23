import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defaultUserConfigPath, mergeConfig, normalizeConfig, parsePartialConfig } from "./schema.js";
/** 读取并解析一个配置文件（JSON） */
function readConfigFile(path) {
    const raw = readFileSync(path, "utf-8");
    return parsePartialConfig(JSON.parse(raw));
}
/**
 * 定位配置文件：
 * - 显式指定 configPath 时用显式路径
 * - 否则优先找项目级 .pi/feishu.json，其次用户级 ~/.pi/agent/feishu.json
 * - 都没有则返回 undefined（只用环境变量 + CLI 参数）
 */
function findConfigFile(cwd, explicitPath) {
    if (explicitPath)
        return resolve(explicitPath);
    const projectPath = join(cwd, ".pi", "feishu.json");
    if (existsSync(projectPath))
        return projectPath;
    const userPath = defaultUserConfigPath();
    if (existsSync(userPath))
        return userPath;
    return undefined;
}
/** 对外暴露"配置文件在哪儿"，供 doctor 命令展示 */
export function resolveConfigFilePath(cwd, explicitPath) {
    return findConfigFile(resolve(cwd), explicitPath);
}
/** 从环境变量读取配置（FEISHU_APP_ID 等） */
function envConfig() {
    return parsePartialConfig({
        appId: process.env.FEISHU_APP_ID,
        appSecret: process.env.FEISHU_APP_SECRET,
        botName: process.env.FEISHU_BOT_NAME,
        encryptKey: process.env.FEISHU_ENCRYPT_KEY,
        verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    });
}
/**
 * 加载并归一化完整配置。
 * 合并顺序：envConfig（最低）-> fileConfig -> cliConfig（最高）。
 */
export function loadConfig(options = {}) {
    const cwd = resolve(options.cwd ?? process.cwd());
    const configPath = findConfigFile(cwd, options.configPath);
    const fileConfig = configPath ? readConfigFile(configPath) : {};
    const cliConfig = parsePartialConfig(options);
    return normalizeConfig(mergeConfig(envConfig(), fileConfig, cliConfig), cwd);
}
//# sourceMappingURL=load-config.js.map