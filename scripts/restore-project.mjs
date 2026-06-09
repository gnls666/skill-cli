#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultBundle = resolve(scriptDir, "../dist/agentpkg-cli-source.bundle.mjs");

function usage() {
  return [
    "Usage:",
    "  node scripts/restore-project.mjs <target-dir> [--bundle <path>] [--force]",
    "",
    "Examples:",
    "  node scripts/restore-project.mjs /tmp/agentpkg-cli-restored",
    "  node scripts/restore-project.mjs ./restored --bundle ./dist/agentpkg-cli-source.bundle.mjs",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    bundle: defaultBundle,
    force: false,
    target: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--bundle" || arg === "--archive") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}.`);
      }
      options.bundle = resolve(next);
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.target) {
      throw new Error(`Only one target directory is supported: ${options.target} and ${arg}`);
    }

    options.target = resolve(arg);
  }

  return options;
}

function isEmptyDir(path) {
  return existsSync(path) && statSync(path).isDirectory() && readdirSync(path).length === 0;
}

async function restore(options) {
  if (!options.target) {
    throw new Error("Missing target directory.");
  }

  if (!existsSync(options.bundle)) {
    throw new Error(`Bundle does not exist: ${options.bundle}`);
  }

  if (existsSync(options.target) && !isEmptyDir(options.target)) {
    if (!options.force) {
      throw new Error(`Target directory is not empty: ${options.target}. Re-run with --force to replace it.`);
    }
    rmSync(options.target, { recursive: true, force: true });
  }

  mkdirSync(options.target, { recursive: true });
  const { sourceBundle } = await import(pathToFileURL(options.bundle).href);
  if (!sourceBundle || sourceBundle.format !== "tar.gz+base64" || !sourceBundle.data) {
    throw new Error(`Invalid source bundle: ${options.bundle}`);
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "agentpkg-restore-"));
  const tempArchive = join(tempRoot, "source.tar.gz");
  try {
    writeFileSync(tempArchive, Buffer.from(sourceBundle.data, "base64"));
    execFileSync("tar", ["-xzf", tempArchive, "-C", options.target], {
      stdio: "inherit",
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return options.target;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  const target = await restore(options);
  process.stdout.write(`Restored project to ${target}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}\n`);
  process.exit(1);
}
