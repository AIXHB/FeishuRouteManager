import {writeFileSync, renameSync} from 'node:fs';

export function needsRecovery(state, unhealthySince, now) {
    return state !== 'connected' && now - unhealthySince >= 180000;
}

export function monitorConnection(raw, reportPath) {
    let unhealthySince;
    let lastState;
    const sample = () => {
        const now = Date.now();
        const status = raw.getConnectionStatus();
        const state = status?.state ?? 'unknown';
        if (state === 'connected') unhealthySince = undefined;
        else unhealthySince ??= now;
        if (state !== lastState) {
            console.error(JSON.stringify({time:new Date(now).toISOString(),event:'connection_state',...status,state}));
            lastState = state;
        }
        if (reportPath) {
            try {
                writeFileSync(reportPath+'.tmp', JSON.stringify({time:new Date(now).toISOString(),pid:process.pid,state,unhealthySince}));
                renameSync(reportPath+'.tmp', reportPath);
            } catch (error) {
                console.error(JSON.stringify({event:'health_write_error',error:error.message}));
            }
        }
        if (unhealthySince !== undefined && needsRecovery(state, unhealthySince, now)) {
            console.error(JSON.stringify({time:new Date(now).toISOString(),event:'connection_recovery_exit',state,code:75}));
            process.exit(75);
        }
    };
    sample();
    const timer = setInterval(sample, 15000);
    timer.unref();
    return () => clearInterval(timer);
}
