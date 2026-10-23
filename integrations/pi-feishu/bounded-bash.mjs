import { spawn, execFile } from 'node:child_process';
import { getShellConfig, getShellEnv } from './node_modules/@earendil-works/pi-coding-agent/dist/utils/shell.js';

export const boundedBashOperations = {
    exec(command, cwd, { onData, signal, timeout, env }) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) return reject(new Error('aborted'));
            const shell = getShellConfig();
            const stdin = shell.commandTransport === 'stdin';
            const child = spawn(shell.shell, stdin ? shell.args : [...shell.args, command], {
                cwd, env: env ?? getShellEnv(), windowsHide: true,
                detached: process.platform !== 'win32', stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
            });
            let reason, timer, fallback, settled = false;
            const finish = (error, code) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer); clearTimeout(fallback);
                signal?.removeEventListener('abort', abort);
                child.stdout?.destroy(); child.stderr?.destroy();
                error || reason ? reject(error ?? new Error(reason)) : resolve({ exitCode: code });
            };
            const killShell = () => {
                if (settled) return;
                try { child.kill('SIGKILL'); } catch (error) { finish(error); }
            };
            const stop = (why) => {
                if (reason || settled) return;
                reason = why;
                if (process.platform === 'win32' && child.pid) {
                    // Check taskkill's result; the upstream backend silently ignores failures.
                    execFile('taskkill.exe', ['/F', '/T', '/PID', String(child.pid)],
                        { windowsHide: true, timeout: 3000 }, error => {
                            if (error && !settled) {
                                console.error(JSON.stringify({ event: 'process_tree_kill_failed', pid: child.pid, code: error.code }));
                                reason += '; process-tree termination failed; child processes may remain';
                                killShell();
                            }
                        });
                    fallback = setTimeout(killShell, 3500);
                } else {
                    try { process.kill(-child.pid, 'SIGKILL'); } catch { killShell(); }
                }
            };
            const abort = () => stop('aborted');
            child.once('error', error => finish(error));
            // On forced termination, do not wait on pipe handles inherited by descendants.
            child.once('exit', code => { if (reason) finish(undefined, code); });
            child.once('close', code => finish(undefined, code));
            child.stdout.on('data', onData); child.stderr.on('data', onData);
            signal?.addEventListener('abort', abort, { once: true });
            timer = setTimeout(() => stop(`timeout:${timeout}`), timeout * 1000);
            if (signal?.aborted) abort();
            if (stdin) { child.stdin.on('error', () => {}); child.stdin.end(command); }
        });
    },
};
