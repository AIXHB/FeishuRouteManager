export const DEFAULT_BASH_SECONDS = 60;
export const MAX_BASH_SECONDS = 300;

export function boundedTimeout(value) {
    if (value === undefined) return DEFAULT_BASH_SECONDS;
    if (!Number.isFinite(value) || value <= 0) throw new Error('timeout must be positive seconds');
    return Math.min(value, MAX_BASH_SECONDS);
}

export function checkSearchScope(command) {
    // Catch common accidental whole-machine searches; this is a workflow guard, not a security boundary.
    if (/\bfind\s+(?:-[A-Za-z]+\s+)*["']?(?:\/(?:[a-z]\/?)?|[a-z]:[\\/])["']?(?=\s|$)/i.test(command)) {
        throw new Error('请限定搜索到项目目录，禁止从根目录或整盘执行 find。ComfyUI 优先查 E:/AIDesign/ComfyPipeline/out 和 http://127.0.0.1:8191/history。');
    }
}

export const WORKFLOW_GUIDANCE = `
本地工作流约定：
- Bash 默认 60 秒，显式 timeout 最长 300 秒；超时后先缩小范围或诊断，不重复原命令无限重试。
- 查询文件先使用已知目录；禁止 find /、find /c 或整盘扫描。
- 当前 ComfyUI 服务为 http://127.0.0.1:8191；项目目录 E:/AIDesign/ComfyPipeline，产物在 out，实际模型输出在 out/minimax_h3/r9700_720p。
- 用户索要最新视频时，先查 out/h3_ningchuan_middle6_quality_v4、项目 jobs.json 或 /history，确认成片后使用 send_file_to_chat。不要重新生成视频。
- 已知路径失效时先查服务与进程，再限定目录搜索。上传失败最多重试一次，仍失败则报告实际错误。
- 长视频生成只提交一次，保存任务 ID；用短请求查询状态，不用长时间 sleep 占住会话。
`;
