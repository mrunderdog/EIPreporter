import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  sendTelegramDocument,
  sendTelegramMessage,
  splitTelegramMessage,
  TELEGRAM_MESSAGE_LIMIT,
} from "../src/telegram.ts";

test("uploads an HTML report with sendDocument multipart form data", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-telegram-"));
  const filePath = join(directory, "weekly-2026-06-12.html");
  writeFileSync(filePath, "<!doctype html><title>Weekly</title>", "utf8");

  try {
    let request: { url: string; form: FormData } | undefined;
    const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
      request = {
        url: input.toString(),
        form: init?.body as FormData,
      };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await sendTelegramDocument(
      { botToken: "test-token", chatId: "12345" },
      filePath,
      "짧은 주간 리포트 설명",
      fetchMock,
    );

    assert.equal(result.fileName, "weekly-2026-06-12.html");
    assert.equal(request?.url, "https://api.telegram.org/bottest-token/sendDocument");
    assert.equal(request?.form.get("chat_id"), "12345");
    assert.equal(request?.form.get("caption"), "짧은 주간 리포트 설명");
    const document = request?.form.get("document");
    assert.ok(document instanceof File);
    assert.equal(document.name, "weekly-2026-06-12.html");
    assert.equal(document.type, "text/html");
    assert.match(await document.text(), /Weekly/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sends a plain text Telegram message with fetch", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: input.toString(),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const sentCount = await sendTelegramMessage(
    { botToken: "test-token", chatId: "12345" },
    "EIPreporter Telegram test message",
    fetchMock,
  );

  assert.equal(sentCount, 1);
  assert.deepEqual(requests, [
    {
      url: "https://api.telegram.org/bottest-token/sendMessage",
      body: {
        chat_id: "12345",
        text: "EIPreporter Telegram test message",
        disable_web_page_preview: true,
      },
    },
  ]);
});

test("splits and sends long messages within the Telegram limit", async () => {
  const message = `${"a".repeat(3_950)}\n${"b".repeat(3_950)}\n${"c".repeat(500)}`;
  const chunks = splitTelegramMessage(message);
  const sentTexts: string[] = [];
  const fetchMock = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string };
    sentTexts.push(body.text);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const sentCount = await sendTelegramMessage(
    { botToken: "test-token", chatId: "12345" },
    message,
    fetchMock,
  );

  assert.equal(sentCount, 3);
  assert.deepEqual(sentTexts, chunks);
  assert.equal(chunks.join(""), message);
  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_MESSAGE_LIMIT));
});

test("reports missing Telegram configuration names", async () => {
  await assert.rejects(
    sendTelegramMessage(
      { botToken: undefined, chatId: "" },
      "message",
      async () => new Response(null, { status: 200 }),
    ),
    /Missing Telegram configuration: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID/,
  );
});

test("includes Telegram API status and body in errors", async () => {
  await assert.rejects(
    sendTelegramMessage(
      { botToken: "test-token", chatId: "12345" },
      "message",
      async () =>
        new Response('{"ok":false,"description":"Bad Request: chat not found"}', {
          status: 400,
          statusText: "Bad Request",
        }),
    ),
    /Telegram API error 400 Bad Request: .*chat not found/,
  );
});

test("sendDocument includes Telegram API status and body in errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "eipreporter-telegram-error-"));
  const filePath = join(directory, "weekly-2026-06-12.html");
  writeFileSync(filePath, "<!doctype html>", "utf8");

  try {
    await assert.rejects(
      sendTelegramDocument(
        { botToken: "test-token", chatId: "12345" },
        filePath,
        undefined,
        async () =>
          new Response('{"ok":false,"description":"Bad Request: wrong file"}', {
            status: 400,
            statusText: "Bad Request",
          }),
      ),
      /Telegram API error 400 Bad Request: .*wrong file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
