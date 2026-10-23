import type { FeishuRunContext } from "../types.js";
/** 读取当前调用链中的飞书上下文；不在飞书请求中则返回 undefined */
export declare function getFeishuContext(): FeishuRunContext | undefined;
/** 在指定上下文里执行 run()，整个 run 及其子异步调用都能读到该上下文 */
export declare function runWithFeishuContext<T>(context: FeishuRunContext, run: () => Promise<T>): Promise<T>;
