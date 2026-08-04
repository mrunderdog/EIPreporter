import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalProposalRelativePath,
  officialRepoRoot,
  repositoryTypeForSourceRepo,
  safeDirectory,
} from "./source-resolver.ts";
import type { ProposalKind, SourceRepo } from "./types.ts";

export type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  url: string;
};

export type RepositorySource = {
  kind: ProposalKind;
  owner: "ethereum";
  repo: "EIPs" | "ercs";
  sourceRepo: SourceRepo;
};

export const REPOSITORIES: RepositorySource[] = [
  { kind: "EIP", owner: "ethereum", repo: "EIPs", sourceRepo: "ethereum/EIPs" },
  { kind: "ERC", owner: "ethereum", repo: "ercs", sourceRepo: "ethereum/ercs" },
];

export async function fetchDefaultBranch(source: RepositorySource, token?: string): Promise<string> {
  const response = await fetchJson<{ default_branch: string }>(
    `https://api.github.com/repos/${source.owner}/${source.repo}`,
    token,
  );

  if (!response.default_branch) {
    throw new Error(`GitHub repository metadata did not include default_branch for ${source.sourceRepo}`);
  }

  return response.default_branch;
}

export async function fetchMarkdownDocuments(
  source: RepositorySource,
  token?: string,
): Promise<Array<{ path: string; branch: string; markdown: string }>> {
  const local = fetchLocalMarkdownDocuments(source);
  if (local.length > 0) return local;

  const branch = await fetchDefaultBranch(source, token);
  const tree = await fetchJson<{ tree: GitHubTreeItem[]; truncated: boolean }>(
    `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );

  if (tree.truncated) {
    throw new Error(`${source.sourceRepo} tree response was truncated by GitHub`);
  }

  const markdownFiles = tree.tree
    .filter((item) => item.type === "blob")
    .filter((item) => isProposalMarkdownPath(source.kind, item.path));

  const documents = await mapWithConcurrency(markdownFiles, 8, async (file) => ({
      path: file.path,
      branch,
      markdown: await fetchText(
        buildRawUrl(source, branch, file.path),
        token,
      ),
    }));

  return documents;
}

export function officialRepoPath(source: RepositorySource | SourceRepo): string | undefined {
  const sourceRepo = typeof source === "string" ? source : source.sourceRepo;
  return officialRepoRoot(repositoryTypeForSourceRepo(sourceRepo));
}

function fetchLocalMarkdownDocuments(source: RepositorySource): Array<{ path: string; branch: string; markdown: string }> {
  const repoPath = officialRepoPath(source);
  if (!repoPath) return [];
  const branch = localGitBranch(repoPath);
  return walkFiles(repoPath)
    .map((path) => path.replace(/\\/g, "/"))
    .filter((path) => isProposalMarkdownPath(source.kind, path))
    .map((path) => ({
      path,
      branch,
      markdown: readFileSync(resolve(repoPath, path), "utf8"),
    }));
}

function localGitBranch(repoPath: string): string {
  try {
    return execFileSync("git", ["-c", `safe.directory=${safeDirectory(repoPath)}`, "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

function walkFiles(root: string, relative = ""): string[] {
  const directory = resolve(root, relative);
  const entries = readdirSync(directory);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry === ".git") continue;
    const child = relative ? `${relative}/${entry}` : entry;
    const full = resolve(root, child);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walkFiles(root, child));
    else if (stat.isFile()) files.push(child);
  }
  return files;
}

export function isProposalMarkdownPath(kind: ProposalKind, path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const match = /^(EIPS\/eip-(\d+)\.md|ERCS\/erc-(\d+)\.md)$/.exec(normalized);
  if (!match) return false;
  const number = match[2] ?? match[3]!;
  return normalized === canonicalProposalRelativePath(kind, number);
}

async function fetchJson<T>(url: string, token?: string): Promise<T> {
  const response = await fetchResponse(url, token);
  const body = await response.text();

  if (!response.ok) {
    throw createGitHubFetchError(url, response.status, body);
  }

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw createGitHubFetchError(url, response.status, body, error);
  }
}

async function fetchText(url: string, token?: string): Promise<string> {
  const response = await fetchResponse(url, token);
  const body = await response.text();

  if (!response.ok) {
    throw createGitHubFetchError(url, response.status, body);
  }

  return body;
}

async function fetchResponse(url: string, token?: string): Promise<Response> {
  try {
    return await fetch(url, { headers: requestHeaders(token) });
  } catch (error) {
    throw createGitHubFetchError(url, undefined, "", error);
  }
}

function requestHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "EIPreporter",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildRawUrl(source: RepositorySource, branch: string, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${encodeURIComponent(branch)}/${encodedPath}`;
}

function createGitHubFetchError(
  url: string,
  status: number | undefined,
  body: string,
  cause?: unknown,
): Error {
  const bodyPreview = body ? body.slice(0, 500) : "<no response body>";
  const message = [
    "GitHub fetch failed",
    `URL: ${url}`,
    `Status: ${status ?? "<unavailable>"}`,
    `Response body (first 500 chars): ${bodyPreview}`,
  ].join("\n");

  return new Error(message, { cause });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
