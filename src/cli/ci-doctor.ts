import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { getConfig, parseArgs, resolveDatabasePath } from "../config.ts";
import {
  canonicalProposalRelativePath,
  configuredOfficialRepoPath,
  isExactCaseFile,
  repositoryHealth,
} from "../source-resolver.ts";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config = getConfig();
  const databasePath = resolveDatabasePath(args);
  const health = [repositoryHealth("EIP"), repositoryHealth("ERC")];
  const cachePaths = [
    databasePath,
    resolve("data", "historical-git-cache.json"),
    resolve("data", "adoption-evidence-cache.json"),
  ];

  console.log(`platform=${process.platform}`);
  console.log(`node=${process.version}`);
  console.log(`EIP_OFFICIAL_REPO_PATH=${configuredOfficialRepoPath("EIP") ?? "<unset>"}`);
  console.log(`ERC_OFFICIAL_REPO_PATH=${configuredOfficialRepoPath("ERC") ?? "<unset>"}`);
  for (const item of health) {
    console.log(`${item.repositoryType}.repositoryRoot=${item.repositoryRoot ?? "<missing>"}`);
    console.log(`${item.repositoryType}.exists=${item.exists}`);
    console.log(`${item.repositoryType}.isGitWorktree=${item.isGitWorktree}`);
    console.log(`${item.repositoryType}.isShallow=${item.isShallow}`);
    console.log(`${item.repositoryType}.commitCount=${item.commitCount ?? 0}`);
    console.log(`${item.repositoryType}.oldestCommit=${item.oldestCommit ?? "<unknown>"}`);
    console.log(`${item.repositoryType}.newestCommit=${item.newestCommit ?? "<unknown>"}`);
    console.log(`${item.repositoryType}.${item.repositoryType === "EIP" ? "EIPS" : "ERCS"}MdCount=${item.proposalFileCount}`);
  }
  for (const sample of [
    ["EIP", "8141"],
    ["ERC", "8286"],
    ["ERC", "8330"],
  ] as const) {
    const root = health.find((item) => item.repositoryType === sample[0])?.repositoryRoot;
    const relativePath = canonicalProposalRelativePath(sample[0], sample[1]);
    console.log(`sample.${sample[0]}-${sample[1]}.relativePath=${relativePath}`);
    console.log(`sample.${sample[0]}-${sample[1]}.existsExactCase=${root ? isExactCaseFile(root, relativePath) : false}`);
  }
  console.log(`databasePath=${databasePath}`);
  for (const cachePath of cachePaths) {
    console.log(`cache.${cachePath}.exists=${existsSync(cachePath)}`);
    console.log(`cache.${cachePath}.size=${existsSync(cachePath) ? statSync(cachePath).size : 0}`);
  }
  console.log(`sourceMode=${health.some((item) => item.exists && item.healthy) ? "local_git" : "github_api"}`);
  console.log(`githubTokenPresent=${Boolean(config.githubToken)}`);

  const failures = health
    .filter((item) => item.configured && !item.healthy)
    .map((item) => `${item.repositoryType}: ${item.errors.join(", ")}`);
  if (failures.length) {
    throw new Error(`CI source doctor failed:\n${failures.join("\n")}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
