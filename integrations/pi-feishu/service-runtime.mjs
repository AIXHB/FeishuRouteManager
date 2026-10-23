import net from 'node:net';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {routeConversation} from './node_modules/pi-remote-feishu/dist/bridge/conversation-router.js';
const root = fileURLToPath(new URL('.', import.meta.url));
export async function acquireBridgeLock({reportPid = true} = {}) {
    const key = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,24);
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\pi-feishu-${key}` : `\0pi-feishu-${key}`;
    const server = net.createServer(socket => socket.end());
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(endpoint,resolve);});
    server.unref();
    if (reportPid) writeFileSync(new URL('./bridge.pid',import.meta.url), `${process.pid}\n`);
    console.log(JSON.stringify({time:new Date().toISOString(),event:'bridge_started',pid:process.pid}));
    return server;
}
export async function handleTrackedMessage(options, handle) {
    const {message,channel,config} = options;
    const log = (event,extra={}) => console.log(JSON.stringify({time:new Date().toISOString(),pid:process.pid,event,messageId:message.messageId,...extra}));
    log('message_start');
    let timer;
    try {
    const route = routeConversation(config,message);
    timer = route.accepted ? setTimeout(() => {
        const host = options.manager.getActiveHost(route.sessionKey);
        const active = host?.activeRun;
        const status = active?.messageId === message.messageId
            ? `正在执行当前任务，已用时 ${Math.floor((Date.now()-active.startedAt.getTime())/1000)} 秒。可发送 /stop 中止。`
            : active ? `正在等待前一条任务结束，前一条已执行 ${Math.floor((Date.now()-active.startedAt.getTime())/1000)} 秒。可发送 /stop 中止前一条。`
            : '消息已收到，正在准备会话或等待服务响应。';
        channel.sendText(message.chatId,status,{replyTo:message.messageId})
            .catch(error => log('ack_failed',{error:String(error)}));
    },15000) : undefined;
    timer?.unref();
    await handle(options); log('message_done'); }
    catch(error) {
        log('message_failed',{error:String(error)});
        try {
            await channel.sendText(message.chatId,'处理失败，请稍后重试。若问题持续，请联系管理员并提供消息 ID：'+message.messageId,{replyTo:message.messageId});
            log('failure_reply_sent');
        } catch(replyError) { log('failure_reply_failed',{error:String(replyError)}); }
    } finally {clearTimeout(timer);}
}
