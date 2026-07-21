import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

export const TELEGRAM_MESSAGE_LIMIT = 4_000;

export type TelegramNotifierConfig = {
  botToken: string | undefined;
  chatId: string | undefined;
};

type Fetch = typeof fetch;

export type TelegramDocumentResult = {
  fileName: string;
};

export function validateTelegramConfig(
  config: TelegramNotifierConfig,
): asserts config is { botToken: string; chatId: string } {
  const missing: string[] = [];
  if (!config.botToken?.trim()) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.chatId?.trim()) missing.push("TELEGRAM_CHAT_ID");

  if (missing.length > 0) {
    throw new Error(`Missing Telegram configuration: ${missing.join(", ")}`);
  }
}

export function splitTelegramMessage(
  message: string,
  limit = TELEGRAM_MESSAGE_LIMIT,
): string[] {
  if (limit < 1) {
    throw new Error("Telegram message limit must be at least 1");
  }
  if (message.length === 0) return [""];

  const chunks: string[] = [];
  let remaining = message;

  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    const newlineIndex = candidate.lastIndexOf("\n");
    const splitAt = newlineIndex > 0 ? newlineIndex + 1 : limit;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  chunks.push(remaining);
  return chunks;
}

export async function sendTelegramMessage(
  config: TelegramNotifierConfig,
  message: string,
  fetchImpl: Fetch = fetch,
): Promise<number> {
  validateTelegramConfig(config);

  const chunks = splitTelegramMessage(message);
  const endpoint = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  for (const chunk of chunks) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    });

    await assertTelegramResponse(response);
  }

  return chunks.length;
}

export async function sendTelegramDocument(
  config: TelegramNotifierConfig,
  filePath: string,
  caption?: string,
  fetchImpl: Fetch = fetch,
): Promise<TelegramDocumentResult> {
  validateTelegramConfig(config);

  let file: string;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) {
      throw new Error("path is not a file");
    }
    file = readFileSync(filePath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`HTML report file not found or unreadable: ${filePath} (${detail})`);
  }

  const fileName = basename(filePath);
  const form = new FormData();
  form.append("chat_id", config.chatId);
  form.append("document", new Blob([file], { type: "text/html" }), fileName);
  if (caption?.trim()) {
    form.append("caption", caption.trim());
  }

  const endpoint = `https://api.telegram.org/bot${config.botToken}/sendDocument`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    body: form,
  });
  await assertTelegramResponse(response);

  return { fileName };
}

async function assertTelegramResponse(response: Response): Promise<void> {
  if (response.ok) return;

  const body = await response.text();
  throw new Error(
    `Telegram API error ${response.status} ${response.statusText}: ${body}`,
  );
}
