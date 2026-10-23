/**
 * 提示词队列：保证"同一会话"内的多条飞书消息串行处理，
 * 避免并发调用导致 Pi 会话状态错乱。
 *
 * 实现思路：维护一个 promise 链 tail，每次入队都把任务挂到链尾，
 * 前一个任务完成后才会执行下一个。depth 用于观察当前排队深度。
 */
export declare class PromptQueue {
    /** 队尾 promise：前一个任务结束时 resolve，唤醒下一个任务 */
    private tail;
    /** 当前排队/执行中的任务数 */
    private depthValue;
    /** 当前队列深度（含正在执行的那个） */
    get depth(): number;
    /**
     * 入队执行一个任务。
     * 返回任务本身的返回值；多个任务之间严格串行。
     */
    enqueue<T>(run: () => Promise<T>): Promise<T>;
}
