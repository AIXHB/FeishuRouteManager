import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
/** 判断映射是否满足过滤条件（未指定字段视为不限制） */
function matchesFilter(mapping, filter) {
    if (!filter)
        return true;
    if (filter.chatId !== undefined && mapping.chatId !== filter.chatId)
        return false;
    if (filter.userId !== undefined && mapping.userId !== filter.userId)
        return false;
    if (filter.chatType !== undefined && mapping.chatType !== filter.chatType)
        return false;
    return true;
}
/** 校验读到的数据是否为合法 StoreFile 结构 */
function isStoreFile(value) {
    if (typeof value !== "object" || value === null || !("mappings" in value))
        return false;
    const mappings = value.mappings;
    return Array.isArray(mappings);
}
export class JsonFeishuStore {
    filePath;
    /** 写操作队列尾：保证 set/delete 串行执行 */
    writeTail = Promise.resolve();
    constructor(filePath) {
        this.filePath = filePath;
    }
    /** 按 sessionKey 查询映射 */
    async getSessionMapping(sessionKey) {
        const file = await this.readStore();
        return file.mappings.find((mapping) => mapping.sessionKey === sessionKey);
    }
    /** 写入（或覆盖）一条映射：已存在则替换，否则追加 */
    async setSessionMapping(mapping) {
        await this.withWriteLock(async () => {
            const file = await this.readStore();
            const index = file.mappings.findIndex((entry) => entry.sessionKey === mapping.sessionKey);
            if (index === -1) {
                file.mappings.push(mapping);
            }
            else {
                file.mappings[index] = mapping;
            }
            await this.writeStore(file);
        });
    }
    /** 删除一条映射 */
    async deleteSessionMapping(sessionKey) {
        await this.withWriteLock(async () => {
            const file = await this.readStore();
            await this.writeStore({
                mappings: file.mappings.filter((mapping) => mapping.sessionKey !== sessionKey),
            });
        });
    }
    /** 列出全部映射（支持按 chatId / userId / chatType 过滤） */
    async listSessionMappings(filter) {
        const file = await this.readStore();
        return file.mappings.filter((mapping) => matchesFilter(mapping, filter));
    }
    /**
     * 写操作互斥锁：
     * 把本次操作挂到 writeTail 链尾，前一个写完成后再执行，
     * 防止并发 set/delete 造成文件内容丢失。
     */
    async withWriteLock(run) {
        const previous = this.writeTail;
        let release = () => { };
        this.writeTail = new Promise((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            await run();
        }
        finally {
            release();
        }
    }
    /** 读取存储文件；文件不存在或结构非法时按空映射处理 */
    async readStore() {
        try {
            const raw = await readFile(this.filePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (isStoreFile(parsed)) {
                return { mappings: parsed.mappings };
            }
        }
        catch (error) {
            // 文件不存在：返回空（首次运行时）
            if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return { mappings: [] };
            }
            throw error;
        }
        return { mappings: [] };
    }
    /** 写存储文件（自动创建目录，美化 JSON 格式） */
    async writeStore(file) {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf-8");
    }
}
//# sourceMappingURL=json-store.js.map