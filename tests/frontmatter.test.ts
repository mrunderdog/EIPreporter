import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter } from "../src/frontmatter.ts";

test("parses scalar frontmatter values", () => {
  const result = parseFrontmatter(`---
eip: 1
title: EIP Purpose and Guidelines
status: Living
type: Meta
created: 2015-10-27
discussions-to: https://example.test
---

# Body
`);

  assert.equal(result.data.eip, 1);
  assert.equal(result.data.title, "EIP Purpose and Guidelines");
  assert.equal(result.data.status, "Living");
  assert.equal(result.data["discussions-to"], "https://example.test");
  assert.match(result.body, /# Body/);
});

test("returns empty data when frontmatter is absent", () => {
  const result = parseFrontmatter("# Plain markdown");

  assert.deepEqual(result.data, {});
  assert.equal(result.body, "# Plain markdown");
});
