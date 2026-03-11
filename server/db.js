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
  puzzlebotEvents: [],
  referrals: [],
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
  if (!Array.isArray(db.puzzlebotEvents)) db.puzzlebotEvents = [];
  if (!Array.isArray(db.referrals)) db.referrals = [];

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

function addPuzzlebotEvent(event) {
  const dbRef = getDb();
  const entry = event && typeof event === "object"
    ? {
        id: crypto.randomUUID(),
        createdAt: nowIso(),
        ...event,
      }
    : {
        id: crypto.randomUUID(),
        createdAt: nowIso(),
        payload: null,
      };

  dbRef.puzzlebotEvents.push(entry);
  if (dbRef.puzzlebotEvents.length > 200) {
    dbRef.puzzlebotEvents = dbRef.puzzlebotEvents.slice(-200);
  }
  saveDb();
  return entry;
}

function listPuzzlebotEvents(limit = 50) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 200) : 50;
  return getDb().puzzlebotEvents
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, safeLimit);
}

function upsertPendingReferral(entry) {
  const dbRef = getDb();
  const invitedTelegramId = String(entry?.invitedTelegramId || "").trim();
  const inviterTelegramId = String(entry?.inviterTelegramId || "").trim();
  const linkKey = String(entry?.linkKey || "").trim();
  if (!invitedTelegramId || !inviterTelegramId || !linkKey) {
    return null;
  }

  const now = nowIso();
  const existing = dbRef.referrals.find((item) => (
    item
    && String(item.source || "") === String(entry.source || "puzzlebot")
    && String(item.invitedTelegramId || "") === invitedTelegramId
    && String(item.linkKey || "") === linkKey
  ));

  if (existing) {
    existing.inviterTelegramId = inviterTelegramId;
    existing.activatedAt = entry.activatedAt || existing.activatedAt || now;
    existing.status = existing.status || "pending";
    existing.updatedAt = now;
    if (entry.payload !== undefined) {
      existing.payload = entry.payload;
    }
    saveDb();
    return existing;
  }

  const referral = {
    id: crypto.randomUUID(),
    source: String(entry.source || "puzzlebot"),
    linkKey,
    inviterTelegramId,
    invitedTelegramId,
    activatedAt: entry.activatedAt || now,
    linkedAt: null,
    qualifiedAt: null,
    bonusGrantedAt: null,
    inviterUserId: null,
    invitedUserId: null,
    qualifiedGameId: null,
    status: "pending",
    payload: entry.payload !== undefined ? entry.payload : null,
    createdAt: now,
    updatedAt: now,
  };

  dbRef.referrals.push(referral);
  saveDb();
  return referral;
}

function listReferrals(limit = 50) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 200) : 50;
  return getDb().referrals
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, safeLimit);
}

function findLatestPendingReferralByInvitedTelegramId(invitedTelegramId) {
  const targetId = String(invitedTelegramId || "").trim();
  if (!targetId) return null;

  return getDb().referrals
    .filter((item) => (
      item
      && String(item.invitedTelegramId || "") === targetId
      && String(item.status || "") === "pending"
    ))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0] || null;
}

function linkPendingReferralToUser(invitedTelegramId, invitedUserId) {
  const referral = findLatestPendingReferralByInvitedTelegramId(invitedTelegramId);
  if (!referral) return null;

  const dbRef = getDb();
  const now = nowIso();
  referral.invitedUserId = invitedUserId || referral.invitedUserId || null;

  const inviter = dbRef.users.find((user) => String(user.tgId || "") === String(referral.inviterTelegramId || ""));
  if (inviter) {
    referral.inviterUserId = inviter.id;
  }

  referral.status = "linked";
  referral.linkedAt = now;
  referral.updatedAt = now;
  saveDb();
  return referral;
}

function syncReferralUserLinksByTelegramId(telegramId, userId) {
  const tgId = String(telegramId || "").trim();
  if (!tgId || !userId) return 0;

  const dbRef = getDb();
  const now = nowIso();
  let changed = 0;

  for (const referral of dbRef.referrals) {
    if (!referral || typeof referral !== "object") continue;

    if (String(referral.inviterTelegramId || "") === tgId && referral.inviterUserId !== userId) {
      referral.inviterUserId = userId;
      referral.updatedAt = now;
      changed += 1;
    }

    if (
      String(referral.invitedTelegramId || "") === tgId
      && String(referral.status || "") === "pending"
      && referral.invitedUserId !== userId
    ) {
      referral.invitedUserId = userId;
      referral.status = "linked";
      referral.linkedAt = referral.linkedAt || now;
      referral.updatedAt = now;
      changed += 1;
    }
  }

  if (changed > 0) {
    saveDb();
  }
  return changed;
}

function qualifyReferralForGame(game, options = {}) {
  if (!game || typeof game !== "object") return [];
  const minMoves = Number.isFinite(Number(options.minMoves)) ? Number(options.minMoves) : 5;
  if (game.status !== "finished") return [];
  if (game.rated === false) return [];
  if (Array.isArray(game.moves) && game.moves.length < minMoves) return [];

  const participantIds = [game.whiteUserId, game.blackUserId].filter(Boolean);
  const dbRef = getDb();
  const now = nowIso();
  const qualified = [];

  for (const invitedUserId of participantIds) {
    const referral = dbRef.referrals
      .filter((item) => (
        item
        && item.invitedUserId === invitedUserId
        && item.bonusGrantedAt == null
        && ["linked", "pending"].includes(String(item.status || ""))
      ))
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))[0];

    if (!referral) continue;
    if (!referral.inviterUserId && referral.inviterTelegramId) {
      const inviter = dbRef.users.find((user) => String(user.tgId || "") === String(referral.inviterTelegramId || ""));
      if (inviter) {
        referral.inviterUserId = inviter.id;
      }
    }
    if (!referral.inviterUserId) continue;

    referral.invitedUserId = invitedUserId;
    referral.status = "rewarded";
    referral.qualifiedAt = now;
    referral.bonusGrantedAt = now;
    referral.qualifiedGameId = game.id;
    referral.updatedAt = now;
    qualified.push(referral);
  }

  if (qualified.length > 0) {
    saveDb();
  }
  return qualified;
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
  addPuzzlebotEvent,
  listPuzzlebotEvents,
  upsertPendingReferral,
  listReferrals,
  findLatestPendingReferralByInvitedTelegramId,
  linkPendingReferralToUser,
  syncReferralUserLinksByTelegramId,
  qualifyReferralForGame,
};
