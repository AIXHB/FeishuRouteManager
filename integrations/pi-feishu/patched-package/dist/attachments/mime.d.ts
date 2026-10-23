/**
 * 附件 MIME 类型推断工具。
 */
/** 根据文件名后缀推断 MIME 类型；未知扩展名返回通用二进制类型 */
export declare function inferMimeType(fileName: string): string;
/**
 * 粗略判断一段 Buffer 是否像文本：
 * 前 4KB 里只要出现字节 0（NUL），就认为不是文本。
 * 用于决定小文件是内联内容还是落盘保存。
 */
export declare function isLikelyText(buffer: Buffer): boolean;
