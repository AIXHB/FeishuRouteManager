#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const docctl = path.join(__dirname, "..", "docctl.js");
const args = [docctl, "validate", ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status === null ? 1 : result.status);
