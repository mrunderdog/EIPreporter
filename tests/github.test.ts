import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  fetchDefaultBranch,
  fetchMarkdownDocuments,
  type RepositorySource,
} from "../src/github.ts";

const SOURCE: RepositorySource = {
  kind: "EIP",
  owner: "ethereum",
  repo: "EIPs",
  sourceRepo: "ethereum/EIPs",
};

test("fetches and uses the repository default branch with a User-Agent", async (t) => {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalPath = process.env.EIP_OFFICIAL_REPO_PATH;
  process.env.EIP_OFFICIAL_REPO_PATH = join(tmpdir(), "missing-eip-source");
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalPath === undefined) delete process.env.EIP_OFFICIAL_REPO_PATH;
    else process.env.EIP_OFFICIAL_REPO_PATH = originalPath;
  });

  globalThis.fetch = async (input, init) => {
    const url = input.toString();
    urls.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("User-Agent"), "EIPreporter");

    if (urls.length === 1) {
      return Response.json({ default_branch: "stable" });
    }

    if (urls.length === 2) {
      return Response.json({
        tree: [{ path: "EIPS/eip-1.md", type: "blob", url: "unused" }],
        truncated: false,
      });
    }

    return new Response("---\neip: 1\n---\n");
  };

  const documents = await fetchMarkdownDocuments(SOURCE);

  assert.deepEqual(urls, [
    "https://api.github.com/repos/ethereum/EIPs",
    "https://api.github.com/repos/ethereum/EIPs/git/trees/stable?recursive=1",
    "https://raw.githubusercontent.com/ethereum/EIPs/stable/EIPS/eip-1.md",
  ]);
  assert.equal(documents[0]?.branch, "stable");
});

test("uses local official source checkout before GitHub API", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-official-source-"));
  const original = process.env.EIP_OFFICIAL_REPO_PATH;
  const originalFetch = globalThis.fetch;
  t.after(() => {
    if (original === undefined) delete process.env.EIP_OFFICIAL_REPO_PATH;
    else process.env.EIP_OFFICIAL_REPO_PATH = original;
    globalThis.fetch = originalFetch;
    rmSync(directory, { recursive: true, force: true });
  });
  mkdirSync(join(directory, "EIPS"), { recursive: true });
  writeFileSync(join(directory, "EIPS", "eip-8286.md"), "---\neip: 8286\ntitle: Modular Accounts for Frame Transactions\nstatus: Draft\n---\n\n## Abstract\nLocal body.\n", "utf8");
  process.env.EIP_OFFICIAL_REPO_PATH = directory;
  globalThis.fetch = async () => {
    throw new Error("GitHub API should not be called when local source exists");
  };

  const documents = await fetchMarkdownDocuments(SOURCE);

  assert.equal(documents.length, 1);
  assert.equal(documents[0]?.path, "EIPS/eip-8286.md");
  assert.match(documents[0]?.markdown ?? "", /Local body/);
});

test("does not require a GitHub token", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), null);
    return Response.json({ default_branch: "main" });
  };

  const branch = await fetchDefaultBranch(SOURCE);

  assert.equal(branch, "main");
});

test("reports URL, unavailable status, body state, and cause for network failures", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(fetchDefaultBranch(SOURCE), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /URL: https:\/\/api\.github\.com\/repos\/ethereum\/EIPs/);
    assert.match(error.message, /Status: <unavailable>/);
    assert.match(error.message, /Response body .*: <no response body>/);
    assert.equal((error.cause as Error).message, "fetch failed");
    assert.ok(error.stack);
    return true;
  });
});

test("reports HTTP status and a bounded response body preview", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => new Response("x".repeat(600), { status: 403 });

  await assert.rejects(fetchDefaultBranch(SOURCE), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Status: 403/);
    assert.match(error.message, new RegExp(`Response body .*: ${"x".repeat(500)}$`));
    assert.doesNotMatch(error.message, new RegExp("x".repeat(501)));
    return true;
  });
});
