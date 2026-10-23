"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  REL_FIELDS, VALID_STATUS, TYPE_LAYERS, ROOT_TYPES, slash, collectDocs, matchesGlob, wikiLinks,
  pendingRecords, ageDays, joinDocument
} = require("../lib/core");
const { moduleDocs, mapHash } = require("./navigation");

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function thresholds() {
  return {
    warnCount: numberEnv("AIPC_WARN_COUNT", 3), failCount: numberEnv("AIPC_FAIL_COUNT", 5),
    warnDays: numberEnv("AIPC_WARN_DAYS", 7), failDays: numberEnv("AIPC_FAIL_DAYS", 14)
  };
}
function changedValues(raw) { return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).flatMap(value => String(value).split(",")).map(slash); }
function gitChanged(root, base) {
  const args = base ? ["diff", "--name-only", `${base}...HEAD`] : ["diff", "--name-only", "HEAD"];
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return { files: [], error: (result.stderr || "git diff failed").trim() };
  return { files: result.stdout.split(/\r?\n/).filter(Boolean).map(slash), error: null };
}

function validateProject(root, changed = [], options = {}) {
  const docs = collectDocs(root);
  const errors = [];
  const warnings = [];
  const byId = new Map();
  const validTypes = new Set(Object.keys(TYPE_LAYERS));
  const requiredCommon = ["id", "type", "layer", "status", "summary", "load_when", "globs", "related", "depends_on", "last_updated", "token_est"];
  const requiredByType = {
    design: ["design_type", "modules", "acceptance", "decisions"],
    module: ["module", "key_files", "implements", "public_api", "tests"],
    record: ["module", "change_type", "date", "files", "doc_impact", "sync_status"],
    adr: ["date", "supersedes"]
  };
  for (const doc of docs) {
    for (const parseError of doc.parseErrors || []) errors.push(`${doc.rel}: ${parseError}`);
    if (!doc.fm) continue;
    const fm = doc.fm;
    for (const field of requiredCommon) if (fm[field] === undefined || fm[field] === "") errors.push(`${doc.rel}: missing ${field}`);
    if (!validTypes.has(fm.type)) errors.push(`${doc.rel}: unknown type ${fm.type}`);
    for (const field of requiredByType[fm.type] || []) if (fm[field] === undefined) errors.push(`${doc.rel}: missing ${field}`);
    if (fm.id) {
      if (byId.has(fm.id)) errors.push(`${doc.rel}: duplicate id ${fm.id} (also ${byId.get(fm.id).rel})`); else byId.set(fm.id, doc);
      if (!ROOT_TYPES.has(fm.type) && path.basename(doc.path, ".md") !== fm.id) errors.push(`${doc.rel}: filename must equal id ${fm.id}.md`);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fm.id)) errors.push(`${doc.rel}: id must be a lowercase slug`);
    }
    if (!VALID_STATUS.has(fm.status)) errors.push(`${doc.rel}: invalid status ${fm.status}`);
    if (TYPE_LAYERS[fm.type] !== undefined && Number(fm.layer) !== TYPE_LAYERS[fm.type]) errors.push(`${doc.rel}: ${fm.type} must use layer ${TYPE_LAYERS[fm.type]}`);
    if (fm.type === "module" && fm.module !== fm.id) errors.push(`${doc.rel}: module field must equal id`);
    if (fm.type === "design" && !["product", "technical"].includes(fm.design_type)) errors.push(`${doc.rel}: invalid design_type ${fm.design_type}`);
    if (fm.type === "record" && !["feat", "fix", "refactor", "docs", "config", "test", "chore"].includes(fm.change_type)) errors.push(`${doc.rel}: invalid change_type ${fm.change_type}`);
    if (fm.type === "record" && !["pending", "synced"].includes(fm.sync_status)) errors.push(`${doc.rel}: invalid sync_status ${fm.sync_status}`);
    for (const field of ["load_when", "globs", "related", "depends_on"]) if (!Array.isArray(fm[field])) errors.push(`${doc.rel}: ${field} must be an inline array`);
  }
  const expectType = (doc, field, targets, type) => {
    for (const target of Array.isArray(targets) ? targets : []) {
      if (!byId.has(target)) errors.push(`${doc.rel}: ${field} references missing id ${target}`);
      else if (type && byId.get(target).fm.type !== type) errors.push(`${doc.rel}: ${field} target ${target} must be ${type}`);
    }
  };
  for (const doc of docs.filter(item => item.fm)) {
    for (const field of REL_FIELDS) expectType(doc, field, doc.fm[field], field === "modules" || field === "implements" || field === "doc_impact" ? "module" : field === "decisions" || field === "supersedes" ? "adr" : null);
    if (doc.fm.type === "record") expectType(doc, "module", [doc.fm.module], "module");
    for (const target of wikiLinks(doc.body)) if (!byId.has(target)) errors.push(`${doc.rel}: WikiLink references missing id ${target}`);
    for (const keyFile of Array.isArray(doc.fm.key_files) ? doc.fm.key_files : []) if (!fs.existsSync(path.join(root, keyFile))) errors.push(`${doc.rel}: key_files path not found ${keyFile}`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail) {
    if (visiting.has(id)) { errors.push(`dependency cycle: ${[...trail, id].join(" -> ")}`); return; }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const dep of Array.isArray(byId.get(id).fm.depends_on) ? byId.get(id).fm.depends_on : []) visit(dep, [...trail, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id, []);

  const mapDoc = byId.get("map");
  if (!mapDoc) errors.push("docs/MAP.md missing");
  else if (mapDoc.fm.generated_hash !== mapHash(docs)) errors.push("docs/MAP.md is stale; run map");

  const pending = docs.filter(doc => doc.fm && doc.fm.type === "record" && doc.fm.sync_status === "pending");
  const limit = thresholds();
  for (const moduleDoc of moduleDocs(docs)) {
    const records = pendingRecords(docs, moduleDoc.fm.id);
    const oldest = records.reduce((max, record) => Math.max(max, ageDays(record.fm.date || record.fm.last_updated)), 0);
    if (records.length >= limit.failCount || oldest > limit.failDays) errors.push(`module ${moduleDoc.fm.id}: pending records exceed fail threshold (${records.length}, oldest ${oldest}d)`);
    else if (records.length >= limit.warnCount || oldest > limit.warnDays) warnings.push(`module ${moduleDoc.fm.id}: pending records need folding (${records.length}, oldest ${oldest}d)`);
  }
  const ignored = file => file.startsWith("docs/") || file.startsWith(".ai-docs/") || file === "AGENTS.md" || file === "CLAUDE.md" || file.startsWith(".cursor/") || file.startsWith(".github/workflows/ai-project-continuity");
  for (const changedPath of changedValues(changed).filter(file => !ignored(file))) {
    const owners = moduleDocs(docs).filter(moduleDoc => (moduleDoc.fm.globs || []).some(glob => matchesGlob(glob, changedPath)) || (moduleDoc.fm.key_files || []).includes(changedPath));
    for (const owner of owners) {
      const covered = pending.some(record => record.fm.module === owner.fm.id && Array.isArray(record.fm.files) && record.fm.files.includes(changedPath));
      if (!covered) errors.push(`${changedPath}: owned by ${owner.fm.id} but no matching pending record lists this file`);
    }
  }
  if (options.requireOwnership) for (const changedPath of changedValues(changed).filter(file => !ignored(file))) {
    if (!moduleDocs(docs).some(moduleDoc => (moduleDoc.fm.globs || []).some(glob => matchesGlob(glob, changedPath)) || (moduleDoc.fm.key_files || []).includes(changedPath))) warnings.push(`${changedPath}: no module owns this changed file`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], docs, pending, thresholds: limit };
}

function printValidation(result) {
  for (const warning of result.warnings) console.warn(`WARN  ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  if (result.errors.length) console.error(`invalid: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  else console.log(`valid: ${result.docs.length} doc(s), ${result.warnings.length} warning(s)`);
}
function status(root) {
  const result = validateProject(root);
  printValidation(result);
  const grouped = {};
  for (const record of result.pending) (grouped[record.fm.module] ||= []).push(record);
  console.log(`pending: ${result.pending.length}`);
  for (const [moduleId, records] of Object.entries(grouped)) console.log(`- ${moduleId}: ${records.length}, oldest ${Math.max(...records.map(record => ageDays(record.fm.date)))}d`);
  return result;
}

function tokens(root, update) {
  const docs = collectDocs(root).filter(doc => doc.fm);
  let total = 0;
  for (const doc of docs) {
    const estimate = Math.ceil(doc.text.length / 4);
    total += estimate;
    console.log(`${String(estimate).padStart(6)}  ${doc.rel}${Number(doc.fm.token_est) !== estimate ? ` (front matter: ${doc.fm.token_est})` : ""}`);
    if (update) { doc.fm.token_est = estimate; fs.writeFileSync(doc.path, joinDocument(doc.fm, doc.body), "utf8"); }
  }
  console.log(`total: ${total} estimated tokens across ${docs.length} docs`);
  if (update) console.log("updated token_est fields; run map because metadata may have changed");
  return total;
}

function conformance(root) {
  const docs = collectDocs(root);
  const validation = validateProject(root);
  const has = rel => fs.existsSync(path.join(root, rel));
  const l1 = has("AGENTS.md") && docs.some(doc => doc.fm && doc.fm.id === "protocol") && docs.some(doc => doc.fm && doc.fm.id === "map");
  const modules = moduleDocs(docs);
  const l2 = l1 && modules.length > 0 && !validation.errors.some(error => !error.includes("pending records exceed"));
  const records = docs.filter(doc => doc.fm && doc.fm.type === "record");
  const l3 = l2 && records.length > 0 && records.every(record => record.fm.module && record.fm.sync_status);
  const hasCI = has(".github/workflows/ai-project-continuity.yml") && has(".ai-docs/docctl.js");
  const hasHarness = has("CLAUDE.md") && has(".cursor/rules/project-continuity.mdc");
  const l4 = l3 && validation.errors.length === 0 && hasCI && hasHarness;
  const level = l4 ? 4 : l3 ? 3 : l2 ? 2 : l1 ? 1 : 0;
  console.log(`AI Project Continuity / UADA Conformance: L${level}`);
  console.log(`[${l1 ? "x" : " "}] L1 router + protocol + map`);
  console.log(`[${l2 ? "x" : " "}] L2 unified module schema + structural validation`);
  console.log(`[${l3 ? "x" : " "}] L3 disciplined development records`);
  console.log(`[${l4 ? "x" : " "}] L4 clean debt gates + CI + synchronized harness`);
  return { level, validation };
}

module.exports = { thresholds, changedValues, gitChanged, validateProject, printValidation, status, tokens, conformance };
