import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDiscussionFallbackWhyItMatters,
  buildDiscourseTopicJsonUrl,
  buildDiscourseTopicJsonUrlCandidates,
  calculateDiscussionActivityScore,
  classifyDiscussionActivity,
  compareDiscussionHeat,
  enrichDiscussionItem,
  extractDiscourseTopicId,
  extractDiscourseActivity,
} from "../src/discussion-activity.ts";
import type { DiscussionHeatItem } from "../src/types.ts";

test("parses Ethereum Magicians and Discourse topic JSON URLs", () => {
  assert.equal(
    buildDiscourseTopicJsonUrl("https://ethereum-magicians.org/t/example-topic/123"),
    "https://ethereum-magicians.org/t/example-topic/123.json?print=true",
  );
  assert.equal(
    buildDiscourseTopicJsonUrl("https://ethereum-magicians.org/t/123"),
    "https://ethereum-magicians.org/t/123.json?print=true",
  );
  assert.equal(
    buildDiscourseTopicJsonUrl("https://forum.example.test/t/topic-title/456?u=alice#post-2"),
    "https://forum.example.test/t/topic-title/456.json?print=true",
  );
  assert.equal(buildDiscourseTopicJsonUrl("https://example.test/issues/1"), null);
});

test("extracts Discourse topic id from Ethereum Magicians URLs", () => {
  assert.equal(
    extractDiscourseTopicId("https://ethereum-magicians.org/t/eip-8133-upgrade-nomenclature/27575"),
    27575,
  );
  assert.equal(extractDiscourseTopicId("https://ethereum-magicians.org/t/27575.json"), 27575);
  assert.equal(extractDiscourseTopicId("https://ethereum-magicians.org/t/-/27575.json"), 27575);
  assert.equal(extractDiscourseTopicId("https://ethereum-magicians.org/c/eips/1"), null);
});

test("builds Discourse JSON endpoint candidates from a topic URL", () => {
  assert.deepEqual(
    buildDiscourseTopicJsonUrlCandidates("https://ethereum-magicians.org/t/eip-8133-upgrade-nomenclature/27575?u=alice#post-2"),
    [
      "https://ethereum-magicians.org/t/eip-8133-upgrade-nomenclature/27575.json?print=true",
      "https://ethereum-magicians.org/t/eip-8133-upgrade-nomenclature/27575.json",
      "https://ethereum-magicians.org/t/27575.json?print=true",
      "https://ethereum-magicians.org/t/27575.json",
      "https://ethereum-magicians.org/t/-/27575.json?print=true",
      "https://ethereum-magicians.org/t/-/27575.json",
    ],
  );
});

test("extracts lightweight metadata from mocked Discourse JSON", () => {
  const activity = extractDiscourseActivity(
    {
      title: "ERC-4626 discussion",
      created_at: "2026-06-01T00:00:00.000Z",
      last_posted_at: "2026-06-10T00:00:00.000Z",
      reply_count: 22,
      views: 2400,
      tags: ["erc", "defi"],
      details: { participants: [{ id: 1 }, { id: 2 }, { id: 3 }] },
    },
    "https://ethereum-magicians.org/t/erc-4626/1",
    new Date("2026-06-12T00:00:00.000Z"),
  );

  assert.equal(activity.discussionTitle, "ERC-4626 discussion");
  assert.equal(activity.discussionSource, "Ethereum Magicians");
  assert.equal(activity.discussionReplyCount, 22);
  assert.equal(activity.discussionParticipantCount, 3);
  assert.equal(activity.discussionViewCount, 2400);
  assert.deepEqual(activity.discussionTags, ["erc", "defi"]);
  assert.equal(activity.discussionFreshnessDays, 2);
  assert.equal(activity.discussionActivityScore, 65);
  assert.equal(activity.activityLevel, "High");
});

test("falls back to posts_count and posters when explicit counts are absent", () => {
  const activity = extractDiscourseActivity(
    {
      id: 27575,
      title: "EIP-8133 Upgrade Nomenclature",
      created_at: "2026-06-01T00:00:00.000Z",
      last_posted_at: "2026-06-05T00:00:00.000Z",
      posts_count: 6,
      posters: [{ user_id: 1 }, { user_id: 2 }],
    },
    "https://ethereum-magicians.org/t/eip-8133-upgrade-nomenclature/27575",
    new Date("2026-06-12T00:00:00.000Z"),
  );

  assert.equal(activity.discussionTopicId, 27575);
  assert.equal(activity.discussionReplyCount, 5);
  assert.equal(activity.discussionParticipantCount, 2);
});

test("calculates transparent discussion activity scores", () => {
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: false }), 0);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true }), 10);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, replyCount: 5 }), 15);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, replyCount: 20 }), 20);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, replyCount: 50 }), 25);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, replyCount: 51 }), 30);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, freshnessDays: 7 }), 35);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, freshnessDays: 30 }), 25);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, freshnessDays: 90 }), 18);
  assert.equal(calculateDiscussionActivityScore({ hasDiscussionLink: true, participantCount: 16, viewCount: 2000 }), 35);
});

test("classifies discussion activity levels", () => {
  assert.equal(classifyDiscussionActivity(60, true), "High");
  assert.equal(classifyDiscussionActivity(35, true), "Medium");
  assert.equal(classifyDiscussionActivity(10, true), "Low");
  assert.equal(classifyDiscussionActivity(10, false), "Unknown");
  assert.equal(classifyDiscussionActivity(undefined, true), "Unknown");
});

test("builds deterministic fallback why-it-matters text by theme", () => {
  assert.match(
    buildDiscussionFallbackWhyItMatters({ theme: "Network Upgrade / Governance", title: "Upgrade nomenclature", status: "Draft" }),
    /network-upgrade proposal/,
  );
  assert.match(
    buildDiscussionFallbackWhyItMatters({ theme: "EVM / Gas / Opcode", title: "Opcode update", status: "Draft" }),
    /execution-layer proposal/,
  );
  assert.match(
    buildDiscussionFallbackWhyItMatters({ theme: "Data Availability", title: "Blob schedule", status: "Draft" }),
    /data-availability proposal/,
  );
  assert.match(
    buildDiscussionFallbackWhyItMatters({ theme: "Identity / Credential", title: "Credential registry", status: "Draft" }),
    /identity or credential proposal/,
  );
});

test("handles failed discussion fetches without crashing", async () => {
  const item = makeDiscussionItem();
  const result = await enrichDiscussionItem(item, {
    now: new Date("2026-06-12T00:00:00.000Z"),
    fetchImpl: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(result.proposalId, "ERC-4626");
  assert.equal(result.discussionSource, "Ethereum Magicians");
  assert.equal(result.discussionActivityScore, 10);
  assert.equal(result.activityLevel, "Unknown");
  assert.match(result.error ?? "", /network unavailable/);
  assert.match(result.discussionSummaryFallback ?? "", /Activity details unavailable/);
  assert.match(result.whyItMatters, /watchlist signal|wallet or account-abstraction proposal|Tokenized Vaults/);
});

test("enriches discussion item from mocked Discourse fetch", async () => {
  const requestedUrls: string[] = [];
  const result = await enrichDiscussionItem(makeDiscussionItem(), {
    now: new Date("2026-06-12T00:00:00.000Z"),
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      if (requestedUrls.length === 1) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({
        title: "Tokenized Vaults",
        created_at: "2026-06-01T00:00:00.000Z",
        last_posted_at: "2026-06-11T00:00:00.000Z",
        reply_count: 8,
        participant_count: 6,
        views: 501,
        tags: ["erc"],
      }), { status: 200 });
    },
  });

  assert.deepEqual(requestedUrls, [
    "https://ethereum-magicians.org/t/erc-4626/1.json?print=true",
    "https://ethereum-magicians.org/t/erc-4626/1.json",
  ]);
  assert.equal(result.discussionTitle, "Tokenized Vaults");
  assert.equal(result.discussionReplyCount, 8);
  assert.equal(result.discussionParticipantCount, 6);
  assert.equal(result.discussionViewCount, 501);
  assert.equal(result.discussionActivityScore, 60);
  assert.equal(result.discussionScore, 60);
});

test("sorts Discussion Heat by score, freshness, theme priority, and proposal id", async () => {
  const items: DiscussionHeatItem[] = [
    makeDiscussionItem({ proposalId: "EIP-7002", theme: "Network Upgrade / Governance", discussionActivityScore: 10 }),
    makeDiscussionItem({ proposalId: "ERC-7579", theme: "Account Abstraction", discussionActivityScore: 10 }),
    makeDiscussionItem({ proposalId: "ERC-6900", theme: "Wallet UX", discussionActivityScore: 35, discussionLastActivityAt: "2026-06-10T00:00:00.000Z" }),
    makeDiscussionItem({ proposalId: "ERC-7715", theme: "Wallet UX", discussionActivityScore: 35, discussionLastActivityAt: "2026-06-11T00:00:00.000Z" }),
  ];

  assert.deepEqual([...items].sort(compareDiscussionHeat).map((item) => item.proposalId), [
    "ERC-7715",
    "ERC-6900",
    "ERC-7579",
    "EIP-7002",
  ]);

});

function makeDiscussionItem(overrides: Partial<DiscussionHeatItem> = {}): DiscussionHeatItem {
  return {
    proposalId: "ERC-4626",
    title: "Tokenized Vaults",
    status: "Draft",
    theme: "DeFi / Vault",
    discussionUrl: "https://ethereum-magicians.org/t/erc-4626/1",
    discussionLinks: ["https://ethereum-magicians.org/t/erc-4626/1"],
    discussionScore: 10,
    discussionActivityScore: 10,
    whyItMatters: "Activity details unavailable.",
    canonicalUrl: "https://example.test/ERC-4626",
    ...overrides,
  };
}
