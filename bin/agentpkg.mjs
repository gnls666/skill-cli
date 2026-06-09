#!/usr/bin/env node

import { runCli } from "../src/agentpkg/cli.mjs";

try {
  const output = runCli(process.argv.slice(2));
  if (output) {
    process.stdout.write(`${output}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
