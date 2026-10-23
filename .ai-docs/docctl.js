#!/usr/bin/env node
"use strict";

const { parseArgs, projectFrom, fail } = require("./lib/core");
const project = require("./commands/project");
const navigation = require("./commands/navigation");
const quality = require("./commands/quality");
const harness = require("./commands/sync");

function help() {
  console.log(`ai-project-continuity docctl (UADA-compatible unified toolchain)

Usage: node docctl.js <command> [arguments] [--project <root>]

Project:
  init | adopt
  new design|module|record|adr --id <slug> [options]
  migrate [--apply]                 Upgrade legacy UADA/AIPC front matter safely

Navigation and records:
  locate "<task>" | locate --path <file>
  map [--stdout]
  fold <module> [record-id] [--mark-synced] [--all]
  pack <module> [--run]             Print or run a Repomix command

Quality and integration:
  status
  validate [--changed <path[,path]>] [--git-base <ref>]
  tokens [--update]
  conformance
  sync                              Generate Claude/Cursor and refresh .ai-docs runtime

Threshold env vars: AIPC_WARN_COUNT, AIPC_FAIL_COUNT, AIPC_WARN_DAYS, AIPC_FAIL_DAYS`);
}

function main(argv = process.argv.slice(2)) {
  const { command, positionals, options } = parseArgs(argv);
  if (!command || command === "help" || command === "--help") return help();
  if (command === "init") {
    const root = project.init(projectFrom(options, true));
    navigation.generateMap(root, false);
    return root;
  }
  if (command === "adopt") return project.adopt(projectFrom(options, true), navigation.generateMap);
  const root = projectFrom(options);
  if (command === "new") return project.newDocument(root, positionals[0], options);
  if (command === "migrate") return project.migrate(root, Boolean(options.apply));
  if (command === "locate") return navigation.locate(root, positionals.join(" "), options.path);
  if (command === "map") return navigation.generateMap(root, Boolean(options.stdout));
  if (command === "fold") return navigation.fold(root, positionals[0], positionals[1], Boolean(options["mark-synced"]), Boolean(options.all));
  if (command === "pack") return navigation.pack(root, positionals[0], Boolean(options.run));
  if (command === "status") {
    const result = quality.status(root);
    if (result.errors.length) process.exitCode = 1;
    return result;
  }
  if (command === "validate") {
    let changed = quality.changedValues(options.changed);
    if (options["git-base"] !== undefined) {
      const fromGit = quality.gitChanged(root, options["git-base"] === true ? null : options["git-base"]);
      if (fromGit.error) fail(fromGit.error, 1);
      changed = [...changed, ...fromGit.files];
    }
    const result = quality.validateProject(root, changed, { requireOwnership: true });
    quality.printValidation(result);
    if (result.errors.length) process.exitCode = 1;
    return result;
  }
  if (command === "tokens") return quality.tokens(root, Boolean(options.update));
  if (command === "conformance") return quality.conformance(root);
  if (command === "sync") return harness.sync(root);
  fail(`unknown command: ${command}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exit(error.exitCode || 1); }
}

module.exports = { main };
