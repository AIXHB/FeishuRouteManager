import { type PartialFeishuConfig } from "./schema.js";
import type { FeishuConfig } from "../types.js";
/**
 * 配置加载入口。
 * 配置来源及优先级（低 -> 高）：
 *   环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET / ... < 配置文件 < CLI 参数
 */
/** loadConfig 的选项：可直接传部分配置字段覆盖，外加 configPath / cwd */
export interface LoadConfigOptions extends PartialFeishuConfig {
    configPath?: string;
    cwd?: string;
}
/** 对外暴露"配置文件在哪儿"，供 doctor 命令展示 */
export declare function resolveConfigFilePath(cwd: string, explicitPath?: string): string | undefined;
/**
 * 加载并归一化完整配置。
 * 合并顺序：envConfig（最低）-> fileConfig -> cliConfig（最高）。
 */
export declare function loadConfig(options?: LoadConfigOptions): FeishuConfig;
