import type { FeishuStore, SessionFilter, SessionMapping } from "../types.js";
export declare class JsonFeishuStore implements FeishuStore {
    private readonly filePath;
    /** 写操作队列尾：保证 set/delete 串行执行 */
    private writeTail;
    constructor(filePath: string);
    /** 按 sessionKey 查询映射 */
    getSessionMapping(sessionKey: string): Promise<SessionMapping | undefined>;
    /** 写入（或覆盖）一条映射：已存在则替换，否则追加 */
    setSessionMapping(mapping: SessionMapping): Promise<void>;
    /** 删除一条映射 */
    deleteSessionMapping(sessionKey: string): Promise<void>;
    /** 列出全部映射（支持按 chatId / userId / chatType 过滤） */
    listSessionMappings(filter?: SessionFilter): Promise<SessionMapping[]>;
    /**
     * 写操作互斥锁：
     * 把本次操作挂到 writeTail 链尾，前一个写完成后再执行，
     * 防止并发 set/delete 造成文件内容丢失。
     */
    private withWriteLock;
    /** 读取存储文件；文件不存在或结构非法时按空映射处理 */
    private readStore;
    /** 写存储文件（自动创建目录，美化 JSON 格式） */
    private writeStore;
}
