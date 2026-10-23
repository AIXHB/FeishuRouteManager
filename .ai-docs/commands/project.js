"use strict";

const fs = require("fs");
const path = require("path");
const {
  fail, today, slash, slug, walk, collectDocs, writeExclusive, yamlArray, yamlScalar, joinDocument, headingSummary, splitDocument, TYPE_LAYERS
} = require("../lib/core");

const SKILL_ROOT = path.resolve(__dirname, "..", "..");
const TEMPLATE_ROOT = path.join(SKILL_ROOT, "assets", "project-template");

function copyTree(sourceRoot, targetRoot, { replace = {}, overwrite = false, filter = () => true } = {}) {
  const created = [];
  const preserved = [];
  for (const source of walk(sourceRoot)) {
    const rel = path.relative(sourceRoot, source);
    if (!filter(rel)) continue;
    const target = path.join(targetRoot, rel);
    if (!overwrite && fs.existsSync(target)) { preserved.push(slash(rel)); continue; }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    let content = fs.readFileSync(source, "utf8");
    for (const [from, to] of Object.entries(replace)) content = content.split(from).join(to);
    fs.writeFileSync(target, content, "utf8");
    created.push(slash(rel));
  }
  return { created, preserved };
}

function syncRuntime(root) {
  const source = path.join(SKILL_ROOT, "scripts");
  const target = path.join(root, ".ai-docs");
  const result = copyTree(source, target, {
    overwrite: true,
    filter: rel => rel.endsWith(".js") && !slash(rel).startsWith("tests/")
  });
  return result.created.length;
}

function init(root) {
  fs.mkdirSync(root, { recursive: true });
  const result = copyTree(TEMPLATE_ROOT, root, {
    replace: { "{{project_name}}": path.basename(root), "{{date}}": today() }
  });
  const runtimeFiles = syncRuntime(root);
  console.log(`initialized ${root}`);
  console.log(`created: ${result.created.length}; preserved existing: ${result.preserved.length}; runtime: ${runtimeFiles}`);
  return root;
}

function firstFile(dir) {
  return walk(dir).find(file => !/[/\\](node_modules|dist|build|\.git)[/\\]/.test(file) && !file.endsWith(".md"));
}

function moduleFrontMatter(id, summary, glob, keyFile) {
  return {
    id, type: "module", layer: 3, module: id, status: "draft", summary,
    load_when: [id], globs: [glob], related: [], depends_on: [], key_files: keyFile ? [keyFile] : [],
    implements: [], public_api: [], tests: [], last_updated: today(), token_est: 0
  };
}
function moduleBody(id, keyFile) {
  return `# ${id}

## 职责与边界

待依据真实代码确认。

## 关键文件与代码结构

${keyFile ? `- \`${keyFile}\`：扫描得到的候选入口，需人工确认。` : "- 待补充代码入口。"}

## API、数据流与不变量

待依据真实代码补充准确符号和调用关系。

## 测试与已知陷阱

- 待补充验证入口。
`;
}

function adopt(root, generateMap) {
  init(root);
  const sourceRoots = ["src", "app", "lib", "packages", "services", "Assets"].filter(name => fs.existsSync(path.join(root, name)));
  const existing = new Set(collectDocs(root).filter(d => d.fm && (d.fm.type === "module" || d.fm.layer === 3 && d.fm.module)).map(d => d.fm.module || d.fm.id));
  const created = [];
  for (const sourceRoot of sourceRoots) {
    const absRoot = path.join(root, sourceRoot);
    let candidates = fs.readdirSync(absRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith(".")).map(entry => ({ name: entry.name, dir: path.join(absRoot, entry.name), glob: `${sourceRoot}/${entry.name}/**` }));
    if (!candidates.length && firstFile(absRoot)) candidates = [{ name: sourceRoot, dir: absRoot, glob: `${sourceRoot}/**` }];
    for (const candidate of candidates) {
      const id = slug(candidate.name);
      if (!id || existing.has(id)) continue;
      const found = firstFile(candidate.dir);
      const keyFile = found ? slash(path.relative(root, found)) : null;
      const target = path.join(root, "docs", "modules", `${id}.md`);
      if (fs.existsSync(target)) continue;
      writeExclusive(target, joinDocument(moduleFrontMatter(id, `扫描生成的 ${candidate.name} 模块草稿`, candidate.glob, keyFile), moduleBody(id, keyFile)));
      existing.add(id); created.push(id);
    }
  }
  generateMap(root, false);
  console.log(`adopted draft modules: ${created.length ? created.join(", ") : "none"}`);
}

function newDocument(root, kind, options) {
  const id = slug(options.id);
  if (!id) fail("new requires --id <lowercase-slug>");
  const date = today();
  let finalId = id;
  let dir;
  let fm;
  let body;
  if (kind === "design") {
    const designType = options["design-type"] || "product";
    if (!["product", "technical"].includes(designType)) fail("--design-type must be product or technical");
    dir = "designs";
    fm = { id, type: "design", layer: 3, status: "draft", summary: options.summary || "待补充设计目标", design_type: designType, load_when: [id], globs: [], related: [], depends_on: [], modules: [], acceptance: [], decisions: [], last_updated: date, token_est: 0 };
    body = `# ${options.title || id}\n\n## 目标与非目标\n\n待补充。\n\n## 场景与流程\n\n待补充。\n\n## 约束与验收\n\n- 待补充可验证标准。\n\n## 关联\n\n使用对应文档 ID 的 Obsidian WikiLink 关联模块与决策。\n`;
  } else if (kind === "module") {
    dir = "modules";
    const keyFile = options["key-file"] ? slash(options["key-file"]) : null;
    fm = moduleFrontMatter(id, options.summary || "待补充模块职责", options.glob || `src/${id}/**`, keyFile);
    body = moduleBody(id, keyFile);
  } else if (kind === "record") {
    const moduleId = slug(options.module);
    if (!moduleId) fail("new record requires --module <module-id>");
    const files = (Array.isArray(options.files) ? options.files : [options.files]).filter(Boolean).flatMap(value => String(value).split(",")).map(slash);
    if (!files.length) fail("new record requires --files <path>[,<path>]");
    finalId = id.startsWith("rec-") ? id : `rec-${date}-${id}`;
    dir = "records";
    fm = { id: finalId, type: "record", layer: 4, status: "active", summary: options.summary || "待补充变更摘要", module: moduleId, change_type: options["change-type"] || "feat", date, files, load_when: [], globs: [], related: [], depends_on: [], decisions: [], doc_impact: [moduleId], sync_status: "pending", last_updated: date, token_est: 0 };
    body = `# ${options.title || "变更记录"}\n\n## 改了什么与为什么\n\n待补充。\n\n## 验证\n\n- 待补充实际运行的验证。\n\n## 需要沉淀的事实\n\n- 待补充。\n`;
  } else if (kind === "adr") {
    finalId = id.startsWith("adr-") ? id : `adr-${id}`;
    dir = "decisions";
    fm = { id: finalId, type: "adr", layer: 5, status: "accepted", summary: options.summary || "待补充决策结论", date, load_when: ["decision", finalId], globs: [], related: [], depends_on: [], supersedes: [], last_updated: date, token_est: 0 };
    body = `# ADR：${options.title || finalId}\n\n## 上下文\n\n待补充。\n\n## 决策\n\n待补充。\n\n## 后果与替代方案\n\n- 待补充。\n`;
  } else fail("new type must be design, module, record, or adr");
  const target = path.join(root, "docs", dir, `${finalId}.md`);
  writeExclusive(target, joinDocument(fm, body));
  console.log(`created ${slash(path.relative(root, target))}`);
}

function inferType(doc) {
  const rel = slash(doc.rel).toLowerCase();
  if (doc.fm.type) return doc.fm.type;
  if (doc.fm.id === "protocol") return "protocol";
  if (doc.fm.id === "context") return "context";
  if (doc.fm.id === "map") return "map";
  if (rel.includes("/records/") || doc.fm.sync_status) return "record";
  if (rel.includes("/decisions/") || String(doc.fm.id).startsWith("adr-")) return "adr";
  if (rel.includes("/designs/") || doc.fm.design_type) return "design";
  if (rel.includes("/modules/") || doc.fm.layer === 3 || doc.fm.module) return "module";
  return "reference";
}

function migrate(root, apply) {
  const replacements = { "{{project_name}}": path.basename(root), "{{date}}": today() };
  const missingAssets = walk(TEMPLATE_ROOT).map(source => path.relative(TEMPLATE_ROOT, source)).filter(rel => !fs.existsSync(path.join(root, rel)));
  if (apply) {
    copyTree(TEMPLATE_ROOT, root, { replace: replacements });
    syncRuntime(root);
  }
  const docs = collectDocs(root);
  const changes = missingAssets.map(rel => `add:${slash(rel)}`);
  for (const doc of docs) {
    if (!doc.fm) continue;
    const fm = { ...doc.fm };
    let body = doc.body;
    const type = inferType(doc);
    const defaults = {
      type, layer: TYPE_LAYERS[type], status: type === "adr" ? "accepted" : "active",
      summary: headingSummary(doc.body, fm.id), load_when: [], globs: [], related: [], depends_on: [],
      last_updated: fm.date || today(), token_est: Math.ceil(doc.text.length / 4)
    };
    for (const [key, value] of Object.entries(defaults)) if (fm[key] === undefined || fm[key] === null || fm[key] === "") fm[key] = value;
    if (type === "module") {
      if (!fm.module) fm.module = fm.id;
      for (const key of ["key_files", "implements", "public_api", "tests"]) if (!Array.isArray(fm[key])) fm[key] = [];
    } else if (type === "design") {
      if (!fm.design_type) fm.design_type = "technical";
      for (const key of ["modules", "acceptance", "decisions"]) if (!Array.isArray(fm[key])) fm[key] = [];
    } else if (type === "record") {
      if (!fm.date) fm.date = today();
      if (!fm.change_type) fm.change_type = "docs";
      if (!Array.isArray(fm.files)) fm.files = [];
      if (!Array.isArray(fm.doc_impact)) fm.doc_impact = fm.module ? [fm.module] : [];
      if (!fm.sync_status) fm.sync_status = "pending";
    } else if (type === "adr") {
      if (!fm.date) fm.date = today();
      if (!Array.isArray(fm.supersedes)) fm.supersedes = [];
    }
    if (type === "protocol" && /鏂囨。|閫氱敤|鍗忚/.test(body)) {
      const clean = fs.readFileSync(path.join(TEMPLATE_ROOT, "docs", "PROTOCOL.md"), "utf8").split("{{date}}").join(today());
      body = splitDocument(clean).body;
    }
    const before = JSON.stringify(doc.fm);
    if (JSON.stringify(fm) !== before || body !== doc.body) {
      changes.push(doc.rel);
      if (apply) fs.writeFileSync(doc.path, joinDocument(fm, body), "utf8");
    }
  }
  console.log(`${apply ? "migrated" : "would migrate"}: ${changes.length} document(s)`);
  for (const rel of changes) console.log(`- ${rel}`);
  if (!apply && changes.length) console.log("review, then rerun with --apply");
  return changes;
}

module.exports = { init, adopt, newDocument, migrate, syncRuntime, moduleFrontMatter, moduleBody };
