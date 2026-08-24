import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  collectVitalikBlogSource,
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

test("Vitalik Blog view generates bounded Korean summaries from parsed source facts without editorial overrides", () => {
  const index = readFileSync(join(fixtureDir, "vitalik-blog-source.html"), "utf8");
  const article = readFileSync(join(fixtureDir, "vitalik-blog-article-1.html"), "utf8");
  const link = parseVitalikBlogIndex(index)[0]!;
  const fact = parseVitalikBlogArticle(article, link.url, "2026-08-06T00:00:00.000Z", link.publishedAt);
  const source = vitalikSourceFromFact(fact);

  const view = buildVitalikBlogView(source, "2026-08-06T00:00:00.000Z", []);
  const selected = view.selectedPosts[0];

  assert.equal(selected?.summaryState, "generated_existing_adapter");
  assert.match(selected?.summaryKo ?? "", /Vitalik Buterin/);
  assert.doesNotMatch(selected?.summaryKo ?? "", /^In the last part of this series/);
  assert.ok((selected?.evidenceParagraphIds ?? []).length >= 1);
});

test("Vitalik Blog view keeps source separate and marks generated summaries as external context", () => {
  const index = readFileSync(join(fixtureDir, "vitalik-blog-source.html"), "utf8");
  const article = readFileSync(join(fixtureDir, "vitalik-blog-article-1.html"), "utf8");
  const link = parseVitalikBlogIndex(index)[0]!;
  const fact = parseVitalikBlogArticle(article, link.url, "2026-08-06T00:00:00.000Z", link.publishedAt);
  const view = buildVitalikBlogView(vitalikSourceFromFact(fact), "2026-08-06T00:00:00.000Z", []);

  assert.equal(view.selectedPosts.length, 1);
  assert.equal(view.selectedPosts[0]?.summaryState, "generated_existing_adapter");
  assert.equal(view.selectedPosts[0]?.relatedProposalRelation, "none");
  assert.match(view.limitationsKo.join(" "), /Vitalik Blog/);
});

test("Vitalik Blog collector parses large official articles instead of marking the current feed partial by size alone", async () => {
  const largeArticle = `<!doctype html><html><head><title>Large Article</title><link rel="canonical" href="https://vitalik.eth.limo/general/2026/08/21/large.html"></head><body><article><h1>Large Article</h1><p>${"This paragraph is source evidence about cryptography and protocol research. ".repeat(90000)}</p></article></body></html>`;
  const source = await collectVitalikBlogSource(new Date("2026-08-24T00:17:00.000Z"), mockVitalikFetch({
    "https://vitalik.eth.limo/": {
      contentType: "text/html",
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>`,
    },
    "https://vitalik.eth.limo/feed.xml": {
      contentType: "application/xml",
      body: `<rss><channel><item><title>Large Article</title><link>https://vitalik.eth.limo/general/2026/08/21/large.html</link><pubDate>Fri, 21 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
    },
    "https://vitalik.eth.limo/general/2026/08/21/large.html": {
      contentType: "text/html",
      body: largeArticle,
    },
  }));

  assert.equal(source.sourceState, "collected");
  assert.equal(source.posts[0]?.parseState, "body_parsed");
});

test("Vitalik Blog collector records feed and article failures without cached current facts", async () => {
  const articleFailure = await collectVitalikBlogSource(new Date("2026-08-24T00:17:00.000Z"), mockVitalikFetch({
    "https://vitalik.eth.limo/": {
      contentType: "text/html",
      body: `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>`,
    },
    "https://vitalik.eth.limo/feed.xml": {
      contentType: "application/xml",
      body: `<rss><channel><item><title>Missing Article</title><link>https://vitalik.eth.limo/general/2026/08/21/missing.html</link><pubDate>Fri, 21 Aug 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
    },
    "https://vitalik.eth.limo/general/2026/08/21/missing.html": {
      contentType: "text/html",
      ok: false,
      status: 503,
      body: "unavailable",
    },
  }));
  const feedFailure = await collectVitalikBlogSource(new Date("2026-08-24T00:17:00.000Z"), async () => {
    throw new Error("network down");
  });

  assert.equal(articleFailure.sourceState, "unavailable");
  assert.equal(articleFailure.posts.length, 0);
  assert.match(articleFailure.diagnostics.articleStatuses[0]?.error ?? "", /HTTP 503/);
  assert.equal(feedFailure.sourceState, "unavailable");
  assert.equal(feedFailure.posts.length, 0);
  assert.match(feedFailure.diagnostics.errors.join(" "), /network down/);
});

test("Vitalik Blog parser falls back to body paragraphs when article selectors change", () => {
  const html = `<!doctype html><html><head><title>Selector Changed</title><link rel="canonical" href="https://vitalik.eth.limo/general/2026/08/22/selector_changed.html"></head><body><div class="post"><h1>Selector Changed</h1><p>${"This body paragraph remains substantive source evidence about protocol research and cryptography. ".repeat(8)}</p></div></body></html>`;
  const fact = parseVitalikBlogArticle(html, "https://vitalik.eth.limo/general/2026/08/22/selector_changed.html", "2026-08-24T00:17:00.000Z", "2026-08-22");

  assert.equal(fact.parseState, "body_parsed");
  assert.ok(fact.cleanedText.length > 200);
  assert.ok(fact.evidenceParagraphs.length >= 1);
});

function vitalikSourceFromFact(fact: VitalikBlogSourceResult["posts"][number]): VitalikBlogSourceResult {
  return {
    sourceState: "collected",
    sourceUrl: "https://vitalik.eth.limo/",
    discoveryMethod: "official_index_html",
    fetchedAt: "2026-08-06T00:00:00.000Z",
    latestPublishedAt: fact.publishedAt,
    posts: [fact],
    diagnostics: { feedUrl: null, articleStatuses: [], errors: [] },
  };
}

function mockVitalikFetch(routes: Record<string, { body: string; contentType: string; ok?: boolean; status?: number }>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const route = routes[href];
    if (!route) throw new Error(`unexpected fetch: ${href}`);
    return {
      url: href,
      ok: route.ok ?? true,
      status: route.status ?? 200,
      headers: { get: (name: string) => name.toLowerCase() === "content-type" ? route.contentType : null },
      text: async () => route.body,
    } as Response;
  }) as typeof fetch;
}
