import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ProposalKind, SourceRepo } from "./types.ts";

export type RepositoryType = "EIP" | "ERC";

export type OfficialProposalSource = {
  repositoryType: RepositoryType;
  repositoryRoot: string;
  relativePath: string;
};

export type RepositoryHealth = {
  repositoryType: RepositoryType;
  repositoryRoot: string | null;
  configured: boolean;
  exists: boolean;
  isGitWorktree: boolean;
  isShallow: boolean | null;
  commitCount: number | null;
  oldestCommit: string | null;
  newestCommit: string | null;
  proposalFileCount: number;
  healthy: boolean;
  errors: string[];
};

export function repositoryTypeForSourceRepo(sourceRepo: SourceRepo): RepositoryType {
  return sourceRepo === "ethereum/EIPs" ? "EIP" : "ERC";
}

export function sourceRepoForRepositoryType(repositoryType: RepositoryType): SourceRepo {
  return repositoryType === "EIP" ? "ethereum/EIPs" : "ethereum/ercs";
}

export function envNameForRepositoryType(repositoryType: RepositoryType): string {
  return repositoryType === "EIP" ? "EIP_OFFICIAL_REPO_PATH" : "ERC_OFFICIAL_REPO_PATH";
}

export function configuredOfficialRepoPath(repositoryType: RepositoryType): string | undefined {
  const value = process.env[envNameForRepositoryType(repositoryType)];
  return value ? resolve(value) : undefined;
}

export function defaultOfficialRepoPath(repositoryType: RepositoryType): string {
  return repositoryType === "EIP"
    ? resolve("data", "ethereum-EIPs")
    : resolve("data", "ethereum-ERCs");
}

export function officialRepoRoot(repositoryType: RepositoryType): string | undefined {
  const configured = configuredOfficialRepoPath(repositoryType);
  if (configured !== undefined) return existsSync(configured) ? configured : undefined;
  const fallback = defaultOfficialRepoPath(repositoryType);
  return existsSync(fallback) ? fallback : undefined;
}

export function canonicalProposalRelativePath(repositoryType: RepositoryType, number: number | string): string {
  const numeric = String(number).replace(/^0+/, "") || "0";
  return repositoryType === "EIP"
    ? `EIPS/eip-${numeric}.md`
    : `ERCS/erc-${numeric}.md`;
}

export function resolveOfficialProposalSource(proposalId: string): OfficialProposalSource | null {
  const match = /^(EIP|ERC)-(\d+)$/i.exec(proposalId.trim());
  if (!match) return null;
  const repositoryType = match[1]!.toUpperCase() as RepositoryType;
  const repositoryRoot = officialRepoRoot(repositoryType);
  if (!repositoryRoot) return null;
  return {
    repositoryType,
    repositoryRoot,
    relativePath: canonicalProposalRelativePath(repositoryType, match[2]!),
  };
}

export function isExactCaseFile(root: string, relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  let current = resolve(root);
  for (const part of parts) {
    if (!existsSync(current) || !statSync(current).isDirectory()) return false;
    const entries = readdirSync(current);
    if (!entries.includes(part)) return false;
    current = resolve(current, part);
  }
  return existsSync(current) && statSync(current).isFile();
}

export function repositoryHealth(repositoryType: RepositoryType): RepositoryHealth {
  const configuredPath = configuredOfficialRepoPath(repositoryType);
  const root = configuredPath ?? officialRepoRoot(repositoryType) ?? defaultOfficialRepoPath(repositoryType);
  const errors: string[] = [];
  const exists = existsSync(root);
  const configured = configuredPath !== undefined;
  let isGitWorktree = false;
  let isShallow: boolean | null = null;
  let commitCount: number | null = null;
  let oldestCommit: string | null = null;
  let newestCommit: string | null = null;
  let proposalFileCount = 0;

  if (!exists) {
    errors.push(`repository path does not exist: ${root}`);
  } else {
    isGitWorktree = gitText(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
    if (!isGitWorktree) errors.push("not a git worktree");
    isShallow = gitText(root, ["rev-parse", "--is-shallow-repository"]) === "true";
    if (isShallow) errors.push("shallow repository detected");
    commitCount = Number(gitText(root, ["rev-list", "--count", "HEAD"])) || null;
    oldestCommit = gitText(root, ["log", "--reverse", "-1", "--format=%cI"]) || null;
    newestCommit = gitText(root, ["log", "-1", "--format=%cI"]) || null;
    proposalFileCount = countProposalFiles(root, repositoryType);
    if (proposalFileCount === 0) errors.push(`no ${repositoryType === "EIP" ? "EIPS" : "ERCS"}/*.md files found`);
  }

  return {
    repositoryType,
    repositoryRoot: exists ? root : null,
    configured,
    exists,
    isGitWorktree,
    isShallow,
    commitCount,
    oldestCommit,
    newestCommit,
    proposalFileCount,
    healthy: exists && isGitWorktree && isShallow === false && proposalFileCount > 0,
    errors,
  };
}

export function assertHealthyConfiguredRepositories(): RepositoryHealth[] {
  const checks = (["EIP", "ERC"] as const)
    .filter((type) => configuredOfficialRepoPath(type) !== undefined)
    .map(repositoryHealth);
  const failed = checks.filter((check) => !check.healthy);
  if (failed.length) {
    throw new Error([
      "Configured official repository health check failed.",
      ...failed.map((check) =>
        `${check.repositoryType}: root=${check.repositoryRoot ?? configuredOfficialRepoPath(check.repositoryType) ?? "missing"}; shallow=${check.isShallow}; commits=${check.commitCount}; errors=${check.errors.join(", ")}`,
      ),
    ].join("\n"));
  }
  return checks;
}

export function availableOfficialRepositoryHealth(): RepositoryHealth[] {
  return (["EIP", "ERC"] as const)
    .map(repositoryHealth)
    .filter((health) => health.exists);
}

function gitText(root: string, args: string[]): string {
  try {
    return execFileSync("git", ["-c", `safe.directory=${safeDirectory(root)}`, "-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function safeDirectory(path: string): string {
  return resolve(path).replace(/\\/g, "/");
}

function countProposalFiles(root: string, repositoryType: RepositoryType): number {
  const directory = resolve(root, repositoryType === "EIP" ? "EIPS" : "ERCS");
  if (!existsSync(directory)) return 0;
  const pattern = repositoryType === "EIP" ? /^eip-\d+\.md$/ : /^erc-\d+\.md$/;
  return readdirSync(directory).filter((entry) => pattern.test(entry)).length;
}
