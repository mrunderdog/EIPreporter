import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  buildVitalikBlogView,
  parseVitalikBlogArticle,
  parseVitalikBlogIndex,
  type VitalikBlogSourceResult,
} from "../src/sources/vitalik-blog.ts";

const fixtureDir = join(process.cwd(), "tests", "fixtures");

test("Vitalik Blog parser discovers official index links and parses article body", () => {
  const index = readFileSync(join(fixtureDir, "vitalik-blog-source.html"), "utf8");
  const article = readFileSync(join(fixtureDir, "vitalik-blog-article-1.html"), "utf8");
  const links = parseVitalikBlogIndex(index);

  assert.equal(links.length, 2);
  assert.equal(links[0]?.url, "https://vitalik.eth.limo/general/2026/07/28/obfuscation_part_ii_diamond_io.html");
  assert.equal(links[0]?.publishedAt, "2026-07-28");

  const fact = parseVitalikBlogArticle(article, links[0]!.url, "2026-08-06T00:00:00.000Z", links[0]!.publishedAt);
  assert.equal(fact.sourceType, "vitalik_blog_post");
  assert.equal(fact.title, "Obfuscation part II: Diamond iO");
  assert.equal(fact.canonicalUrl, links[0]!.url);
  assert.equal(fact.publishedAt, "2026-07-28");
  assert.equal(fact.publicationDatePrecision, "date");
  assert.equal(fact.parseState, "body_parsed");
  assert.ok(fact.cleanedText.includes("Diamond iO line of work"));
  assert.ok(fact.evidenceParagraphs.length >= 2);
  assert.match(fact.contentHash, /^[a-f0-9]{64}$/);
});

test("Vitalik Blog view keeps source separate and marks unreviewed summaries", () => {
  const index = readFileSync(join(fixtureDir, "vitalik-blog-source.html"), "utf8");
  const article = readFileSync(join(fixtureDir, "vitalik-blog-article-1.html"), "utf8");
  const link = parseVitalikBlogIndex(index)[0]!;
  const fact = parseVitalikBlogArticle(article, link.url, "2026-08-06T00:00:00.000Z", link.publishedAt);
  const source: VitalikBlogSourceResult = {
    sourceState: "collected",
    sourceUrl: "https://vitalik.eth.limo/",
    discoveryMethod: "official_index_html",
    fetchedAt: "2026-08-06T00:00:00.000Z",
    latestPublishedAt: fact.publishedAt,
    posts: [fact],
    diagnostics: { feedUrl: null, articleStatuses: [], errors: [] },
  };

  const view = buildVitalikBlogView(source, "2026-08-06T00:00:00.000Z", []);
  assert.equal(view.selectedPosts.length, 1);
  assert.equal(view.selectedPosts[0]?.summaryState, "extractive_original");
  assert.equal(view.selectedPosts[0]?.relatedProposalRelation, "none");
  assert.match(view.limitationsKo.join(" "), /개인 글/);
});
