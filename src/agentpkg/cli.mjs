import { resolve } from "node:path";
import {
  auditPackage,
  compilePackage,
  createAgent,
  importPackage,
  initPackage,
  installPackage,
  validateAllPackages,
} from "./core.mjs";

function parseOptions(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }

  return { positionals, options };
}

function rootFrom(options) {
  return resolve(String(options.root || process.cwd()));
}

function usage() {
  return [
    "Usage:",
    "  agentpkg init [--root <path>] [--name <name>]",
    "  agentpkg import <contribution-dir> [--root <path>] [--name <name>] [--force]",
    "  agentpkg create agent <name> [--root <path>] [--skill <name>] [--with-copilot]",
    "  agentpkg compile [--root <path>] [--force]",
    "  agentpkg install <package-dir> [--root <path>] [--force]",
    "  agentpkg audit [--root <path>]",
    "  agentpkg validate-all [--root <path>] [--force]",
  ].join("\n");
}

export function runCli(argv) {
  const { positionals, options } = parseOptions(argv);
  const [command, subcommand, value] = positionals;

  if (!command || command === "help" || command === "--help") {
    return usage();
  }

  if (command === "init") {
    const result = initPackage(rootFrom(options), {
      name: options.name,
      force: options.force === true,
    });
    return `Initialized ${result.manifestPath}`;
  }

  if (command === "import") {
    if (!subcommand) {
      throw new Error("Missing contribution directory.");
    }
    const result = importPackage(rootFrom(options), resolve(subcommand), {
      name: options.name,
      force: options.force === true,
    });
    return `Imported ${result.filesCopied} source files and compiled ${result.filesCompiled} GitHub Copilot files.`;
  }

  if (command === "create" && subcommand === "agent") {
    if (!value) {
      throw new Error("Missing agent name.");
    }
    const result = createAgent(rootFrom(options), {
      agentName: value,
      skillName: options.skill,
      description: options.description,
      domain: options.domain,
      verification: options.verification,
      force: options.force === true,
      withCopilot: options["with-copilot"] === true,
    });
    const lines = [`Created agent package source for ${result.agentName}.`];
    if (result.authoringPromptPath) {
      lines.push(`Copilot authoring prompt: ${result.authoringPromptPath}`);
    }
    return lines.join("\n");
  }

  if (command === "compile") {
    const result = compilePackage(rootFrom(options), {
      force: options.force === true,
    });
    return `Compiled ${result.files.length} GitHub Copilot files.`;
  }

  if (command === "install") {
    if (!subcommand) {
      throw new Error("Missing package directory.");
    }
    const result = installPackage(rootFrom(options), resolve(subcommand), {
      force: options.force === true,
    });
    return `Installed ${result.filesCopied} source files and compiled ${result.filesCompiled} GitHub Copilot files.`;
  }

  if (command === "audit") {
    const result = auditPackage(rootFrom(options));
    return `Audit passed: ${result.filesChecked} managed files checked.`;
  }

  if (command === "validate-all") {
    const result = validateAllPackages(rootFrom(options), {
      force: options.force === true,
    });
    const packageNames = result.packages.map((entry) => entry.name).join(", ");
    const noun = result.packages.length === 1 ? "package" : "packages";
    const suffix = packageNames ? `: ${packageNames}` : ".";
    return `Validated ${result.packages.length} ${noun}${suffix}`;
  }

  throw new Error(`Unknown command: ${positionals.join(" ")}`);
}
