const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  if (!botToken) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { ok: false, error: "Missing hash in initData" };
  }

  const dataPairs = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    dataPairs.push(`${key}=${value}`);
  }
  dataPairs.sort();
  const dataCheckString = dataPairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) {
    return { ok: false, error: "Invalid hash" };
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSec = 24 * 60 * 60;

  if (!authDate || now - authDate > maxAgeSec) {
    return { ok: false, error: "initData is too old" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "Missing user payload" };
  }

  let user;
  try {
    user = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: "Invalid user payload" };
  }

  if (!user.id) {
    return { ok: false, error: "User payload has no id" };
  }

  return {
    ok: true,
    user: {
      tgId: String(user.id),
      username: user.username || null,
      displayName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Игрок",
      avatarUrl: user.photo_url || null,
    },
  };
}

module.exports = { verifyTelegramInitData };
