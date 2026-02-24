const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const EMPTY_DB = {
  meta: {
    ratingSystemVersion: 2,
    ratingSystem: "tournament_1_0.5_0",
  },
  users: [],
  stats: {},
  games: [],
  tables: [],
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
  if (!Array.isArray(db.tables)) db.tables = [];

  let changed = false;
  if (!db.meta || typeof db.meta !== "object") {
    db.meta = {};
    changed = true;
  }
  for (const user of db.users) {
    if (!user || typeof user !== "object") continue;
    if (user.hintMode !== "training" && user.hintMode !== "pro") {
      user.hintMode = "training";
      changed = true;
    }
  }
  for (const game of db.games) {
    if (!game || typeof game !== "object") continue;
    if (typeof game.rated !== "boolean") {
      game.rated = true;
      changed = true;
    }
    if (!("tournament" in game)) {
      game.tournament = null;
      changed = true;
    }
    if (game.timeControlMode !== "timed" && game.timeControlMode !== "untimed") {
      game.timeControlMode = "untimed";
      changed = true;
    }
    if (game.timeControlMode === "timed") {
      if (!Number.isFinite(Number(game.perMoveSeconds)) || Number(game.perMoveSeconds) <= 0) {
        game.perMoveSeconds = 60;
        changed = true;
      }
      if (!game.turnStartedAt) {
        game.turnStartedAt = game.startedAt || nowIso();
        changed = true;
      }
    } else {
      if (game.perMoveSeconds != null) {
        game.perMoveSeconds = null;
        changed = true;
      }
      if (game.turnStartedAt != null) {
        game.turnStartedAt = null;
        changed = true;
      }
    }
  }
  for (const table of db.tables) {
    if (!table || typeof table !== "object") continue;
    if (table.gameMode !== "timed" && table.gameMode !== "untimed") {
      table.gameMode = "untimed";
      changed = true;
    }
  }
  // One-time migration to tournament scoring (1 / 0.5 / 0).
  // Do not recalculate on every boot: it can make rating look unstable on deploys.
  if (db.meta.ratingSystemVersion !== 2) {
    rebuildStatsFromFinishedRatedGames();
    db.meta.ratingSystemVersion = 2;
    db.meta.ratingSystem = "tournament_1_0.5_0";
    changed = true;
  }

  if (changed) saveDb();
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
    if (existing.hintMode !== "training" && existing.hintMode !== "pro") {
      existing.hintMode = "training";
    }
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
    hintMode: "training",
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
    if (existing.hintMode !== "training" && existing.hintMode !== "pro") {
      existing.hintMode = "training";
    }
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
    hintMode: "training",
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

function listOpenTables() {
  return getDb().tables.filter((t) => t.status === "open");
}

function getOpenTableByOwner(ownerUserId) {
  return listOpenTables().find((t) => t.ownerUserId === ownerUserId) || null;
}

function createOpenTable(ownerUserId, options = {}) {
  const dbRef = getDb();
  const existing = getOpenTableByOwner(ownerUserId);
  const gameMode = options.gameMode === "timed" ? "timed" : "untimed";
  if (existing) {
    if (existing.gameMode !== gameMode) {
      existing.gameMode = gameMode;
      existing.updatedAt = nowIso();
      saveDb();
    }
    return existing;
  }

  const now = nowIso();
  const table = {
    id: crypto.randomUUID(),
    ownerUserId,
    gameMode,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  dbRef.tables.push(table);
  saveDb();
  return table;
}

function removeOpenTableByOwner(ownerUserId) {
  const dbRef = getDb();
  const before = dbRef.tables.length;
  dbRef.tables = dbRef.tables.filter((t) => !(t.ownerUserId === ownerUserId && t.status === "open"));
  const changed = dbRef.tables.length !== before;
  if (changed) {
    saveDb();
  }
  return changed;
}

function setUserHintMode(userId, hintMode) {
  if (hintMode !== "training" && hintMode !== "pro") {
    return null;
  }
  const user = getUserById(userId);
  if (!user) return null;
  user.hintMode = hintMode;
  user.updatedAt = nowIso();
  saveDb();
  return user;
}

function listActiveGames() {
  return getDb().games.filter((g) => g.status === "active");
}

function createGame({
  whiteUserId,
  blackUserId,
  fen,
  rated = true,
  timeControlMode = "untimed",
  perMoveSeconds = null,
  turnStartedAt = null,
  tournament = null,
}) {
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
    rated: !!rated,
    timeControlMode: timeControlMode === "timed" ? "timed" : "untimed",
    perMoveSeconds: timeControlMode === "timed" ? Number(perMoveSeconds) || 60 : null,
    turnStartedAt: timeControlMode === "timed" ? (turnStartedAt || now) : null,
    tournament: tournament && typeof tournament === "object" ? { ...tournament } : null,
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

function rebuildStatsFromFinishedRatedGames() {
  const dbRef = getDb();
  const now = nowIso();
  const nextStats = {};

  function ensure(userId) {
    if (!nextStats[userId]) {
      nextStats[userId] = {
        userId,
        wins: 0,
        losses: 0,
        draws: 0,
        gamesTotal: 0,
        pointsTotal: 0,
        updatedAt: now,
      };
    }
    return nextStats[userId];
  }

  for (const user of dbRef.users) {
    if (!user || !user.id) continue;
    ensure(user.id);
  }

  for (const game of dbRef.games) {
    if (!game || game.status !== "finished" || game.rated === false) continue;

    const white = ensure(game.whiteUserId);
    const black = ensure(game.blackUserId);

    white.gamesTotal += 1;
    black.gamesTotal += 1;

    if (game.result === "1-0") {
      white.wins += 1;
      black.losses += 1;
      white.pointsTotal += 1;
    } else if (game.result === "0-1") {
      black.wins += 1;
      white.losses += 1;
      black.pointsTotal += 1;
    } else if (game.result === "1/2-1/2") {
      white.draws += 1;
      black.draws += 1;
      white.pointsTotal += 0.5;
      black.pointsTotal += 0.5;
    }
  }

  dbRef.stats = nextStats;
  saveDb();
}

function applyResultToStats(game) {
  if (game.statsApplied) return;
  if (game.rated === false) {
    game.statsApplied = true;
    game.updatedAt = nowIso();
    saveDb();
    return;
  }

  const whiteStats = ensureStats(game.whiteUserId);
  const blackStats = ensureStats(game.blackUserId);

  whiteStats.gamesTotal += 1;
  blackStats.gamesTotal += 1;

  if (game.result === "1-0") {
    whiteStats.wins += 1;
    blackStats.losses += 1;
    whiteStats.pointsTotal += 1;
  } else if (game.result === "0-1") {
    blackStats.wins += 1;
    whiteStats.losses += 1;
    blackStats.pointsTotal += 1;
  } else if (game.result === "1/2-1/2") {
    whiteStats.draws += 1;
    blackStats.draws += 1;
    whiteStats.pointsTotal += 0.5;
    blackStats.pointsTotal += 0.5;
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
  listOpenTables,
  getOpenTableByOwner,
  createOpenTable,
  removeOpenTableByOwner,
  setUserHintMode,
  listActiveGames,
  createGame,
  touchGame,
  applyResultToStats,
};
