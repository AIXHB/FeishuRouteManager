/**
 * 附件临时文件管理：
 * 每个会话一个子目录（目录名由 sessionKey 清洗而来），
 * 附件下载后写到这里，生成结束后整体清理。
 */
/**
 * 把附件 Buffer 写入会话专属临时目录。
 * 返回写入后的完整文件路径。
 * 文件名会做安全清洗，去掉路径分隔符等危险字符。
 */
export declare function writeTempAttachment(tempDir: string, sessionKey: string, fileName: string, buffer: Buffer): Promise<string>;
/**
 * 清理某个会话的临时附件目录（生成结束/命令处理完后调用）。
 * force: true 表示目录不存在也不报错。
 */
export declare function cleanupTempAttachments(tempDir: string, sessionKey: string): Promise<void>;
