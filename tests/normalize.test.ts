import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProposal } from "../src/normalize.ts";

test("normalizes EIP metadata", () => {
  const record = normalizeProposal({
    kind: "EIP",
    sourceRepo: "ethereum/EIPs",
    sourcePath: "EIPS/eip-1.md",
    branch: "master",
    markdown: `---
eip: 1
title: EIP Purpose and Guidelines
status: Living
type: Meta
description: EIP process description
keywords: governance, process
created: 2015-10-27
---

## Abstract
This proposal defines the EIP process body.
`,
  });

  assert.ok(record);
  assert.equal(record.proposalId, "EIP-1");
  assert.equal(record.number, 1);
  assert.equal(record.title, "EIP Purpose and Guidelines");
  assert.equal(record.status, "Living");
  assert.equal(record.proposalType, "Meta");
  assert.equal(record.description, "EIP process description");
  assert.equal(record.discussionUrl, null);
  assert.deepEqual(record.discussionLinks, []);
  assert.equal(record.discussionSignal?.hasDiscussion, false);
  assert.deepEqual(record.keywords, ["governance", "process"]);
  assert.match(record.bodyExcerpt ?? "", /Abstract/);
  assert.equal(record.sourceRepo, "ethereum/EIPs");
  assert.equal(record.canonicalUrl, "https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1.md");
  assert.equal(record.rawContentHash.length, 64);
});

test("extracts discussion URLs from proposal metadata", () => {
  const record = normalizeProposal({
    kind: "ERC",
    sourceRepo: "ethereum/ercs",
    sourcePath: "ERCS/erc-9999.md",
    branch: "main",
    markdown: `---
erc: 9999
title: Discussion Proposal
status: Draft
discussions-to:
  - https://ethereum-magicians.org/t/example
  - https://github.com/ethereum/ERCs/issues/9999
---
`,
  });

  assert.ok(record);
  assert.equal(record.discussionTo, "https://ethereum-magicians.org/t/example");
  assert.equal(record.discussionUrl, "https://ethereum-magicians.org/t/example");
  assert.deepEqual(record.discussionLinks, [
    "https://ethereum-magicians.org/t/example",
    "https://github.com/ethereum/ERCs/issues/9999",
  ]);
  assert.equal(record.discussionSignal?.hasDiscussion, true);
  assert.equal(record.discussionSignal?.discussionScore, 10);
});

test("normalizes ERC metadata from file path when frontmatter number is absent", () => {
  const record = normalizeProposal({
    kind: "ERC",
    sourceRepo: "ethereum/ercs",
    sourcePath: "ERCS/erc-20.md",
    branch: "main",
    markdown: `---
title: Token Standard
status: Final
type: Standards Track
category: ERC
---
`,
  });

  assert.ok(record);
  assert.equal(record.proposalId, "ERC-20");
  assert.equal(record.number, 20);
  assert.equal(record.category, "ERC");
});
