"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_TYPES = new Set(["protocol", "context", "map"]);
const REL_FIELDS = ["related", "depends_on", "modules", "decisions", "implements", "doc_impact", "supersedes"];
const VALID_STATUS = new Set(["draft", "active", "deprecated", "stale", "accepted", "superseded"]);
const TYPE_LAYERS = { protocol: 1, context: 1, map: 2, design: 3, module: 3, record: 4, adr: 5, reference: 6 };

function fail(message, code = 2) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}
function today() { return new Date().toISOString().slice(0, 10); }
function slash(value) { return String(value).replace(/\\/g, "/"); }
function slug(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

function parseArgs(argv) {
  const command = argv[0];
  const positionals = [];
  const options = {};
  const booleans = new Set(["stdout", "mark-synced", "all", "apply", "run", "update"]);
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) { positionals.push(token); continue; }
    const raw = token.slice(2);
    let key;
    let value;
    if (raw.includes("=")) [key, value] = raw.split(/=(.*)/s, 2);
    else {
      key = raw;
      value = booleans.has(key) ? true : argv[++i];
      if (value === undefined) fail(`--${key} requires a value`);
    }
    if (options[key] === undefined) options[key] = value;
    else if (Array.isArray(options[key])) options[key].push(value);
    else options[key] = [options[key], value];
  }
  return { command, positionals, options };
}

function findProject(start = process.cwd()) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "AGENTS.md"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
function projectFrom(options, allowMissing = false) {
  const root = options.project ? path.resolve(String(options.project)) : findProject();
  if (!root) fail("project root not found; pass --project <path>");
  if (!allowMissing && !fs.existsSync(path.join(root, "AGENTS.md"))) fail(`not an initialized project: ${root}`);
  return root;
}

function parseInlineArray(raw) {
  const values = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of raw) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote) { escaped = true; continue; }
    if ((char === "\"" || char === "'") && (!quote || quote === char)) { quote = quote ? null : char; continue; }
    if (char === "," && !quote) { if (current.trim()) values.push(current.trim()); current = ""; continue; }
    current += char;
  }
  if (quote) throw new Error("unterminated quote in inline array");
  if (current.trim()) values.push(current.trim());
  return values;
}

function parseFrontMatter(raw) {
  const fm = {};
  const errors = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^\s/.test(line)) { errors.push(`line ${index + 1}: nested YAML is unsupported; use scalars or inline arrays`); continue; }
    const colon = line.indexOf(":");
    if (colon < 1) { errors.push(`line ${index + 1}: expected key: value`); continue; }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (!/^[A-Za-z0-9_]+$/.test(key)) { errors.push(`line ${index + 1}: invalid key ${key}`); continue; }
    if (value.startsWith("[") && value.endsWith("]")) {
      try { fm[key] = parseInlineArray(value.slice(1, -1)); }
      catch (error) { errors.push(`line ${index + 1}: ${error.message}`); }
    } else if (value.startsWith("|") || value.startsWith(">") || value === "-") {
      errors.push(`line ${index + 1}: multiline/block YAML is unsupported`);
    } else {
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (/^(true|false)$/i.test(value)) fm[key] = value.toLowerCase() === "true";
      else if (/^-?\d+$/.test(value)) fm[key] = Number(value);
      else fm[key] = value;
    }
  }
  return { fm, errors };
}

function splitDocument(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: null, body: normalized, parseErrors: ["missing YAML front matter"] };
  const parsed = parseFrontMatter(match[1]);
  return { fm: parsed.fm, body: match[2], parseErrors: parsed.errors };
}

function yamlScalar(value) {
  const text = String(value ?? "");
  return /^[a-zA-Z0-9_.\-/]+$/.test(text) ? text : JSON.stringify(text);
}
function yamlArray(values) { return `[${(values || []).map(yamlScalar).join(", ")}]`; }
function serializeFrontMatter(fm) {
  return Object.entries(fm).map(([key, value]) => `${key}: ${Array.isArray(value) ? yamlArray(value) : yamlScalar(value)}`).join("\n");
}
function joinDocument(fm, body) { return `---\n${serializeFrontMatter(fm)}\n---\n\n${String(body).replace(/^\s+/, "")}`; }

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, output); else output.push(full);
  }
  return output;
}
function collectDocs(root) {
  return walk(path.join(root, "docs")).filter(file => file.endsWith(".md") && !path.basename(file).startsWith("_")).map(file => {
    const text = fs.readFileSync(file, "utf8");
    return { path: file, rel: slash(path.relative(root, file)), text, ...splitDocument(text) };
  });
}
function writeExclusive(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx" }); }
  catch (error) { if (error.code === "EEXIST") fail(`refusing to overwrite existing file: ${file}`); throw error; }
}

function globRegex(pattern) {
  const normalized = slash(pattern);
  let out = "^";
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === "*" && normalized[i + 1] === "*") { out += ".*"; i++; }
    else if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else out += ch.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(out + "$");
}
function matchesGlob(pattern, value) { try { return globRegex(pattern).test(slash(value)); } catch { return false; } }
function wikiLinks(body) {
  const withoutFences = String(body).replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
  return [...withoutFences.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)].map(match => match[1].trim());
}
function pendingRecords(docs, moduleId) { return docs.filter(d => d.fm && d.fm.type === "record" && d.fm.module === moduleId && d.fm.sync_status === "pending"); }
function ageDays(date) { const ms = Date.now() - Date.parse(date); return Number.isFinite(ms) ? Math.floor(ms / 86400000) : 0; }
function headingSummary(body, fallback) { const heading = String(body).match(/^#\s+(.+)$/m); return heading ? heading[1].trim() : fallback; }

module.exports = {
  ROOT_TYPES, REL_FIELDS, VALID_STATUS, TYPE_LAYERS, fail, today, slash, slug, sha256, parseArgs,
  findProject, projectFrom, parseFrontMatter, splitDocument, yamlScalar, yamlArray, serializeFrontMatter,
  joinDocument, walk, collectDocs, writeExclusive, matchesGlob, wikiLinks, pendingRecords, ageDays, headingSummary
};
