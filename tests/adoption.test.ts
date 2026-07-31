import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  adoptionSearchRepos,
  adoptionSearchTerms,
  buildAdoptionLayerWithGithubSearch,
  buildGithubSearchQueries,
} from "../src/adoption.ts";
import { generateWeeklyHtml } from "../src/html-report.ts";
import { buildNarrativeLayer } from "../src/narrative.ts";
import type { AdoptionEvidenceItem, ThemeInsight, WatchlistItem, WeeklyRadarReport } from "../src/types.ts";

const tempDirectories: string[] = [];
process.once("exit", () => {
  for (const directory of tempDirectories) rmSync(directory, { recursive: true, force: true });
});

test("GitHub evidence collection skips safely without GITHUB_TOKEN", async () => {
  const report = makeReport();
  const layer = await buildAdoptionLayerWithGithubSearch(report, {
    token: "",
    cachePath: tempCachePath(),
  });

  assert.equal(layer.collectionStatus, "skipped");
  assert.equal(layer.note, "GitHub evidence collection skipped because GITHUB_TOKEN is not configured.");
  assert.equal(layer.items.length, 1);
  assert.equal(layer.items[0]?.proposalId, "EIP-8141");
  assert.equal(layer.items[0]?.evidenceLevel, "Unknown");
});

test("GitHub search query builder includes EIP-8141, Frame Transaction, and related proposal ids", () => {
  const report = makeReport();
  const item = report.ethereumTechRadar.watchlistLayer!.items[0]!;
  const terms = adoptionSearchTerms(report, item);
  const queries = buildGithubSearchQueries(report, item).join("\n");

  assert.deepEqual(terms, ["EIP-8141", "Frame Transaction", "EIP-8250", "EIP-8266", "EIP-8272", "EIP-8209"]);
  assert.match(queries, /"EIP-8141"/);
  assert.match(queries, /"Frame Transaction"/);
  assert.match(queries, /"EIP-8250"/);
  assert.match(queries, /"EIP-8266"/);
  assert.match(queries, /"EIP-8272"/);
  assert.match(queries, /"EIP-8209"/);
});

test("GitHub search is limited to top watchlist items", async () => {
  const urls: string[] = [];
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(4), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      urls.push(url);
      return { items: [] };
    }),
  });

  assert.equal(layer.items.length, 3);
  assert.ok(urls.some((url) => decodeURIComponent(url).includes("EIP-8141")));
  assert.ok(urls.some((url) => decodeURIComponent(url).includes("EIP-9001")));
  assert.ok(urls.some((url) => decodeURIComponent(url).includes("EIP-9002")));
  assert.equal(urls.some((url) => decodeURIComponent(url).includes("EIP-9003")), false);
});

test("GitHub search is scoped to configured and default repos", () => {
  assert.deepEqual(adoptionSearchRepos("ethereum/go-ethereum,ethereum/EIPs"), ["ethereum/go-ethereum", "ethereum/EIPs"]);

  const query = buildGithubSearchQueries(makeReport(), makeReport().ethereumTechRadar.watchlistLayer!.items[0]!, "ethereum/go-ethereum,ethereum/EIPs")[0]!;
  assert.match(query, /repo:ethereum\/go-ethereum/);
  assert.match(query, /repo:ethereum\/EIPs/);

  const defaultQuery = buildGithubSearchQueries(makeReport(), makeReport().ethereumTechRadar.watchlistLayer!.items[0]!)[0]!;
  assert.match(defaultQuery, /repo:ethereum\/execution-specs/);
  assert.match(defaultQuery, /repo:ethereum\/consensus-specs/);
});

test("GitHub search queries use distinct issue, PR, and code qualifiers", () => {
  const report = makeReport();
  const item = report.ethereumTechRadar.watchlistLayer!.items[0]!;
  const [issueQuery, prQuery, codeQuery] = buildGithubSearchQueries(report, item, "ethereum/EIPs");

  assert.match(issueQuery!, /\bis:issue\b/);
  assert.doesNotMatch(issueQuery!, /\bis:pull-request\b/);
  assert.match(prQuery!, /\bis:pull-request\b/);
  assert.doesNotMatch(prQuery!, /\bis:issue\b/);
  assert.doesNotMatch(codeQuery!, /\bis:(issue|pull-request)\b/);
});

test("GitHub issue and PR searches never call /search/issues without a qualifier", async () => {
  const urls: string[] = [];
  await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      urls.push(decodeURIComponent(url));
      return { items: [] };
    }),
  });

  const issueSearchUrls = urls.filter((url) => url.includes("/search/issues"));
  assert.ok(issueSearchUrls.length > 0);
  assert.ok(issueSearchUrls.every((url) => /\bis:(issue|pull-request)\b/.test(url)));
});

test("mock GitHub issue result classifies as Mention or Reference, not Implementation", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues")
      ? { items: [issueResult("EIP-8141 agenda mention")] }
      : { items: [] }),
  });
  const item = layer.items[0]!;

  assert.match(["Mention", "Reference"].join("|"), new RegExp(item.evidenceLevel));
  assert.notEqual(item.evidenceLevel, "Implementation");
  assert.equal(item.sources[0]?.sourceType, "github_issue");
});

test("GitHub issue reference source produces Reference item classification", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues") && decodeURIComponent(url).includes("is:issue")
      ? { items: [issueResult("EIP-8141 Implementation Tracker: Frame Transaction", 2829, "ethereum/execution-specs")] }
      : { items: [] }),
  });
  const item = layer.items[0]!;

  assert.equal(item.evidenceScore, 35);
  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.sources[0]?.evidenceKind, "reference");
  assert.equal(item.sources[0]?.semanticType, "implementation_tracker");
  assert.equal(item.sources[0]?.relationship, "direct");
  assert.match(item.summary, /Implementation tracking references were found, but no verified client implementation or production support was identified/);
});

test("body-only target match is incidental and ignored", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues") && decodeURIComponent(url).includes("is:issue")
      ? { items: [{
        ...(issueResult("Broad execution agenda", 1, "ethereum/pm") as Record<string, unknown>),
        body: "Includes EIP-8141 in a generated agenda list.",
      }] }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("mock GitHub PR result classifies conservatively", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues")
      ? { items: [prResult("Discuss EIP-8141 planning reference")] }
      : { items: [] }),
  });
  const item = layer.items[0]!;

  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.sources[0]?.sourceType, "github_pr");
  assert.equal(item.sources[0]?.evidenceKind, "reference");
});

test("mock code reference can classify as Implementation evidence", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("core/types/eip-8141-frame-tx.go")] }
      : { items: [] }),
  });
  const item = layer.items[0]!;

  assert.equal(item.evidenceLevel, "Implementation");
  assert.equal(item.sources[0]?.sourceType, "code_reference");
  assert.equal(item.sources[0]?.evidenceKind, "implementation");
});

test("merged external reference PR does not upgrade to Implementation evidence", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues") && decoded.includes("is:pull-request")) {
        return { items: [externalPrResult("Document EIP-8141 planning reference", 12, true)] };
      }
      return { items: [] };
    }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.evidenceScore, 25);
  assert.equal(item.sources[0]?.state, "merged");
  assert.equal(item.sources[0]?.evidenceKind, "reference");
});

test("release note must match the target before it can become evidence", async () => {
  const referenceLayer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("CHANGELOG.md")] }
      : { items: [] }),
  });
  const implementationLayer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("CHANGELOG-eip-8141-support.md")] }
      : { items: [] }),
  });

  assert.equal(referenceLayer.items[0]?.evidenceLevel, "None");
  assert.equal(referenceLayer.items[0]?.sources.length, 0);
  assert.equal(implementationLayer.items[0]?.evidenceLevel, "Implementation");
  assert.equal(implementationLayer.items[0]?.sources[0]?.sourceType, "release_note");
  assert.equal(implementationLayer.items[0]?.sources[0]?.evidenceKind, "implementation");
});

test("test fixture and generated code paths are ignored as low relevance", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("tests/fixtures/eip-8141-frame-transaction.json"), codeResult("generated/eip-8141.ts")] }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("83 raw canonical PR results do not automatically become evidence", async () => {
  const rawPrs = Array.from({ length: 83 }, (_, index) => prResult("Add EIP-8141 proposal", index + 1));
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues") && decoded.includes("is:pull-request")) return { total_count: 83, items: rawPrs };
      if (decoded.includes("/pulls/") && decoded.includes("/files")) return [{ filename: "EIPS/eip-8141.md" }];
      return { items: [] };
    }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("canonical EIP file code result is ignored", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("EIPS/eip-8141.md", "ethereum/EIPs")] }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("cross-proposal canonical EIP code result is ignored", async () => {
  const report = makeReport();
  report.ethereumTechRadar.watchlistLayer!.items[0] = {
    ...report.ethereumTechRadar.watchlistLayer!.items[0]!,
    title: "EIP-8134 follow-through",
    theme: "Network Upgrade / Governance",
    relatedProposals: ["EIP-8134"],
  };
  report.ethereumTechRadar.themeInsights = [theme("Network Upgrade / Governance", 47, ["EIP-8134"])];

  const layer = await buildAdoptionLayerWithGithubSearch(report, {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("EIPS/eip-8135.md", "ethereum/EIPs")] }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.proposalId, "EIP-8134");
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("canonical EIP repo PR is not Implementation evidence", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues") && decoded.includes("is:pull-request")) return { items: [prResult("Clarify EIP-8141 process reference", 42)] };
      if (decoded.includes("/pulls/42/files")) return [{ filename: "EIPS/eip-8141.md" }];
      return { items: [] };
    }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.sources[0]?.repo, "ethereum/EIPs");
  assert.equal(item.sources[0]?.evidenceKind, "reference");
});

test("cross-proposal EIP repo PR is ignored as low relevance", async () => {
  const report = makeReport();
  report.ethereumTechRadar.watchlistLayer!.items[0] = {
    ...report.ethereumTechRadar.watchlistLayer!.items[0]!,
    title: "EIP-8163 follow-through",
    theme: "EVM / Gas / Opcode",
    relatedProposals: ["EIP-8163"],
  };
  report.ethereumTechRadar.themeInsights = [theme("EVM / Gas / Opcode", 40, ["EIP-8163"])];

  const layer = await buildAdoptionLayerWithGithubSearch(report, {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues") && decoded.includes("is:pull-request")) return { items: [prResult("Update EIP-7773: Update upgrade stages", 99)] };
      if (decoded.includes("/pulls/99/files")) return [{ filename: "EIPS/eip-7773.md" }];
      return { items: [] };
    }),
  });

  const item = layer.items[0]!;
  assert.equal(item.proposalId, "EIP-8163");
  assert.equal(item.evidenceLevel, "None");
  assert.equal(item.sources.length, 0);
});

test("canonical EIP repo PR inferred from URL is not Implementation evidence", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues") && decoded.includes("is:pull-request")) {
        return { items: [prResultWithoutRepo("Implement EIP-8141 generated metadata update", 77)] };
      }
      return { items: [] };
    }),
  });

  const item = layer.items[0]!;
  assert.notEqual(item.evidenceLevel, "Implementation");
  assert.notEqual(item.sources[0]?.evidenceKind, "implementation");
});


test("duplicate PR and code results are deduplicated", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/code")
      ? { items: [codeResult("core/types/eip-8141-frame-tx.go"), codeResult("core/types/eip-8141-frame-tx.go")] }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "Implementation");
  assert.equal(item.sources.length, 1);
});

test("duplicate same-repo issue titles are deduplicated even with different URLs", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues") && decodeURIComponent(url).includes("is:issue")
      ? {
        items: [
          issueResult("EIP-8141 Implementation Tracker: Frame Transaction", 2829, "ethereum/execution-specs"),
          issueResult("EIP-8141 Implementation Tracker: Frame Transaction", 2568, "ethereum/execution-specs"),
        ],
      }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.sources.length, 1);
  assert.equal(item.acceptedSourceCount, 1);
  assert.equal(item.retainedSourceCount, 1);
});

test("open recent implementation tracker is preferred over old closed duplicate", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues") && decodeURIComponent(url).includes("is:issue")
      ? {
        items: [
          issueResult("EIP-8141 Implementation Tracker: Frame Transaction", 2568, "ethereum/execution-specs", "closed", "2026-06-01T00:00:00Z"),
          issueResult("EIP-8141 Implementation Tracker: Frame Transaction", 2829, "ethereum/execution-specs", "open", "2026-07-18T00:00:00Z"),
        ],
      }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.sources.length, 1);
  assert.equal(item.sources[0]?.state, "open");
  assert.equal(item.sources[0]?.updatedAt, "2026-07-18T00:00:00Z");
  assert.match(item.sources[0]?.url ?? "", /2829/);
});

test("accepted source count can exceed retained rendered sources", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => decodeURIComponent(url).includes("/search/issues") && decodeURIComponent(url).includes("is:issue")
      ? {
        items: Array.from({ length: 7 }, (_, index) =>
          issueResult(`EIP-8141 planning reference ${index + 1}`, index + 1, "ethereum/pm")
        ),
      }
      : { items: [] }),
  });

  const item = layer.items[0]!;
  assert.equal(item.evidenceLevel, "Reference");
  assert.equal(item.acceptedSourceCount, 7);
  assert.equal(item.retainedSourceCount, 5);
  assert.equal(item.sources.length, 5);
});

test("partial endpoint failure still returns collected evidence", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch((url) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("/search/issues")) return new Response(JSON.stringify({ message: "failed" }), { status: 500 });
      if (decoded.includes("/search/code")) return { items: [codeResult("core/types/eip-8141-frame-tx.go")] };
      return { items: [] };
    }),
  });

  assert.equal(layer.collectionStatus, "collected");
  assert.equal(layer.items[0]?.evidenceLevel, "Implementation");
  assert.equal(layer.sourceDiagnostics?.some((item) => item.result === "failure" && item.httpStatus === 500), true);
  assert.equal(layer.sourceDiagnostics?.some((item) => item.result === "success" || item.result === "empty"), true);
  assert.equal(layer.evidenceSummary?.implementation, 1);
  assert.equal(layer.items[0]?.sources[0]?.evidenceType, "implementation");
  assert.ok(layer.items[0]?.sources[0]?.directlySupportedClaim);
});

test("only all-endpoint failure produces total fallback", async () => {
  const layer = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch(() => new Response(JSON.stringify({ message: "failed" }), { status: 500 })),
  });

  assert.equal(layer.collectionStatus, "failed");
  assert.equal(layer.note, "GitHub evidence collection could not be completed for this run.");
  assert.equal(layer.items[0]?.evidenceLevel, "Unknown");
  assert.equal(layer.sourceDiagnostics?.[0]?.result, "failure");
  assert.match(layer.sourceDiagnostics?.[0]?.failureReason ?? "", /GitHub adoption search failed|rate limited/i);
});

test("source diagnostics distinguish empty result, malformed response, rate limit, and authentication failure", async () => {
  const empty = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch(() => ({ items: [] })),
  });
  assert.equal(empty.collectionStatus, "collected");
  assert.equal(empty.sourceDiagnostics?.every((item) => item.result === "empty"), true);

  const rateLimited = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch(() => new Response(JSON.stringify({ message: "rate limited" }), { status: 403, headers: { "x-ratelimit-remaining": "0" } })),
  });
  assert.equal(rateLimited.collectionStatus, "failed");
  assert.equal(rateLimited.sourceDiagnostics?.[0]?.result, "failure");
  assert.match(rateLimited.sourceDiagnostics?.[0]?.failureReason ?? "", /rate limited/i);

  const authFailed = await buildAdoptionLayerWithGithubSearch(makeReport(), {
    token: "test-token",
    cachePath: tempCachePath(),
    fetchImpl: mockFetch(() => new Response(JSON.stringify({ message: "bad credentials" }), { status: 401 })),
  });
  assert.equal(authFailed.collectionStatus, "failed");
  assert.equal(authFailed.sourceDiagnostics?.[0]?.httpStatus, 401);
});

test("fresh collected cache is preferred over same-scope failed cache", async () => {
  const originalBypass = process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE;
  delete process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE;
  const cachePath = tempCachePath();
  const report = { ...makeReport(3), generatedAt: "2026-07-21T00:00:00.000Z" };
  const repos = adoptionSearchRepos().join(",");
  const watchlist = "EIP-8141,EIP-8250,EIP-8266,EIP-8272,EIP-8209|EIP-9001|EIP-9002";
  const reorderedWatchlist = "EIP-9002|EIP-8209,EIP-8272,EIP-8266,EIP-8250,EIP-8141|EIP-9001";
  try {
    writeFileSync(cachePath, `${JSON.stringify({
      [JSON.stringify({ date: "2026-07-20", token: true, repos, watchlist: reorderedWatchlist })]: {
        cachedAt: "2026-07-20T12:00:00.000Z",
        status: "collected",
        layer: { generatedBy: "github_search", collectionStatus: "collected", items: [evidenceItem("Reference")] },
      },
      [JSON.stringify({ date: "2026-07-21", token: true, repos, watchlist })]: {
        cachedAt: "2026-07-21T00:00:00.000Z",
        status: "failed",
        layer: { generatedBy: "fallback", collectionStatus: "failed", items: [unknownItem()] },
      },
    }, null, 2)}\n`, "utf8");

    const layer = await buildAdoptionLayerWithGithubSearch(report, {
      token: "test-token",
      now: new Date("2026-07-21T00:30:00.000Z"),
      fetchImpl: async () => {
        throw new Error("cache should be used");
      },
      cachePath,
    });

    assert.equal(layer.collectionStatus, "collected");
    assert.equal(layer.items[0]?.evidenceLevel, "Reference");
  } finally {
    if (originalBypass === undefined) delete process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE;
    else process.env.EIPREPORTER_BYPASS_ADOPTION_CACHE = originalBypass;
  }
});

test("HTML keeps GitHub skipped diagnostics out of the end-user IA", () => {
  const report = makeReport();
  report.ethereumTechRadar.adoptionLayer = {
    generatedBy: "fallback",
    collectionStatus: "skipped",
    note: "GitHub evidence collection skipped because GITHUB_TOKEN is not configured.",
    items: [unknownItem()],
  };

  const html = generateWeeklyHtml(report);
  assert.match(html, /Executive Pulse/);
  assert.doesNotMatch(html, /GITHUB_TOKEN이 설정되지 않아 GitHub 근거 수집을 건너뛰었습니다/);
  assert.doesNotMatch(html, /[湲蹂理]|쨌|�/);
});

test("HTML renders mention, reference, and implementation evidence without saying adopted", () => {
  for (const evidenceLevel of ["Mention", "Reference", "Implementation"] as const) {
    const report = makeReport();
    report.ethereumTechRadar.adoptionLayer = {
      generatedBy: "github_search",
      collectionStatus: "collected",
      items: [evidenceItem(evidenceLevel)],
    };
    report.ethereumTechRadar.narrativeLayer = buildNarrativeLayer(report);
    const html = generateWeeklyHtml(report);
    const visibleHtml = html
      .replace(/<style>[\s\S]*?<\/style>/, "")
      .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
      .replace(/<script>[\s\S]*?<\/script>/, "");

    assert.match(html, /Executive Pulse|KGLD Technology Watch/);
    assert.doesNotMatch(visibleHtml, /\b(adopted|adoption across|implemented in production|client supports|production implementation|price impact|token price|market impact)\b/i);
    assert.doesNotMatch(html, /Goldstation/);
    assert.doesNotMatch(html, /Hana/i);
  }
});

test("HTML does not render adoption evidence chips as primary content", () => {
  const report = makeReport();
  report.ethereumTechRadar.adoptionLayer = {
    generatedBy: "github_search",
    collectionStatus: "collected",
    items: [evidenceItem("Reference")],
  };

  const html = generateWeeklyHtml(report);
  assert.match(html, /Proposal 근거 appendix/);
  assert.doesNotMatch(html, /외부 참조/);
});

test("HTML keeps accepted source counts in diagnostics rather than visible IA", () => {
  const report = makeReport();
  report.ethereumTechRadar.adoptionLayer = {
    generatedBy: "github_search",
    collectionStatus: "collected",
    items: [{
      ...evidenceItem("Reference"),
      acceptedSourceCount: 12,
      retainedSourceCount: 5,
    }],
  };

  const html = generateWeeklyHtml(report);
  const visibleHtml = stripEmbeddedPayloads(html);
  assert.doesNotMatch(visibleHtml, /채택된 출처/);
  assert.doesNotMatch(visibleHtml, /<span>채택된 출처<\/span><b>12<\/b>/);
  assert.doesNotMatch(visibleHtml, /보관\/표시/);
  assert.doesNotMatch(visibleHtml, /<span>보관\/표시<\/span><b>5<\/b>/);
  assert.doesNotMatch(visibleHtml, /<th>직접 근거<\/th>|직접 근거<\/dt>|직접 근거<\/span>/);
  assert.doesNotMatch(visibleHtml, /관련 출처: 12건/);
  assert.doesNotMatch(html, /Source count/);
});

test("HTML hides direct evidence tables and related cluster references", () => {
  const report = makeReport();
  report.ethereumTechRadar.adoptionLayer = {
    generatedBy: "github_search",
    collectionStatus: "collected",
    items: [{
      ...evidenceItem("Reference"),
      sources: [
        {
          sourceType: "github_issue",
          semanticType: "implementation_tracker",
          relationship: "direct",
          repo: "ethereum/execution-specs",
          title: "EIP-8141 Implementation Tracker: Frame Transaction",
          url: "https://github.com/ethereum/execution-specs/issues/2829",
          state: "open",
          updatedAt: "2026-07-18T00:00:00Z",
          evidenceKind: "reference",
        },
        {
          sourceType: "documentation",
          semanticType: "cluster_reference",
          relationship: "cluster_related",
          repo: "ethereum/EIPs",
          title: "EIP-8250 keyed nonces",
          url: "https://github.com/ethereum/EIPs/blob/master/EIPS/eip-8250.md",
          state: "unknown",
          evidenceKind: "reference",
        },
      ],
      acceptedSourceCount: 2,
      retainedSourceCount: 2,
      renderedSourceCount: 2,
    }],
  };

  const html = generateWeeklyHtml(report);
  const visibleHtml = stripEmbeddedPayloads(html);
  assert.doesNotMatch(visibleHtml, /<th>직접 근거<\/th>|직접 근거<\/dt>|직접 근거<\/span>/);
  assert.doesNotMatch(visibleHtml, /관련 클러스터 참조/);
  assert.doesNotMatch(visibleHtml, /구현 추적 이슈/);
  assert.doesNotMatch(visibleHtml, /업데이트 2026-07-18/);
  assert.doesNotMatch(visibleHtml, /클러스터 참조/);
  assert.doesNotMatch(visibleHtml, /클러스터 관련/);
});

test("narrative wording changes by evidence level", () => {
  const cases: Array<[AdoptionEvidenceItem["evidenceLevel"] | "Unknown", RegExp]> = [
    ["Unknown", /Adoption evidence.*아직 수집되지 않았거나 확인되지 않았으므로/],
    ["Mention", /mention.*확인되지만.*implementation evidence/],
    ["Reference", /reference.*확인되지만.*client support.*production adoption/],
    ["Implementation", /implementation evidence.*확인되지만.*adoption.*client support/],
  ];

  for (const [level, expected] of cases) {
    const report = makeReport();
    report.ethereumTechRadar.adoptionLayer = {
      generatedBy: level === "Unknown" ? "fallback" : "github_search",
      collectionStatus: level === "Unknown" ? "fallback" : "collected",
      items: [level === "Unknown" ? unknownItem() : evidenceItem(level as "Mention" | "Reference" | "Implementation")],
    };
    const text = buildNarrativeLayer(report).weeklyNarrative.join("\n");
    assert.match(text, expected);
    assert.doesNotMatch(text, /[湲蹂理]|쨌|�/);
  }
});
test("narrative distinguishes implementation tracking from production adoption", () => {
  const report = makeReport();
  report.ethereumTechRadar.adoptionLayer = {
    generatedBy: "github_search",
    collectionStatus: "collected",
    items: [{
      ...evidenceItem("Reference"),
      sources: [{
        sourceType: "github_issue",
        semanticType: "implementation_tracker",
        relationship: "direct",
        repo: "ethereum/execution-specs",
        title: "EIP-8141 Implementation Tracker: Frame Transaction",
        url: "https://github.com/ethereum/execution-specs/issues/2829",
        state: "open",
        updatedAt: "2026-07-18T00:00:00Z",
        evidenceKind: "reference",
      }],
      summary: "Implementation tracking references were found, but no verified client implementation or production support was identified.",
    }],
  };

  const text = buildNarrativeLayer(report).weeklyNarrative.join("\n");
  assert.match(text, /Ethereum execution-specs contains implementation tracking references, but verified client code support has not yet been established/);
  assert.doesNotMatch(text, /\bproduction adoption\b/i);
});

test("KGLD section remains reasoning-oriented without evidence-level scoring copy", () => {
  const expectations: Array<["Unknown" | "Reference" | "Implementation", RegExp]> = [
    ["Unknown", /확인된 구현 근거가 없으므로/],
    ["Reference", /외부 참조 근거가 있으나/],
    ["Implementation", /별도 검토가 필요합니다/],
  ];

  for (const [level, expected] of expectations) {
    const report = makeReport();
    report.ethereumTechRadar.adoptionLayer = {
      generatedBy: level === "Unknown" ? "fallback" : "github_search",
      collectionStatus: level === "Unknown" ? "fallback" : "collected",
      items: [level === "Unknown" ? unknownItem() : evidenceItem(level)],
    };
    const html = generateWeeklyHtml(report);
    assert.match(html, /KGLD Technology Watch/);
    assert.doesNotMatch(html, expected);
  }
});

function mockFetch(bodyForUrl: (url: string) => GitHubSearchBody | GitHubPullFileBody | Response): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const body = bodyForUrl(url);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function stripEmbeddedPayloads(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/, "")
    .replace(/<script type="application\/json" id="technology-platform-api">[\s\S]*?<\/script>/, "")
    .replace(/<!-- EIPreporter chart data: [\s\S]*? -->/, "")
    .replace(/<script>[\s\S]*?<\/script>/, "");
}

type GitHubSearchBody = { items: unknown[]; total_count?: number };
type GitHubPullFileBody = Array<{ filename: string }>;

function issueResult(title: string, number = 1, repo = "ethereum/pm", state = "open", updatedAt = "2026-07-20T00:00:00Z"): unknown {
  return {
    html_url: `https://github.com/${repo}/issues/${number}`,
    title,
    state,
    updated_at: updatedAt,
    repository: { full_name: repo },
  };
}

function prResult(title: string, number = 1): unknown {
  return {
    html_url: `https://github.com/ethereum/EIPs/pull/${number}`,
    title,
    state: "open",
    repository: { full_name: "ethereum/EIPs" },
    pull_request: { html_url: `https://github.com/ethereum/EIPs/pull/${number}`, merged_at: null },
  };
}

function prResultWithoutRepo(title: string, number = 1): unknown {
  return {
    html_url: `https://github.com/ethereum/EIPs/pull/${number}`,
    title,
    state: "closed",
    pull_request: { html_url: `https://github.com/ethereum/EIPs/pull/${number}`, merged_at: "2026-07-20T00:00:00Z" },
  };
}

function externalPrResult(title: string, number = 1, merged = false): unknown {
  return {
    html_url: `https://github.com/ethereum/go-ethereum/pull/${number}`,
    title,
    state: merged ? "closed" : "open",
    repository: { full_name: "ethereum/go-ethereum" },
    pull_request: { html_url: `https://github.com/ethereum/go-ethereum/pull/${number}`, merged_at: merged ? "2026-07-20T00:00:00Z" : null },
  };
}

function codeResult(path: string, repo = "ethereum/go-ethereum"): unknown {
  return {
    html_url: `https://github.com/${repo}/blob/master/${path}`,
    name: path.split("/").at(-1),
    path,
    repository: { full_name: repo },
  };
}

function tempCachePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-adoption-"));
  tempDirectories.push(directory);
  return join(directory, "cache.json");
}

function unknownItem(): AdoptionEvidenceItem {
  return {
    proposalId: "EIP-8141",
    title: "Frame Transaction",
    theme: "Transaction Model / Execution",
    evidenceLevel: "Unknown",
    evidenceScore: 0,
    sources: [],
    summary: "No implementation or external reference evidence collected in this run.",
    caution: "Treat as discussion/momentum signal until implementation references or spec diffs appear.",
  };
}

function evidenceItem(evidenceLevel: "Mention" | "Reference" | "Implementation"): AdoptionEvidenceItem {
  const sourceType = evidenceLevel === "Implementation" ? "code_reference" : evidenceLevel === "Reference" ? "github_pr" : "github_issue";
  const evidenceKind = evidenceLevel === "Implementation" ? "implementation" : evidenceLevel === "Reference" ? "reference" : "mention";
  const score = evidenceLevel === "Implementation" ? 50 : evidenceLevel === "Reference" ? 35 : 10;
  return {
    proposalId: "EIP-8141",
    title: "Frame Transaction",
    theme: "Transaction Model / Execution",
    evidenceLevel,
    evidenceScore: score,
    sources: [{
      sourceType,
      repo: "ethereum/go-ethereum",
      title: `${evidenceLevel} source`,
      url: "https://github.com/ethereum/go-ethereum/example",
      matchedTerm: "EIP-8141",
      observedAt: "2026-07-20T00:00:00.000Z",
      evidenceKind,
      confidence: evidenceLevel === "Mention" ? "Low" : "Medium",
    }],
    summary: evidenceLevel === "Mention"
      ? "External mentions were found, but no implementation evidence was identified."
      : evidenceLevel === "Reference"
        ? "1 external reference source(s) were collected. This is not client support or production adoption evidence."
        : "1 source(s) indicate implementation evidence. This does not imply adoption or client support.",
    caution: evidenceLevel === "Implementation"
      ? "구현 근거만으로 릴리스, 운영 채택, 실제 사용을 판단할 수 없습니다."
      : "Reference evidence should be reviewed manually before upgrading the signal.",
  };
}

function makeReport(watchlistCount = 1): WeeklyRadarReport {
  const baseItem: WatchlistItem = {
    title: "Frame Transaction follow-through",
    theme: "Transaction Model / Execution",
    relatedProposals: ["EIP-8141", "EIP-8250", "EIP-8266", "EIP-8272", "EIP-8209"],
    signalType: "discussion_heat",
    possibleNextMovement: "Frame Transaction should be monitored as a protocol execution boundary discussion.",
    confidence: "Medium",
    confidenceScore: 60,
    changeSinceLastReport: "Unknown",
    evidence: ["EIP-8141: 96 replies, 29 participants", "Last active 2026-07-19", "No content diff detected this week"],
    monitorNext: ["EIP-8141 content diff", "EIP-8250 / EIP-8266 / EIP-8272 changes", "new Ethereum Magicians replies"],
    businessRelevance: {
      area: "Protocol",
      note: "Protocol / Wallet observation, not direct KGLD relevance.",
    },
  };
  const watchItems = Array.from({ length: watchlistCount }, (_, index) => index === 0
    ? baseItem
    : {
      ...baseItem,
      title: `Signal ${index}`,
      relatedProposals: [`EIP-900${index}`],
    });

  return {
    generatedAt: "2026-07-20T00:00:00.000Z",
    trendPeriod: { from: "2026-01-21T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 180 },
    changePeriod: { from: "2026-07-13T00:00:00.000Z", to: "2026-07-20T00:00:00.000Z", days: 7 },
    ethereumTechRadar: {
      latestSnapshot: { id: 1, collectedAt: "2026-07-20T00:00:00.000Z", proposalCount: 12 },
      totalProposals: 12,
      proposalsByRepo: {},
      proposalsByStatus: {},
      proposalsByType: {},
      proposalsByCategory: {},
      trendProposalCount: 12,
      themeInsights: [theme("Transaction Model / Execution", 41, ["EIP-8141", "EIP-8250", "EIP-8266", "EIP-8272", "EIP-8209"])],
      accountAbstractionRadar: {
        proposalCount: 0,
        subTrendDistribution: {},
        representativeProposals: [],
        trendInterpretation: "",
        kgldWalletUxInterpretation: "",
      },
      recentChanges: {
        total: 0,
        byEventType: {
          new_proposal: 0,
          status_change: 0,
          final_transition: 0,
          withdrawn_transition: 0,
          content_hash_change: 0,
        },
        finalTransitions: [],
        withdrawnTransitions: [],
        statusChanges: [],
        newProposals: [],
        contentHashChanges: [],
      },
      signalLayer: {
        discussionHeat: [{
          proposalId: "EIP-8141",
          title: "Frame Transaction",
          status: "Draft",
          theme: "Transaction Model / Execution",
          discussionUrl: "https://ethereum-magicians.org/t/frame-transaction/27617",
          discussionLinks: ["https://ethereum-magicians.org/t/frame-transaction/27617"],
          discussionScore: 80,
          discussionActivityScore: 80,
          discussionTitle: "EIP-8141: Frame Transaction",
          discussionSource: "Ethereum Magicians",
          discussionLastActivityAt: "2026-07-19T00:00:00.000Z",
          discussionReplyCount: 96,
          discussionParticipantCount: 29,
          activityLevel: "High",
          whyItMatters: "Fresh activity suggests the proposal is still being debated or refined.",
          canonicalUrl: "https://example.test/EIP-8141",
        }],
        diffIntelligence: [],
      },
      narrativeLayer: {
        weeklyNarrative: [],
        topStories: [],
        signalEvidence: {
          topMomentumThemes: [],
          topDiscussions: [],
          recentChangeCount: 0,
          contentDiffCount: 0,
        },
        generatedBy: "deterministic",
      },
      watchlistLayer: { generatedBy: "deterministic", items: watchItems },
      adoptionLayer: { generatedBy: "fallback", items: [unknownItem()] },
    },
    kgldOpportunityRadar: {
      method: "rule-based-scoring",
      candidates: [],
    },
    chartData: {
      statusDistribution: { labels: [], data: [] },
      developerMomentumScores: { labels: [], data: [] },
      weeklyEventTypeDistribution: { labels: [], data: [] },
      themeDistribution180d: { labels: [], data: [] },
      subTrendDistributionByTheme: {},
      accountAbstractionSubTrendDistribution: { labels: [], data: [] },
      kgldOpportunityMatrix: [],
      kgldRecommendedActionDistribution: { labels: [], data: [] },
      topOpportunities: [],
    },
  };
}

function theme(name: ThemeInsight["theme"], momentumScore: number, proposalIds: string[]): ThemeInsight {
  return {
    theme: name,
    proposalCount: proposalIds.length,
    proposalCount180d: proposalIds.length,
    recentChangeCount: 0,
    recentChangeCount7d: 0,
    discussionProposalCount: proposalIds.length,
    contentChangeCount: 0,
    maturitySignal: "low",
    momentumScore,
    dominantSubTrends: [],
    representativeProposals: proposalIds.map((id) => ({
      id,
      title: id === "EIP-8141" ? "Frame Transaction" : `${id} related proposal`,
      status: "Draft",
      oneLineSummary: "Related proposal",
      canonicalUrl: `https://example.test/${id}`,
    })),
    trendInterpretation: "Momentum signal.",
    interpretation: "Momentum signal.",
  };
}

