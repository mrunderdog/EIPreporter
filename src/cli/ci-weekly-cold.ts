import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const repoRoot = resolve(".");
const coldRoot = mkdtempSync(join(tmpdir(), "eipreporter-weekly-cold-"));

copyColdWorkspace(repoRoot, coldRoot);

const env = {
  ...process.env,
  EIP_OFFICIAL_REPO_PATH: resolveOfficialSourcePath("EIP_OFFICIAL_REPO_PATH", ".sources/EIPs"),
  ERC_OFFICIAL_REPO_PATH: resolveOfficialSourcePath("ERC_OFFICIAL_REPO_PATH", ".sources/ERCs"),
};

console.log(`Cold weekly workspace: ${coldRoot}`);
const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : npmCommand;
const commandArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", `${npmCommand} run weekly:ci`]
  : ["run", "weekly:ci"];
const result = spawnSync(command, commandArgs, {
  cwd: coldRoot,
  env,
  shell: false,
  stdio: "inherit",
});

if (process.env.EIPREPORTER_KEEP_COLD_WORKSPACE !== "1") {
  rmSync(coldRoot, { recursive: true, force: true });
} else {
  console.log(`Preserved cold weekly workspace: ${coldRoot}`);
}

process.exit(result.status ?? 1);

function copyColdWorkspace(sourceRoot: string, targetRoot: string): void {
  for (const entry of [
    ".github",
    "docs",
    "src",
    "tests",
    "node_modules",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "README.md",
    "AGENTS.md",
    "DESIGN.md",
    "DESIGN_REFERENCES.md",
  ]) {
    const source = join(sourceRoot, entry);
    if (!existsSync(source)) continue;
    cpSync(source, join(targetRoot, basename(entry)), {
      recursive: true,
      force: true,
      verbatimSymlinks: false,
    });
  }
}

function resolveOfficialSourcePath(envName: string, fallback: string): string {
  const configured = process.env[envName];
  if (configured) return resolve(configured);
  return resolve(fallback);
}
