import { getConfig } from "../config.ts";
import { sendTelegramMessage } from "../telegram.ts";

const TEST_MESSAGE = "EIPreporter Telegram test message";

async function main(): Promise<void> {
  const config = getConfig();
  const sentCount = await sendTelegramMessage(
    {
      botToken: config.telegramBotToken,
      chatId: config.telegramChatId,
    },
    TEST_MESSAGE,
  );

  console.log(`Telegram test message sent (${sentCount} message).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
