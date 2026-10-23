import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// router-bot-skills-v1: the only managed catalog is keyed by this bot's App ID.
export function botSkillRoot(appId, managerRoot = process.env.FEISHU_ROUTER_MANAGER_ROOT || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'FeishuRouterManager')) {
    if (!/^cli_[A-Za-z0-9]+$/.test(appId)) throw new Error('Invalid bot App ID for skills');
    return path.join(managerRoot, 'bots', appId, 'skills');
}

export function botSkillPrompt(appId, managerRoot) {
    const root = botSkillRoot(appId, managerRoot);
    const safe = p => { if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Bot skills must not use links'); };
    const exists = fs.existsSync(root);
    if (exists) for (let p = root, i = 0; i < 4; p = path.dirname(p), i++) safe(p);
    const skills = [];
    for (const entry of (exists ? fs.readdirSync(root, { withFileTypes: true }) : []).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name)) continue;
        const folder = path.join(root, entry.name); safe(folder);
        if (!entry.isDirectory()) continue;
        const file = path.join(folder, 'SKILL.md');
        if (!fs.existsSync(file)) continue;
        safe(file);
        if (fs.statSync(file).size > 128 * 1024) throw new Error('Bot SKILL.md is too large');
        const text = fs.readFileSync(file, 'utf8');
        const header = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
        const description = header.match(/^description:\s*([^\r\n]+)((?:\r?\n[ \t]+[^\r\n]+)*)/m);
        const summary = (description ? description[0].replace(/^description:\s*/, '').replace(/\s+/g, ' ') : text.replace(/\s+/g, ' ')).slice(0, 600);
        skills.push({ name: entry.name, description: summary, file });
        if (skills.length > 128) throw new Error('Too many bot skills');
    }
    return '\n<bot_skills>\n' +
        'These are the skills installed for this bot. Use the listed skill when the user names it or the task matches its description. ' +
        'Before using a skill, read its SKILL.md and follow its instructions. Resolve scripts, references and assets relative to that skill folder. ' +
        'Only this catalog defines manager-installed skills for this bot; do not discover skills from sibling bot folders. ' +
        'An unlisted or uninstalled manager skill is unavailable even if a prior conversation mentioned it. ' +
        'If a requested skill is unavailable, say so. Do not run installation scripts automatically.\n' +
        JSON.stringify(skills) + '\n</bot_skills>\n';
}
