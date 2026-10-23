#!/usr/bin/env node
"use strict";

const readline = require("readline");
const { findProject, collectDocs, pendingRecords } = require("../lib/core");
const { locateData } = require("../commands/navigation");
const { validateProject, conformance } = require("../commands/quality");

const tools = [
  { name: "aipc_locate", description: "Locate the minimal design/module context for a task or source path.", inputSchema: { type: "object", properties: { task: { type: "string" }, path: { type: "string" } } } },
  { name: "aipc_records", description: "List pending development records for a module.", inputSchema: { type: "object", properties: { module: { type: "string" } }, required: ["module"] } },
  { name: "aipc_validate", description: "Validate the unified AI documentation architecture.", inputSchema: { type: "object", properties: {} } },
  { name: "aipc_conformance", description: "Report UADA-compatible continuity conformance L0-L4.", inputSchema: { type: "object", properties: {} } }
];

function capture(fn) {
  const lines = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args) => lines.push(args.join(" "));
  console.warn = (...args) => lines.push(args.join(" "));
  try { const value = fn(); return { value, text: lines.join("\n") }; }
  finally { console.log = originalLog; console.warn = originalWarn; }
}

function callTool(name, args) {
  const root = findProject();
  if (!root) throw new Error("AGENTS.md project root not found from MCP working directory");
  if (name === "aipc_locate") return locateData(root, args.task, args.path);
  if (name === "aipc_records") return pendingRecords(collectDocs(root), args.module).map(record => ({ id: record.fm.id, path: record.rel, summary: record.fm.summary || "", files: record.fm.files || [] }));
  if (name === "aipc_validate") {
    const result = validateProject(root);
    return { valid: result.errors.length === 0, errors: result.errors, warnings: result.warnings, pending: result.pending.length };
  }
  if (name === "aipc_conformance") {
    const result = capture(() => conformance(root));
    return { level: result.value.level, report: result.text, errors: result.value.validation.errors, warnings: result.value.validation.warnings };
  }
  throw new Error(`unknown tool: ${name}`);
}

function send(message) { process.stdout.write(JSON.stringify(message) + "\n"); }
function success(id, result) { send({ jsonrpc: "2.0", id, result }); }
function error(id, message) { send({ jsonrpc: "2.0", id, error: { code: -32000, message } }); }

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", line => {
  if (!line.trim()) return;
  let request;
  try { request = JSON.parse(line); } catch { return error(null, "invalid JSON"); }
  if (request.method === "initialize") return success(request.id, { protocolVersion: request.params && request.params.protocolVersion || "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "ai-project-continuity", version: "2.0.0" } });
  if (request.method === "notifications/initialized") return;
  if (request.method === "tools/list") return success(request.id, { tools });
  if (request.method === "tools/call") {
    try {
      const value = callTool(request.params.name, request.params.arguments || {});
      return success(request.id, { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
    } catch (caught) { return error(request.id, caught.message); }
  }
  if (request.id !== undefined) error(request.id, `unsupported method: ${request.method}`);
});

module.exports = { tools, callTool };
