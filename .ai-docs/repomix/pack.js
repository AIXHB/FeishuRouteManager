#!/usr/bin/env node
"use strict";

const { main } = require("../docctl");

main(["pack", ...process.argv.slice(2)]);
