"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  fail, today, slash, sha256, yamlArray, collectDocs, matchesGlob, pendingRecords, joinDocument
} = require("../lib/core");

function moduleDocs(docs) { return docs.filter(doc => doc.fm && (doc.fm.type === "module" || doc.fm.layer === 3 && doc.fm.module)); }
function designDocs(docs) { return docs.filter(doc => doc.fm && doc.fm.type === "design"); }

function mapSource(docs) {
  return [...designDocs(docs), ...moduleDocs(docs)].sort((a, b) => a.fm.id.localeCompare(b.fm.id)).map(doc => ({
    id: doc.fm.id, type: doc.fm.type || "module", summary: doc.fm.summary || "", status: doc.fm.status || "",
    modules: doc.fm.modules || [], key_files: doc.fm.key_files || [], depends_on: doc.fm.depends_on || [], implements: doc.fm.implements || [], related: doc.fm.related || []
  }));
}
function mapHash(docs) { return sha256(JSON.stringify(mapSource(docs))); }
function nodeName(id) { return `n_${String(id).replace(/[^a-zA-Z0-9_]/g, "_")}`; }

function generateMapText(root, docs = collectDocs(root)) {
  const designs = designDocs(docs).sort((a, b) => a.fm.id.localeCompare(b.fm.id));
  const modules = moduleDocs(docs).sort((a, b) => a.fm.id.localeCompare(b.fm.id));
  const rootRelations = ["protocol", "context"].filter(id => docs.some(doc => doc.fm && doc.fm.id === id));
  const lines = [
    "---", "id: map", "type: map", "layer: 2", "status: active", "summary: 自动生成的设计与模块索引",
    "load_when: [architecture, overview, cross-module, locate]", "globs: []", `related: ${yamlArray(rootRelations)}`, "depends_on: []",
    `last_updated: ${today()}`, `generated_hash: ${mapHash(docs)}`, "token_est: 0", "---", "", "# 项目文档地图", "",
    "> 由 `docctl map` 自动生成，请勿手工维护。", "", "## 设计", "", "| ID | 类型 | 摘要 | 模块 | 状态 |", "|---|---|---|---|---|"
  ];
  if (!designs.length) lines.push("| - | - | 暂无 | - | - |");
  for (const doc of designs) lines.push(`| [[${doc.fm.id}]] | ${doc.fm.design_type || "-"} | ${doc.fm.summary || ""} | ${yamlArray(doc.fm.modules)} | ${doc.fm.status} |`);
  lines.push("", "## 模块", "", "| ID | 摘要 | key_files | depends_on | 状态 |", "|---|---|---|---|---|");
  if (!modules.length) lines.push("| - | 暂无 | - | - | - |");
  for (const doc of modules) lines.push(`| [[${doc.fm.id}]] | ${doc.fm.summary || ""} | ${yamlArray(doc.fm.key_files)} | ${yamlArray(doc.fm.depends_on)} | ${doc.fm.status} |`);
  lines.push("", "## 关系图", "", "```mermaid", "graph TD");
  const graphDocs = [...designs, ...modules];
  if (!graphDocs.length) lines.push("  empty[尚无设计或模块]");
  for (const doc of graphDocs) lines.push(`  ${nodeName(doc.fm.id)}[\"${doc.fm.id}\"]`);
  const ids = new Set(graphDocs.map(doc => doc.fm.id));
  for (const doc of graphDocs) for (const field of ["modules", "depends_on", "implements", "related"]) for (const target of Array.isArray(doc.fm[field]) ? doc.fm[field] : []) if (ids.has(target)) lines.push(`  ${nodeName(doc.fm.id)} -->|${field}| ${nodeName(target)}`);
  lines.push("```", "");
  return lines.join("\n");
}
function generateMap(root, stdout) {
  const text = generateMapText(root);
  if (stdout) process.stdout.write(text);
  else { fs.writeFileSync(path.join(root, "docs", "MAP.md"), text, "utf8"); console.log("generated docs/MAP.md"); }
  return text;
}

function locateData(root, query, filePath) {
  const docs = collectDocs(root).filter(doc => doc.fm);
  let hits;
  if (filePath) {
    const rel = slash(path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath);
    hits = docs.filter(doc => Array.isArray(doc.fm.globs) && doc.fm.globs.some(glob => matchesGlob(glob, rel)));
  } else {
    const words = String(query || "").trim().toLowerCase().split(/[\s,，。./_-]+/).filter(Boolean);
    if (!words.length) fail("locate requires task words or --path <file>");
    hits = docs.map(doc => {
      const terms = [doc.fm.id, doc.fm.summary, doc.fm.type, ...(Array.isArray(doc.fm.load_when) ? doc.fm.load_when : [])].filter(Boolean).map(value => String(value).toLowerCase());
      let score = 0;
      for (const word of words) for (const term of terms) if (term === word) score += 3; else if (term.includes(word) || word.includes(term)) score++;
      return { doc, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).map(item => item.doc);
  }
  const ids = new Set(hits.map(doc => doc.fm.id));
  for (const hit of [...hits]) for (const dep of Array.isArray(hit.fm.depends_on) ? hit.fm.depends_on : []) {
    const found = docs.find(doc => doc.fm.id === dep);
    if (found && !ids.has(dep)) { ids.add(dep); hits.push(found); }
  }
  return hits.map(doc => ({
    id: doc.fm.id, type: doc.fm.type, path: doc.rel, summary: doc.fm.summary || "",
    key_files: doc.fm.key_files || [], depends_on: doc.fm.depends_on || [],
    pending: doc.fm.type === "module" ? pendingRecords(docs, doc.fm.id).map(record => ({ id: record.fm.id, path: record.rel, summary: record.fm.summary || "" })) : []
  }));
}
function locate(root, query, filePath) {
  const results = locateData(root, query, filePath);
  console.log(filePath ? `locate by path: ${filePath}` : `locate by task: ${query}`);
  if (!results.length) { console.log("no direct match; read docs/MAP.md"); return results; }
  for (const result of results) {
    console.log(`- ${result.path} [${result.id}] ${result.summary}`);
    for (const record of result.pending) console.log(`  - pending: ${record.path} [${record.id}]`);
  }
  return results;
}

function fold(root, moduleId, recordId, mark, all) {
  if (!moduleId) fail("fold requires <module-id>");
  let records = pendingRecords(collectDocs(root), moduleId);
  if (recordId) records = records.filter(record => record.fm.id === recordId || record.rel === slash(recordId));
  if (!records.length) { console.log(`no matching pending records for ${moduleId}`); return []; }
  if (!mark) {
    console.log(`fold ${moduleId}:`);
    for (const record of records) console.log(`- ${record.rel} [${record.fm.id}] ${record.fm.summary || ""}`);
    console.log("merge durable facts into live docs, then mark one record or pass --all explicitly");
    return records;
  }
  if (!recordId && !all) fail("marking requires a record id; use --all only after reviewing every pending record");
  for (const record of records) {
    record.fm.sync_status = "synced";
    fs.writeFileSync(record.path, joinDocument(record.fm, record.body), "utf8");
    console.log(`synced ${record.rel}`);
  }
  return records;
}

function pack(root, moduleId, run) {
  const moduleDoc = moduleDocs(collectDocs(root)).find(doc => doc.fm.id === moduleId || doc.fm.module === moduleId);
  if (!moduleDoc) fail(`module not found: ${moduleId}`);
  const globs = Array.isArray(moduleDoc.fm.globs) ? moduleDoc.fm.globs : [];
  const keyFiles = Array.isArray(moduleDoc.fm.key_files) ? moduleDoc.fm.key_files : [];
  const output = `${moduleId}.packed.txt`;
  const args = ["-y", "repomix", ...globs.flatMap(glob => ["--include", glob]), ...keyFiles.flatMap(file => ["--include", file]), "--output", output];
  console.log(`module: ${moduleId}\nkey_files: ${keyFiles.join(", ")}\nglobs: ${globs.join(", ")}\n\nrepomix ${args.slice(2).join(" ")}`);
  if (run) {
    const result = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) fail(`repomix failed with exit ${result.status}`, 1);
  }
}

module.exports = { moduleDocs, designDocs, mapHash, generateMapText, generateMap, locateData, locate, fold, pack };
