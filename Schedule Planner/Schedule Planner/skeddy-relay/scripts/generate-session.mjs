import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

function toNonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function askValue(rl, question, fallback = "") {
  if (fallback) {
    return fallback;
  }
  return toNonEmpty(await rl.question(question));
}

async function main() {
  const rl = readline.createInterface({ input, output });
  try {
    const apiIdRaw = await askValue(rl, "Telegram API ID: ", toNonEmpty(process.env.TELEGRAM_API_ID));
    const apiHash = await askValue(rl, "Telegram API HASH: ", toNonEmpty(process.env.TELEGRAM_API_HASH));
    const apiId = Number.parseInt(apiIdRaw, 10);
    if (!Number.isInteger(apiId) || !apiHash) {
      throw new Error("TELEGRAM_API_ID/TELEGRAM_API_HASH is invalid.");
    }

    const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.start({
      phoneNumber: async () => askValue(rl, "Phone number (e.g. +849...): "),
      password: async () => askValue(rl, "2FA password (enter if enabled, else press Enter): "),
      phoneCode: async () => askValue(rl, "Code from Telegram: "),
      onError: (error) => console.error(error),
    });

    const session = client.session.save();
    console.log("\nDone. Save this to TELEGRAM_SESSION_STRING:\n");
    console.log(session);
    await client.disconnect();
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
