const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const EMPTY_DB = {
  users: [],
  stats: {},
  games: [],
};

let db;

function nowIso() {
  return new Date().toISOString();
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY_DB, null, 2), "utf8");
  }
}

function initDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  try {
    db = JSON.parse(raw);
  } catch {
    db = JSON.parse(JSON.stringify(EMPTY_DB));
    saveDb();
  }

  if (!Array.isArray(db.users)) db.users = [];
  if (!db.stats || typeof db.stats !== "object") db.stats = {};
  if (!Array.isArray(db.games)) db.games = [];
}

function getDb() {
  if (!db) {
    initDb();
  }
  return db;
}

function saveDb() {
  const payload = JSON.stringify(getDb(), null, 2);
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, payload, "utf8");
  fs.renameSync(tmpFile, DATA_FILE);
}

function getUserById(userId) {
  return getDb().users.find((u) => u.id === userId) || null;
}

function getUserByTelegramId(tgId) {
  return getDb().users.find((u) => String(u.tgId) === String(tgId)) || null;
}

function sanitizeName(name) {
  const text = String(name || "Игрок").trim();
  return text.length > 0 ? text.slice(0, 48) : "Игрок";
}

function ensureStats(userId) {
  const dbRef = getDb();
  if (!dbRef.stats[userId]) {
    dbRef.stats[userId] = {
      userId,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesTotal: 0,
      pointsTotal: 0,
      updatedAt: nowIso(),
    };
    saveDb();
  }
  return dbRef.stats[userId];
}

function upsertTelegramUser({ tgId, username, displayName, avatarUrl }) {
  const dbRef = getDb();
  const existing = getUserByTelegramId(tgId);

  if (existing) {
    existing.username = username || existing.username || null;
    existing.displayName = sanitizeName(displayName || existing.displayName);
    existing.avatarUrl = avatarUrl || existing.avatarUrl || null;
    existing.updatedAt = nowIso();
    ensureStats(existing.id);
    saveDb();
    return existing;
  }

  const user = {
    id: crypto.randomUUID(),
    tgId: String(tgId),
    username: username || null,
    displayName: sanitizeName(displayName),
    avatarUrl: avatarUrl || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  dbRef.users.push(user);
  ensureStats(user.id);
  saveDb();
  return user;
}

function upsertDevUser(displayName) {
  const dbRef = getDb();
  const normalized = sanitizeName(displayName);
  const tgId = `dev:${normalized.toLowerCase().replace(/\s+/g, "_")}`;
  const existing = getUserByTelegramId(tgId);

  if (existing) {
    existing.displayName = normalized;
    existing.updatedAt = nowIso();
    ensureStats(existing.id);
    saveDb();
    return existing;
  }

  const user = {
    id: crypto.randomUUID(),
    tgId,
    username: null,
    displayName: normalized,
    avatarUrl: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  dbRef.users.push(user);
  ensureStats(user.id);
  saveDb();
  return user;
}

function getStatsByUserId(userId) {
  return ensureStats(userId);
}

function listUsers() {
  return getDb().users;
}

function listGames() {
  return getDb().games;
}

function listGamesByUser(userId) {
  return getDb().games
    .filter((g) => g.whiteUserId === userId || g.blackUserId === userId)
    .sort((a, b) => {
      const aTime = a.finishedAt || a.startedAt;
      const bTime = b.finishedAt || b.startedAt;
      return String(bTime).localeCompare(String(aTime));
    });
}

function getGameById(gameId) {
  return getDb().games.find((g) => g.id === gameId) || null;
}

function listActiveGames() {
  return getDb().games.filter((g) => g.status === "active");
}

function createGame({ whiteUserId, blackUserId, fen }) {
  const dbRef = getDb();
  const now = nowIso();

  const game = {
    id: crypto.randomUUID(),
    whiteUserId,
    blackUserId,
    status: "active",
    result: "*",
    finishReason: null,
    fenCurrent: fen,
    pgn: "",
    startedAt: now,
    finishedAt: null,
    moves: [],
    drawOfferBy: null,
    rematchBy: [],
    statsApplied: false,
    createdAt: now,
    updatedAt: now,
  };

  dbRef.games.push(game);
  saveDb();
  return game;
}

function touchGame(game) {
  game.updatedAt = nowIso();
  saveDb();
}

function applyResultToStats(game) {
  if (game.statsApplied) return;

  const whiteStats = ensureStats(game.whiteUserId);
  const blackStats = ensureStats(game.blackUserId);

  whiteStats.gamesTotal += 1;
  blackStats.gamesTotal += 1;

  if (game.result === "1-0") {
    whiteStats.wins += 1;
    blackStats.losses += 1;
    whiteStats.pointsTotal += 3;
  } else if (game.result === "0-1") {
    blackStats.wins += 1;
    whiteStats.losses += 1;
    blackStats.pointsTotal += 3;
  } else if (game.result === "1/2-1/2") {
    whiteStats.draws += 1;
    blackStats.draws += 1;
    whiteStats.pointsTotal += 1;
    blackStats.pointsTotal += 1;
  }

  const now = nowIso();
  whiteStats.updatedAt = now;
  blackStats.updatedAt = now;

  game.statsApplied = true;
  game.updatedAt = now;
  saveDb();
}

module.exports = {
  initDb,
  getDb,
  saveDb,
  getUserById,
  getUserByTelegramId,
  upsertTelegramUser,
  upsertDevUser,
  getStatsByUserId,
  listUsers,
  listGames,
  listGamesByUser,
  getGameById,
  listActiveGames,
  createGame,
  touchGame,
  applyResultToStats,
};
