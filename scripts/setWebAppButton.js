#!/usr/bin/env node
/**
 * Устанавливает кнопку меню бота (Web App URL) через Telegram Bot API.
 * Использование: node scripts/setWebAppButton.js <URL>
 * Пример: node scripts/setWebAppButton.js https://myapp.com
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const https = require("https");

const url = process.argv[2] || process.env.WEBAPP_URL;
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не задан в .env");
  process.exit(1);
}
if (!url || !url.startsWith("https://")) {
  console.error("Укажи HTTPS-URL Mini App: node scripts/setWebAppButton.js https://твой-домен.com");
  process.exit(1);
}

const body = JSON.stringify({
  menu_button: {
    type: "web_app",
    text: "Играть",
    web_app: { url },
  },
});

const req = https.request(
  {
    hostname: "api.telegram.org",
    path: `/bot${token}/setChatMenuButton`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const json = JSON.parse(data || "{}");
      if (json.ok) {
        console.log("Кнопка меню установлена:", url);
      } else {
        console.error("Ошибка Telegram API:", json.description || data);
        process.exit(1);
      }
    });
  }
);
req.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
req.end(body);
