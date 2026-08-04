import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  canonicalProposalRelativePath,
  isExactCaseFile,
  repositoryHealth,
  resolveOfficialProposalSource,
} from "../src/source-resolver.ts";

test("canonical proposal source paths use exact official Linux case", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-source-case-"));
  const originalEip = process.env.EIP_OFFICIAL_REPO_PATH;
  const originalErc = process.env.ERC_OFFICIAL_REPO_PATH;
  t.after(() => {
    restoreEnv("EIP_OFFICIAL_REPO_PATH", originalEip);
    restoreEnv("ERC_OFFICIAL_REPO_PATH", originalErc);
    rmSync(directory, { recursive: true, force: true });
  });

  const eipRoot = join(directory, "EIPs");
  const ercRoot = join(directory, "ERCs");
  mkdirSync(join(eipRoot, "EIPS"), { recursive: true });
  mkdirSync(join(ercRoot, "ERCS"), { recursive: true });
  writeFileSync(join(eipRoot, "EIPS", "eip-8141.md"), "EIP", "utf8");
  writeFileSync(join(ercRoot, "ERCS", "erc-8286.md"), "ERC", "utf8");
  process.env.EIP_OFFICIAL_REPO_PATH = eipRoot;
  process.env.ERC_OFFICIAL_REPO_PATH = ercRoot;

  assert.equal(canonicalProposalRelativePath("EIP", 8141), "EIPS/eip-8141.md");
  assert.equal(canonicalProposalRelativePath("ERC", 8286), "ERCS/erc-8286.md");
  assert.deepEqual(resolveOfficialProposalSource("EIP-8141"), {
    repositoryType: "EIP",
    repositoryRoot: resolve(eipRoot),
    relativePath: "EIPS/eip-8141.md",
  });
  assert.deepEqual(resolveOfficialProposalSource("ERC-8286"), {
    repositoryType: "ERC",
    repositoryRoot: resolve(ercRoot),
    relativePath: "ERCS/erc-8286.md",
  });
  assert.equal(isExactCaseFile(eipRoot, "EIPS/eip-8141.md"), true);
  assert.equal(isExactCaseFile(eipRoot, "EIPs/eip-8141.md"), false);
  assert.equal(isExactCaseFile(ercRoot, "ERCS/erc-8286.md"), true);
  assert.equal(isExactCaseFile(ercRoot, "ERCs/erc-8286.md"), false);
});

test("repository health detects full and shallow official repositories", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-source-health-"));
  const originalEip = process.env.EIP_OFFICIAL_REPO_PATH;
  t.after(() => {
    restoreEnv("EIP_OFFICIAL_REPO_PATH", originalEip);
    rmSync(directory, { recursive: true, force: true });
  });

  const sourceRepo = join(directory, "source");
  mkdirSync(join(sourceRepo, "EIPS"), { recursive: true });
  git(sourceRepo, "init");
  git(sourceRepo, "config", "user.email", "test@example.com");
  git(sourceRepo, "config", "user.name", "Test");
  writeFileSync(join(sourceRepo, "EIPS", "eip-1.md"), "---\neip: 1\nstatus: Draft\n---\n", "utf8");
  git(sourceRepo, "add", ".");
  git(sourceRepo, "commit", "-m", "add eip 1");
  writeFileSync(join(sourceRepo, "EIPS", "eip-2.md"), "---\neip: 2\nstatus: Draft\n---\n", "utf8");
  git(sourceRepo, "add", ".");
  git(sourceRepo, "commit", "-m", "add eip 2");

  process.env.EIP_OFFICIAL_REPO_PATH = sourceRepo;
  const full = repositoryHealth("EIP");
  assert.equal(full.isGitWorktree, true);
  assert.equal(full.isShallow, false);
  assert.equal(full.healthy, true);
  assert.equal(full.proposalFileCount, 2);

  const shallowRepo = join(directory, "shallow");
  execFileSync("git", ["clone", "--depth", "1", `file://${sourceRepo.replace(/\\/g, "/")}`, shallowRepo], { stdio: "ignore" });
  process.env.EIP_OFFICIAL_REPO_PATH = shallowRepo;
  const shallow = repositoryHealth("EIP");
  assert.equal(shallow.isGitWorktree, true);
  assert.equal(shallow.isShallow, true);
  assert.equal(shallow.healthy, false);
  assert.ok(shallow.errors.includes("shallow repository detected"));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

