const state = {
  config: null,
  token: localStorage.getItem("chess_token") || "",
  me: null,
  stats: null,
  socket: null,
  waiting: [],
  incomingChallenges: [],
  activeGame: null,
  selectedSquare: null,
  history: [],
  leadersMode: "global",
  leadersRows: [],
  winnersRows: [],
  tournament: null,
  isAdmin: false,
  adminGamesLog: [],
  currentView: "lobby",
  noticeTimer: null,
  lobbyPollTimer: null,
  lobbyPollTick: 0,
  gamePollTimer: null,
  turnTimerTick: null,
  skin: "classic",
  bannerTimer: null,
  pendingInviteId: "",
  consumedInviteId: "",
};

/** Telegram Mini App: available only when opened from Telegram bot */
function getTelegramWebApp() {
  return typeof window !== "undefined" && window.Telegram?.WebApp;
}

const THEME_KEY = "chess_theme";
const SKIN_KEY = "chess_skin";
const SKIN_ROLLOUT_KEY = "skin_rollout_2026_02_23";
const SKINS = {
  classic: {
    title: "Chess Mini App",
    banners: [
      "\u041a\u043b\u0430\u0441\u0441\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0440\u0435\u0436\u0438\u043c: \u0441\u043f\u043e\u043a\u043e\u0439\u043d\u0430\u044f \u0442\u0443\u0440\u043d\u0438\u0440\u043d\u0430\u044f \u0430\u0442\u043c\u043e\u0441\u0444\u0435\u0440\u0430",
      "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0441\u0442\u043e\u043b \u0438 \u0436\u0434\u0438\u0442\u0435 \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0430 \u0432 \u0443\u0434\u043e\u0431\u043d\u043e\u0435 \u0432\u0440\u0435\u043c\u044f",
      "\u0422\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0438 \u0441 \u0431\u043e\u0442\u043e\u043c \u043d\u0435 \u0432\u043b\u0438\u044f\u044e\u0442 \u043d\u0430 \u0440\u0435\u0439\u0442\u0438\u043d\u0433",
    ],
  },
  feb23: {
    title: "\u0032\u0033 \u0444\u0435\u0432\u0440\u0430\u043b\u044f",
    banners: [
      "\u0421 \u043f\u0440\u0430\u0437\u0434\u043d\u0438\u043a\u043e\u043c! \u0421\u0438\u043b\u0430 \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u0438 \u0438 \u0445\u0430\u0440\u0430\u043a\u0442\u0435\u0440 \u043f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044f",
      "\u0411\u043e\u0435\u0432\u043e\u0439 \u043d\u0430\u0441\u0442\u0440\u043e\u0439: \u0437\u0430\u0449\u0438\u0442\u0430, \u043a\u043e\u043d\u0442\u0440\u0430\u0442\u0430\u043a\u0430 \u0438 \u0442\u043e\u0447\u043d\u044b\u0439 \u0440\u0430\u0441\u0447\u0435\u0442",
      "\u041f\u0440\u0430\u0437\u0434\u043d\u0438\u0447\u043d\u044b\u0439 \u0441\u043a\u0438\u043d \u0430\u043a\u0442\u0438\u0432\u0435\u043d. \u0418\u0433\u0440\u0430\u0439\u0442\u0435 \u0438 \u043f\u043e\u0431\u0435\u0436\u0434\u0430\u0439\u0442\u0435",
    ],
  },
  mar8: {
    title: "\u0038 \u043c\u0430\u0440\u0442\u0430",
    banners: [
      "\u0412\u0435\u0441\u0435\u043d\u043d\u0438\u0439 \u0440\u0435\u0436\u0438\u043c: \u0438\u0433\u0440\u0430\u0439\u0442\u0435 \u0441\u043f\u043e\u043a\u043e\u0439\u043d\u043e \u0438 \u0432 \u0441\u0432\u043e\u0435\u043c \u0442\u0435\u043c\u043f\u0435",
      "\u0417\u0435\u043b\u0435\u043d\u043e-\u0440\u043e\u0437\u043e\u0432\u0430\u044f \u0442\u0435\u043c\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0430",
      "\u0414\u043e\u0431\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u0441\u0435\u0437\u043e\u043d\u043d\u044b\u0435 \u0442\u0435\u043c\u044b \u0432 \u043f\u0440\u043e\u0444\u0438\u043b\u0435",
    ],
  },
};

function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  if (refs.themeToggle) {
    refs.themeToggle.textContent = next === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";
    refs.themeToggle.setAttribute(
      "title",
      next === "dark"
        ? "\u0421\u0432\u0435\u0442\u043b\u0430\u044f \u0442\u0435\u043c\u0430"
        : "\u0422\u0435\u043c\u043d\u0430\u044f \u0442\u0435\u043c\u0430",
    );
  }
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) {}
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const tg = getTelegramWebApp();
  const tgDark = tg && tg.colorScheme === "dark";
  if (saved) {
    applyTheme(saved);
  } else if (tgDark) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }
  if (tg && tg.onEvent) {
    tg.onEvent("themeChanged", () => {
      if (!localStorage.getItem(THEME_KEY)) applyTheme(tg.colorScheme === "dark" ? "dark" : "light");
    });
  }
}

function applySkin(skinId) {
  const next = SKINS[skinId] ? skinId : "classic";
  state.skin = next;
  document.documentElement.setAttribute("data-skin", next);
  try {
    localStorage.setItem(SKIN_KEY, next);
  } catch (_) {}
  renderBanner(0);
}

function initSkin() {
  const rolloutApplied = localStorage.getItem(SKIN_ROLLOUT_KEY) === "1";
  if (!rolloutApplied) {
    applySkin("feb23");
    try {
      localStorage.setItem(SKIN_ROLLOUT_KEY, "1");
    } catch (_) {}
  } else {
    const saved = localStorage.getItem(SKIN_KEY);
    applySkin(saved || "feb23");
  }
  startBannerRotation();
}

function renderBanner(step = null) {
  if (!refs.skinBannerTitle || !refs.skinBannerText) return;
  const skin = SKINS[state.skin] || SKINS.classic;
  const messages = skin.banners || [];
  const len = Math.max(1, messages.length);
  const index = typeof step === "number"
    ? step % len
    : Number(refs.skinBannerText.dataset.bannerIndex || "0") % len;

  refs.skinBannerTitle.textContent = skin.title;
  refs.skinBannerText.textContent = messages[index] || "";
  refs.skinBannerText.dataset.bannerIndex = String((index + 1) % len);
}

function startBannerRotation() {
  if (state.bannerTimer) {
    clearInterval(state.bannerTimer);
  }
  renderBanner(0);
  state.bannerTimer = setInterval(() => renderBanner(), 5500);
}

function initTelegramWebApp() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  tg.ready();
  tg.expand();
  initTheme();

  if (tg.BackButton) {
    tg.BackButton.onClick(() => {
      tg.BackButton.hide();
      setView("lobby");
    });
  }
}

const PIECES = {
  p: "\u265F",
  r: "\u265C",
  n: "\u265E",
  b: "\u265D",
  q: "\u265B",
  k: "\u265A",
  P: "\u2659",
  R: "\u2656",
  N: "\u2658",
  B: "\u2657",
  Q: "\u2655",
  K: "\u2654",
};

const FILES = "abcdefgh";

const refs = {
  notice: document.getElementById("notice"),
  authScreen: document.getElementById("authScreen"),
  appScreen: document.getElementById("appScreen"),
  authStatus: document.getElementById("authStatus"),
  devAuthBlock: document.getElementById("devAuthBlock"),
  devName: document.getElementById("devName"),
  devLoginBtn: document.getElementById("devLoginBtn"),
  whoami: document.getElementById("whoami"),
  skinBannerTitle: document.getElementById("skinBannerTitle"),
  skinBannerText: document.getElementById("skinBannerText"),
  connectionBadge: document.getElementById("connectionBadge"),
  themeToggle: document.getElementById("themeToggle"),
  waitingList: document.getElementById("waitingList"),
  incomingChallenges: document.getElementById("incomingChallenges"),
  lobbyLeaders: document.getElementById("lobbyLeaders"),
  board: document.getElementById("board"),
  boardAxisRanks: document.getElementById("boardAxisRanks"),
  boardAxisFiles: document.getElementById("boardAxisFiles"),
  gameMeta: document.getElementById("gameMeta"),
  gamePlayersStrip: document.getElementById("gamePlayersStrip"),
  playerWhiteAvatar: document.getElementById("playerWhiteAvatar"),
  playerWhiteName: document.getElementById("playerWhiteName"),
  playerBlackAvatar: document.getElementById("playerBlackAvatar"),
  playerBlackName: document.getElementById("playerBlackName"),
  playerTurnBadge: document.getElementById("playerTurnBadge"),
  drawOfferBlock: document.getElementById("drawOfferBlock"),
  drawAcceptBtn: document.getElementById("drawAcceptBtn"),
  drawDeclineBtn: document.getElementById("drawDeclineBtn"),
  moveList: document.getElementById("moveList"),
  gameTurnTimer: document.getElementById("gameTurnTimer"),
  profileStats: document.getElementById("profileStats"),
  leadersInfo: document.getElementById("leadersInfo"),
  leadersTable: document.getElementById("leadersTable"),
  historyList: document.getElementById("historyList"),
  tournamentStatus: document.getElementById("tournamentStatus"),
  tournamentRegisterBtn: document.getElementById("tournamentRegisterBtn"),
  tournamentSlots: document.getElementById("tournamentSlots"),
  tournamentBracket: document.getElementById("tournamentBracket"),
  tournamentSummary: document.getElementById("tournamentSummary"),
  joinQueueTimedBtn: document.getElementById("joinQueueTimedBtn"),
  joinQueueUntimedBtn: document.getElementById("joinQueueUntimedBtn"),
  inviteFriendBtn: document.getElementById("inviteFriendBtn"),
  startBotGameBtn: document.getElementById("startBotGameBtn"),
  leaveQueueBtn: document.getElementById("leaveQueueBtn"),
  offerDrawBtn: document.getElementById("offerDrawBtn"),
  resignBtn: document.getElementById("resignBtn"),
  rematchBtn: document.getElementById("rematchBtn"),
  loadGlobalBtn: document.getElementById("loadGlobalBtn"),
  loadDailyBtn: document.getElementById("loadDailyBtn"),
  loadWinnersBtn: document.getElementById("loadWinnersBtn"),
};

function showNotice(text) {
  refs.notice.textContent = text;
  refs.notice.classList.remove("hidden");
  if (state.noticeTimer) {
    clearTimeout(state.noticeTimer);
  }
  state.noticeTimer = setTimeout(() => {
    refs.notice.classList.add("hidden");
  }, 2400);
}

function setAuthStatus(text) {
  refs.authStatus.textContent = text;
}

function setConnectionBadge(text) {
  refs.connectionBadge.textContent = text;
}

function setView(view) {
  state.currentView = view;

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("hidden", el.id !== `view-${view}`);
  });

  if (view === "lobby") renderLobbyLeaders();
  if (view === "tournament") {
    renderTournament();
    if (state.token) loadTournament().catch(() => {});
  }
  if (view === "profile" && state.isAdmin && !state.adminGamesLog.length) {
    loadAdminGamesLog().catch(() => {});
  }

  const tg = getTelegramWebApp();
  if (tg?.BackButton) {
    const onGameTab = view === "game";
    const activeMatch = state.activeGame && state.activeGame.status === "active";
    if (onGameTab) {
      tg.BackButton.show();
      if (activeMatch) tg.enableClosingConfirmation?.();
      else tg.disableClosingConfirmation?.();
    } else {
      tg.BackButton.hide();
      tg.disableClosingConfirmation?.();
    }
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const resp = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    const message = payload.error || `HTTP ${resp.status}`;
    throw new Error(message);
  }

  return payload;
}

function normalizeInviteId(value) {
  const inviteId = String(value || "").trim();
  return /^[a-z0-9_-]{6,120}$/i.test(inviteId) ? inviteId : "";
}

function parseInviteStartParam(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("inv_")) {
    return normalizeInviteId(value.slice(4));
  }
  return "";
}

function resolveInviteIdFromUrlAndTelegram() {
  const tg = getTelegramWebApp();
  const tgStart = parseInviteStartParam(tg?.initDataUnsafe?.start_param || "");
  if (tgStart) return tgStart;

  const searchParams = new URLSearchParams(window.location.search);
  const fromSearchStart = parseInviteStartParam(searchParams.get("tgWebAppStartParam") || searchParams.get("startapp"));
  if (fromSearchStart) return fromSearchStart;

  const fromSearch = normalizeInviteId(searchParams.get("invite"));
  if (fromSearch) return fromSearch;

  const rawHash = String(window.location.hash || "");
  if (rawHash.startsWith("#")) {
    const hashParams = new URLSearchParams(rawHash.slice(1));
    const fromHashStart = parseInviteStartParam(hashParams.get("tgWebAppStartParam") || hashParams.get("startapp"));
    if (fromHashStart) return fromHashStart;

    const fromHash = normalizeInviteId(hashParams.get("invite"));
    if (fromHash) return fromHash;
  }

  return "";
}

function clearInviteFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState({}, "", url.toString());
}

function myQueueGameMode() {
  if (!state.me) return "untimed";
  const meRow = (state.waiting || []).find((w) => w.id === state.me.id);
  return normalizeGameMode(meRow?.gameMode);
}

function normalizeGameMode(value) {
  return String(value || "").trim() === "timed" ? "timed" : "untimed";
}

function buildInviteLaunchUrl(inviteId) {
  const safeInviteId = normalizeInviteId(inviteId);
  if (!safeInviteId) return "";

  const botUsername = String(state.config?.telegramBotUsername || "").trim().replace(/^@+/, "");
  const miniAppShortName = String(state.config?.telegramMiniAppShortName || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (botUsername && miniAppShortName) {
    return `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodeURIComponent(`inv_${safeInviteId}`)}`;
  }

  const fallbackBase = `${window.location.origin}${window.location.pathname}`;
  const base = String(state.config?.webAppUrl || "").trim() || fallbackBase;
  try {
    const launchUrl = new URL(base);
    launchUrl.searchParams.set("invite", safeInviteId);
    return launchUrl.toString();
  } catch {
    const launchUrl = new URL(fallbackBase);
    launchUrl.searchParams.set("invite", safeInviteId);
    return launchUrl.toString();
  }
}

async function inviteFriend() {
  if (!state.me) return;

  try {
    const gameMode = myQueueGameMode();
    const data = await api("/api/invite/create", {
      method: "POST",
      body: { gameMode },
    });

    if (Array.isArray(data?.waiting)) {
      state.waiting = data.waiting;
      renderWaiting();
    }

    const launchUrl = buildInviteLaunchUrl(data.inviteId);
    if (!launchUrl) {
      showNotice("Не удалось сформировать ссылку приглашения");
      return;
    }

    const shareText = "Заходи сыграть со мной в шахматы";
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(launchUrl)}&text=${encodeURIComponent(shareText)}`;
    const tg = getTelegramWebApp();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    }
  } catch (err) {
    showNotice(err.message);
  }
}

async function consumePendingInvite() {
  const inviteId = normalizeInviteId(state.pendingInviteId);
  if (!inviteId) return false;
  if (state.consumedInviteId === inviteId) return false;
  state.consumedInviteId = inviteId;

  try {
    const data = await api("/api/invite/accept", {
      method: "POST",
      body: { inviteId },
    });
    state.pendingInviteId = "";
    clearInviteFromUrl();

    if (data?.gameId) {
      await openGameFromHistory(data.gameId);
      showNotice("Матч по приглашению запущен");
      return true;
    }
  } catch (err) {
    showNotice(`Приглашение: ${err.message}`);
  }
  return false;
}

function fenToSquareMap(fen) {
  const boardPart = String(fen || "").split(" ")[0] || "";
  const rows = boardPart.split("/");
  const map = {};

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const rank = 8 - rowIdx;
    let fileIndex = 0;

    for (const char of rows[rowIdx]) {
      const n = Number(char);
      if (!Number.isNaN(n)) {
        fileIndex += n;
        continue;
      }

      const file = FILES[fileIndex];
      map[`${file}${rank}`] = char;
      fileIndex += 1;
    }
  }

  return map;
}

function squareOrder(viewerColor) {
  const ranks = viewerColor === "black" ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = viewerColor === "black" ? [...FILES].reverse() : [...FILES];

  const squares = [];
  for (const rank of ranks) {
    for (const file of files) {
      squares.push(`${file}${rank}`);
    }
  }
  return squares;
}

function isSquareLight(square) {
  const file = square.charCodeAt(0) - 96;
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}

function isMyTurn(game) {
  if (!game || game.status !== "active") return false;
  return game.viewerColor === game.turnColor;
}

function isProMode() {
  return state.me?.hintMode === "pro";
}

function userNameHtml(user, fallback = "Unknown") {
  const name = escapeHtml(user?.displayName || fallback);
  const link = String(user?.telegramLink || "").trim();
  if (!link) return name;
  return `<a class="user-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${name}</a>`;
}

function formatDayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ""));
  if (!m) return escapeHtml(String(day || ""));
  return `${m[3]}.${m[2]}`;
}

function formatWinnersPeriodLabel(row) {
  const start = formatDayLabel(row?.periodStart || row?.date || "");
  const end = formatDayLabel(row?.periodEnd || row?.date || "");
  if (!row?.periodStart || !row?.periodEnd || row.periodStart === row.periodEnd) {
    return end;
  }
  return `${start} - ${end}`;
}

function queueModeLabel(mode) {
  return mode === "timed"
    ? "\u043d\u0430 \u0432\u0440\u0435\u043c\u044f (60\u0441/\u0445\u043e\u0434)"
    : "\u0431\u0435\u0437 \u0432\u0440\u0435\u043c\u0435\u043d\u0438";
}

function gameModeLabel(mode) {
  return mode === "timed"
    ? "\u0420\u0435\u0436\u0438\u043c: \u043d\u0430 \u0432\u0440\u0435\u043c\u044f (60\u0441/\u0445\u043e\u0434)"
    : "\u0420\u0435\u0436\u0438\u043c: \u0431\u0435\u0437 \u0432\u0440\u0435\u043c\u0435\u043d\u0438";
}

function tournamentStatusLabel(status) {
  if (status === "registration") return "Идет регистрация";
  if (status === "round1") return "Первый раунд";
  if (status === "round2") return "Финальный раунд";
  return status || "-";
}

function renderTournament() {
  const data = state.tournament;
  if (!refs.tournamentStatus || !refs.tournamentSlots || !refs.tournamentBracket || !refs.tournamentSummary) return;

  if (!data) {
    refs.tournamentStatus.textContent = "Загрузка турнира...";
    refs.tournamentSlots.innerHTML = '<div class="muted">-</div>';
    refs.tournamentBracket.innerHTML = '<div class="muted">-</div>';
    refs.tournamentSummary.innerHTML = '<div class="muted">-</div>';
    if (refs.tournamentRegisterBtn) refs.tournamentRegisterBtn.disabled = true;
    return;
  }

  const slotRows = [];
  for (let i = 0; i < (data.slotsMax || 4); i += 1) {
    const user = data.slots?.[i] || null;
    slotRows.push(`<div class="list-item"><div class="tournament-slot">Слот ${i + 1}: ${user ? userNameHtml(user, "Участник") : "свободно"}</div></div>`);
  }
  refs.tournamentSlots.innerHTML = slotRows.join("");

  const round1 = data.round1 || [];
  const round2 = data.round2 || [];
  const matchRows = [];
  for (const m of [...round1, ...round2]) {
    const left = userNameHtml(m.userA, "Игрок A");
    const right = userNameHtml(m.userB, "Игрок B");
    const winner = m.winner ? userNameHtml(m.winner, "—") : "—";
    const bracketLabel = m.bracket === "final" ? "Финал (за 1 место)" : m.bracket === "third" ? "Матч за 3 место" : "Раунд 1";
    const openBtn = m.gameId && (m.userA?.id === state.me?.id || m.userB?.id === state.me?.id)
      ? `<button class="ghost" type="button" data-open-game="${escapeHtml(m.gameId)}">Открыть</button>`
      : "";
    matchRows.push(`<div class="list-item"><div><div><strong>${bracketLabel}</strong></div><div>${left} vs ${right}</div><div class="meta">Победитель: ${winner}${m.tieBreak ? " (тай-брейк)" : ""}</div></div>${openBtn}</div>`);
  }
  refs.tournamentBracket.innerHTML = matchRows.length ? matchRows.join("") : '<div class="muted">Сетка появится после заполнения 4 слотов</div>';

  const summary = data.lastSummary;
  if (summary?.standings?.length) {
    refs.tournamentSummary.innerHTML = summary.standings
      .map((row) => `<div class="list-item"><div><strong>${row.place} место</strong>: ${userNameHtml(row.user, "Игрок")}</div></div>`)
      .join("");
  } else {
    refs.tournamentSummary.innerHTML = '<div class="muted">Пока нет завершенных турниров</div>';
  }

  const slotsCount = Array.isArray(data.slots) ? data.slots.length : 0;
  refs.tournamentStatus.textContent = `${tournamentStatusLabel(data.status)} | Слотов: ${slotsCount}/${data.slotsMax || 4}`;

  if (refs.tournamentRegisterBtn) {
    const alreadyIn = (data.participants || []).some((u) => u?.id === state.me?.id);
    refs.tournamentRegisterBtn.disabled = data.status !== "registration" || alreadyIn || slotsCount >= (data.slotsMax || 4);
    refs.tournamentRegisterBtn.textContent = alreadyIn ? "Вы зарегистрированы" : "Зарегистрироваться";
  }

  refs.tournamentBracket.querySelectorAll("[data-open-game]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const gameId = btn.getAttribute("data-open-game");
      if (gameId) openGameFromHistory(gameId);
    });
  });
}

function stopTurnTimer() {
  if (state.turnTimerTick) {
    clearInterval(state.turnTimerTick);
    state.turnTimerTick = null;
  }
}

function renderTurnTimer(game) {
  if (!refs.gameTurnTimer) return;

  if (!game || game.status !== "active" || game.timeControlMode !== "timed" || !game.turnDeadlineAt) {
    stopTurnTimer();
    refs.gameTurnTimer.classList.add("hidden");
    refs.gameTurnTimer.textContent = "";
    return;
  }

  const update = () => {
    const remainingMs = new Date(game.turnDeadlineAt).getTime() - Date.now();
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    refs.gameTurnTimer.textContent = `\u0422\u0430\u0439\u043c\u0435\u0440 \u0445\u043e\u0434\u0430: ${seconds}\u0441`;
    refs.gameTurnTimer.classList.remove("hidden");
    if (seconds <= 0) {
      refs.gameTurnTimer.textContent = "\u0422\u0430\u0439\u043c\u0435\u0440 \u0445\u043e\u0434\u0430: 0\u0441 (\u043e\u0436\u0438\u0434\u0430\u0435\u043c \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435 \u0445\u043e\u0434\u0430)";
    }
  };

  update();
  stopTurnTimer();
  state.turnTimerTick = setInterval(update, 1000);
}

function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`", "&#096;");
}

function renderWaiting() {
  if (!state.waiting.length) {
    refs.waitingList.innerHTML = '<div class="muted">Сейчас очередь пустая</div>';
    return;
  }

  refs.waitingList.innerHTML = "";

  for (const user of state.waiting) {
    const item = document.createElement("div");
    item.className = "list-item";

    const left = document.createElement("div");
    left.innerHTML = `
      <div>${userNameHtml(user)} ${user.id === state.me?.id ? "(you)" : ""}</div>
      <div class="meta">${escapeHtml(statusLabel(user.status))} | ${escapeHtml(queueModeLabel(user.gameMode))}</div>
    `;

    item.appendChild(left);

    if (state.me && user.id !== state.me.id) {
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = "Join";
      btn.onclick = async () => {
        try {
          const data = await api("/api/lobby/queue/join-user", {
            method: "POST",
            body: { toUserId: user.id },
          });
          if (data?.gameId) {
            await openGameFromHistory(data.gameId);
          }
          showNotice(`Game started with ${user.displayName}`);
        } catch (err) {
          showNotice(err.message);
        }
      };
      item.appendChild(btn);
    }

    refs.waitingList.appendChild(item);
  }
}

function renderIncomingChallenges() {
  if (!state.incomingChallenges.length) {
    refs.incomingChallenges.innerHTML = '<div class="muted">Нет входящих вызовов</div>';
    return;
  }

  refs.incomingChallenges.innerHTML = "";

  for (const challenge of state.incomingChallenges) {
    const item = document.createElement("div");
    item.className = "list-item";

    const left = document.createElement("div");
    left.innerHTML = `
      <div>${userNameHtml(challenge.fromUser)}</div>
      <div class="meta">Вызов в партию</div>
    `;

    const controls = document.createElement("div");
    controls.className = "actions-row";

    const acceptBtn = document.createElement("button");
    acceptBtn.className = "primary";
    acceptBtn.textContent = "Принять";
    acceptBtn.onclick = () => respondChallenge(challenge.id, true);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "ghost";
    rejectBtn.textContent = "Отклонить";
    rejectBtn.onclick = () => respondChallenge(challenge.id, false);

    controls.appendChild(acceptBtn);
    controls.appendChild(rejectBtn);

    item.appendChild(left);
    item.appendChild(controls);
    refs.incomingChallenges.appendChild(item);
  }
  renderLobbyLeaders();
}

function renderLobbyLeaders() {
  if (!refs.lobbyLeaders) return;
  const rows = (state.leadersRows || []).slice(0, 10);
  if (!rows.length) {
    refs.lobbyLeaders.innerHTML = '<div class="muted">Loading leaderboard...</div>';
    return;
  }

  refs.lobbyLeaders.innerHTML =     `<table class="table table-compact">
      <thead>
        <tr><th>#</th><th>Player</th><th>Points</th></tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const me = r.user?.id === state.me?.id;
          return `<tr class="${me ? "me" : ""}"><td>${r.rank}</td><td>${userNameHtml(r.user, "Unknown")}</td><td>${r.points}</td></tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function renderGame() {
  const game = state.activeGame;

  if (!game) {
    refs.gameMeta.textContent = "Нет активной партии";
    refs.board.innerHTML = "";
    if (refs.boardAxisRanks) refs.boardAxisRanks.innerHTML = "";
    if (refs.boardAxisFiles) refs.boardAxisFiles.innerHTML = "";
    refs.moveList.innerHTML = '<div class="muted">Ходы появятся после старта партии</div>';
    if (refs.gamePlayersStrip) refs.gamePlayersStrip.classList.add("hidden");
    stopTurnTimer();
    if (refs.gameTurnTimer) {
      refs.gameTurnTimer.classList.add("hidden");
      refs.gameTurnTimer.textContent = "";
    }
    return;
  }

  const white = game.players?.white?.displayName || "Белые";
  const black = game.players?.black?.displayName || "Черные";
  const opponent = game.viewerColor === "white" ? black : white;
  const viewerSide = game.viewerColor === "white" ? "белые" : "черные";

  const turnText = game.status === "active" ? `Ход: ${game.turnColor === "white" ? "белые" : "черные"}` : "Партия завершена";
  const statusText = game.status === "active" ? (isMyTurn(game) ? "Ваш ход" : "Ход соперника") : game.finishReason || "finished";

  refs.gameMeta.textContent = `Вы: ${viewerSide} | Соперник: ${opponent} | ${turnText} | ${statusText} | ${gameModeLabel(game.timeControlMode)}`;
  renderTurnTimer(game);

  if (refs.gamePlayersStrip) {
    refs.gamePlayersStrip.classList.remove("hidden");
    const white = game.players?.white;
    const black = game.players?.black;
    const whiteName = white?.displayName || "Белые";
    const blackName = black?.displayName || "Черные";
    if (refs.playerWhiteAvatar) {
      refs.playerWhiteAvatar.innerHTML = white?.avatarUrl
        ? `<img src="${escapeHtml(white.avatarUrl)}" alt="">`
        : `<span class="avatar-initial">${escapeHtml((whiteName[0] || "Б").toUpperCase())}</span>`;
    }
    if (refs.playerWhiteName) refs.playerWhiteName.innerHTML = userNameHtml(white, whiteName);
    if (refs.playerBlackAvatar) {
      refs.playerBlackAvatar.innerHTML = black?.avatarUrl
        ? `<img src="${escapeHtml(black.avatarUrl)}" alt="">`
        : `<span class="avatar-initial">${escapeHtml((blackName[0] || "Ч").toUpperCase())}</span>`;
    }
    if (refs.playerBlackName) refs.playerBlackName.innerHTML = userNameHtml(black, blackName);
    if (refs.playerTurnBadge) {
      refs.playerTurnBadge.textContent = game.status === "active"
        ? (game.turnColor === "white" ? "Ход белых" : "Ход черных")
        : "Партия завершена";
    }
  }

  const pieceMap = fenToSquareMap(game.fen);
  const legalMoves = game.legalMoves || {};
  const selected = state.selectedSquare;
  const targetSquares = selected && legalMoves[selected] ? legalMoves[selected].map((m) => m.to) : [];
  const showHints = !isProMode();

  refs.board.innerHTML = "";

  const squares = squareOrder(game.viewerColor);
  const rankLabels = game.viewerColor === "black"
    ? ["1", "2", "3", "4", "5", "6", "7", "8"]
    : ["8", "7", "6", "5", "4", "3", "2", "1"];
  const fileLabels = game.viewerColor === "black"
    ? ["h", "g", "f", "e", "d", "c", "b", "a"]
    : ["a", "b", "c", "d", "e", "f", "g", "h"];

  if (refs.boardAxisRanks) {
    refs.boardAxisRanks.innerHTML = rankLabels.map((v) => `<span>${v}</span>`).join("");
  }
  if (refs.boardAxisFiles) {
    refs.boardAxisFiles.innerHTML = fileLabels.map((v) => `<span>${v}</span>`).join("");
  }

  for (const square of squares) {
    const btn = document.createElement("button");
    btn.className = `square ${isSquareLight(square) ? "light" : "dark"}`;
    btn.dataset.square = square;

    if (showHints && selected === square) {
      btn.classList.add("selected");
    }

    if (showHints && targetSquares.includes(square)) {
      btn.classList.add("target");
    }

    const piece = pieceMap[square];
    if (piece) {
      btn.textContent = PIECES[piece] || "";
      btn.classList.add(piece === piece.toUpperCase() ? "piece-white" : "piece-black");
    } else if (showHints && targetSquares.includes(square)) {
      const hint = document.createElement("span");
      hint.className = "hint";
      btn.appendChild(hint);
    }

    btn.addEventListener("click", () => onSquareClick(square));
    refs.board.appendChild(btn);
  }

  const moveRows = (game.moves || []).map((m) => {
    return `<div class="move-row">${m.moveNo}. ${escapeHtml(m.san)} (${m.uci})</div>`;
  });
  refs.moveList.innerHTML = moveRows.length ? moveRows.join("") : '<div class="muted">Пока нет ходов</div>';

  refs.offerDrawBtn.disabled = game.status !== "active";
  refs.resignBtn.disabled = game.status !== "active";
  refs.rematchBtn.disabled = game.status !== "finished";

  if (refs.drawOfferBlock) {
    const showDrawOffer = game.status === "active" && game.drawOfferBy === "opponent";
    refs.drawOfferBlock.classList.toggle("hidden", !showDrawOffer);
  }
}

function renderProfile() {
  if (!state.stats) {
    refs.profileStats.innerHTML = '<div class="muted">No data</div>';
    return;
  }

  const rows = [
    ["Wins", state.stats.wins],
    ["Losses", state.stats.losses],
    ["Draws", state.stats.draws],
    ["Games total", state.stats.gamesTotal],
    ["Points", state.stats.pointsTotal],
  ];

  const mode = isProMode() ? "pro" : "training";
  const skin = SKINS[state.skin] ? state.skin : "classic";

  refs.profileStats.innerHTML = rows
    .map(([label, value]) => {
      return `<div class="stat-card"><div class="muted">${label}</div><div class="stat-value">${value}</div></div>`;
    })
    .join("")
    + `
      <div class="stat-card" style="grid-column: 1 / -1;">
        <div class="muted">Game mode</div>
        <div class="actions-row" style="margin-top:8px;">
          <button id="modeTrainingBtn" class="${mode === "training" ? "primary" : "ghost"}" type="button">Training</button>
          <button id="modeProBtn" class="${mode === "pro" ? "primary" : "ghost"}" type="button">PRO</button>
        </div>
      </div>
      <div class="stat-card" style="grid-column: 1 / -1;">
        <div class="muted">Skin</div>
        <div class="actions-row" style="margin-top:8px;">
          <button id="skinClassicBtn" class="${skin === "classic" ? "primary" : "ghost"}" type="button">Classic</button>
          <button id="skinFeb23Btn" class="${skin === "feb23" ? "primary" : "ghost"}" type="button">23 Feb</button>
          <button id="skinMar8Btn" class="${skin === "mar8" ? "primary" : "ghost"}" type="button">8 March</button>
        </div>
      </div>
      ${state.isAdmin ? `
      <div class="stat-card" style="grid-column: 1 / -1;">
        <div class="muted">Admin: game log</div>
        <div class="actions-row" style="margin-top:8px;">
          <button id="loadAdminLogBtn" class="ghost" type="button">Load log</button>
        </div>
        <div id="adminGamesLog" class="list" style="margin-top:8px;"></div>
      </div>
      ` : ""}
    `;

  const trainingBtn = document.getElementById("modeTrainingBtn");
  const proBtn = document.getElementById("modeProBtn");
  if (trainingBtn) trainingBtn.onclick = () => setHintMode("training");
  if (proBtn) proBtn.onclick = () => setHintMode("pro");

  const skinClassicBtn = document.getElementById("skinClassicBtn");
  const skinFeb23Btn = document.getElementById("skinFeb23Btn");
  const skinMar8Btn = document.getElementById("skinMar8Btn");
  if (skinClassicBtn) skinClassicBtn.onclick = () => setSkin("classic");
  if (skinFeb23Btn) skinFeb23Btn.onclick = () => setSkin("feb23");
  if (skinMar8Btn) skinMar8Btn.onclick = () => setSkin("mar8");

  if (state.isAdmin) {
    const loadAdminLogBtn = document.getElementById("loadAdminLogBtn");
    if (loadAdminLogBtn) loadAdminLogBtn.onclick = () => loadAdminGamesLog().catch((err) => showNotice(err.message));
    renderAdminGamesLog();
  }
}

async function setHintMode(hintMode) {
  if (hintMode !== "training" && hintMode !== "pro") return;
  if (!state.me) return;
  if (state.me.hintMode === hintMode) return;

  try {
    const data = await api("/api/me/hint-mode", {
      method: "POST",
      body: { hintMode },
    });
    if (data?.user) {
      state.me = data.user;
      renderProfile();
      renderGame();
      showNotice(hintMode === "pro" ? "PRO mode enabled" : "Training mode enabled");
    }
  } catch (err) {
    showNotice(err.message);
  }
}

function setSkin(skinId) {
  if (!SKINS[skinId]) return;
  if (state.skin === skinId) return;
  applySkin(skinId);
  renderProfile();
  const labels = {
    classic: "Classic skin enabled",
    feb23: "23 Feb skin enabled",
    mar8: "8 March skin enabled",
  };
  showNotice(labels[skinId] || "Skin enabled");
}

function renderAdminGamesLog() {
  const box = document.getElementById("adminGamesLog");
  if (!box) return;

  if (!state.adminGamesLog.length) {
    box.innerHTML = '<div class="muted">No games in log</div>';
    return;
  }

  box.innerHTML = state.adminGamesLog.map((g) => {
    const white = userNameHtml(g.white, "White");
    const black = userNameHtml(g.black, "Black");
    const started = g.startedAt ? new Date(g.startedAt).toLocaleString() : "-";
    const finished = g.finishedAt ? new Date(g.finishedAt).toLocaleString() : "-";
    return `<div class="list-item">
      <div>
        <div><strong>${white}</strong> vs <strong>${black}</strong></div>
        <div class="meta">status: ${escapeHtml(g.status)} | result: ${escapeHtml(g.result || "-")} | rated: ${g.rated ? "yes" : "no"}</div>
        <div class="meta">start: ${escapeHtml(started)} | end: ${escapeHtml(finished)} | duration: ${escapeHtml(g.durationText || "-")} | moves: ${escapeHtml(String(g.movesCount || 0))}</div>
      </div>
      <button class="ghost" type="button" onclick="navigator.clipboard?.writeText('${escapeAttr(g.id)}')">ID</button>
    </div>`;
  }).join("");
}

function renderLeaders() {
  if (state.leadersMode === "winners") {
    if (!state.winnersRows.length) {
      refs.leadersTable.innerHTML = '<div class="muted">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043d\u044b\u0445 \u043f\u0435\u0440\u0438\u043e\u0434\u043e\u0432</div>';
      return;
    }

    refs.leadersTable.innerHTML =       `<table class="table">
        <thead>
          <tr>
            <th>\u041f\u0435\u0440\u0438\u043e\u0434</th>
            <th>\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c</th>
          </tr>
        </thead>
        <tbody>
          ${state.winnersRows.map((row) => {
            const winner = row?.winner?.user || null;
            return `<tr><td>${formatWinnersPeriodLabel(row)}</td><td>${userNameHtml(winner, "\u0411\u0435\u0437 \u043f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044f")}</td></tr>`;
          }).join("")}
        </tbody>
      </table>`;
    return;
  }

  if (!state.leadersRows.length) {
    refs.leadersTable.innerHTML = '<div class="muted">No data yet</div>';
    return;
  }

  refs.leadersTable.innerHTML =     `<table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Points</th>
          <th>W</th>
          <th>L</th>
          <th>D</th>
        </tr>
      </thead>
      <tbody>
        ${state.leadersRows
          .map((row) => {
            const meClass = row.user.id === state.me?.id ? "me" : "";
            return `
              <tr class="${meClass}">
                <td>${row.rank}</td>
                <td>${userNameHtml(row.user, "Unknown")}</td>
                <td>${row.points}</td>
                <td>${row.wins}</td>
                <td>${row.losses}</td>
                <td>${row.draws}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>`;
}

function renderHistory() {
  if (!state.history.length) {
    refs.historyList.innerHTML = '<div class="muted">History is empty</div>';
    return;
  }

  refs.historyList.innerHTML = "";

  for (const game of state.history) {
    const item = document.createElement("div");
    item.className = "list-item";

    const label =
      game.perspectiveResult === "win"
        ? "Win"
        : game.perspectiveResult === "loss"
          ? "Loss"
          : game.perspectiveResult === "draw"
            ? "Draw"
            : "In progress";

    item.innerHTML =       `<div>
        <div>${userNameHtml(game.opponent, "Unknown")} | ${label}</div>
        <div class="meta">${escapeHtml(game.finishReason || "-")} | moves: ${game.movesCount}</div>
      </div>`;

    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "Open";
    btn.onclick = () => openGameFromHistory(game.id);

    item.appendChild(btn);
    refs.historyList.appendChild(item);
  }
}

async function respondChallenge(challengeId, accept) {
  try {
    await api("/api/lobby/challenge/respond", {
      method: "POST",
      body: { challengeId, accept },
    });
    state.incomingChallenges = state.incomingChallenges.filter((c) => c.id !== challengeId);
    renderIncomingChallenges();
    showNotice(accept ? "Вызов принят" : "Вызов отклонен");
  } catch (err) {
    showNotice(err.message);
  }
}

async function openGameFromHistory(gameId) {
  try {
    const data = await api(`/api/games/${encodeURIComponent(gameId)}`);
    state.activeGame = data.game;
    state.selectedSquare = null;
    renderGame();
    setView("game");
  } catch (err) {
    showNotice(err.message);
  }
}

function onSquareClick(square) {
  const game = state.activeGame;
  if (!game || game.status !== "active") return;
  if (!isMyTurn(game)) return;

  const legal = game.legalMoves || {};

  if (state.selectedSquare) {
    const from = state.selectedSquare;
    const options = legal[from] || [];
    const byTarget = options.filter((opt) => opt.to === square);

    if (byTarget.length > 0) {
      let promotion;
      if (byTarget.some((m) => m.promotion)) {
        promotion = "q";
      }

      state.socket.emit("game:move", {
        gameId: game.id,
        from,
        to: square,
        promotion,
      });

      state.selectedSquare = null;
      renderGame();
      return;
    }
  }

  if (legal[square] && legal[square].length > 0) {
    state.selectedSquare = square;
  } else {
    state.selectedSquare = null;
  }

  renderGame();
}

async function refreshMe() {
  const data = await api("/api/me");
  state.me = data.user;
  state.stats = data.stats;
  state.isAdmin = !!data.isAdmin;
  refs.whoami.textContent = state.me.displayName + " В· " + statusLabel(data.status);
  renderProfile();
}

async function loadWaiting() {
  const data = await api("/api/lobby/waiting");
  state.waiting = data.waiting || [];
  renderWaiting();
}

async function loadHistory() {
  const data = await api("/api/history");
  state.history = data.games || [];
  renderHistory();
}

async function loadTournament() {
  const data = await api("/api/tournament");
  state.tournament = data || null;
  renderTournament();
}

async function registerTournament() {
  const data = await api("/api/tournament/register", { method: "POST" });
  state.tournament = data?.tournament || state.tournament;
  renderTournament();
  showNotice("Вы зарегистрированы в турнире");
}

async function loadAdminGamesLog() {
  if (!state.isAdmin) return;
  const data = await api("/api/admin/games-log?limit=120");
  state.adminGamesLog = data.games || [];
  renderAdminGamesLog();
}

async function loadGlobalLeaders() {
  const data = await api("/api/leaderboard/global");
  state.leadersMode = "global";
  state.leadersRows = data.leaderboard || [];
  state.winnersRows = [];
  refs.leadersInfo.textContent = "Global leaderboard";
  renderLeaders();
  renderLobbyLeaders();
}

async function loadDailyLeaders() {
  const data = await api("/api/leaderboard/daily");
  const winnerData = data?.date
    ? await api(`/api/leaderboard/daily/winner?date=${encodeURIComponent(data.date)}`)
    : await api("/api/leaderboard/daily/winner");
  state.leadersMode = "daily";
  state.leadersRows = data.leaderboard || [];
  state.winnersRows = [];
  const winnerHtml = userNameHtml(winnerData?.winner?.user || null, "none");
  refs.leadersInfo.innerHTML = `Daily leaderboard: ${escapeHtml(data.date)} (${escapeHtml(data.timezone)}) | winner: ${winnerHtml}`;
  renderLeaders();
}

async function loadDailyWinners() {
  const data = await api("/api/leaderboard/daily/winners");
  state.leadersMode = "winners";
  state.winnersRows = data.winners || [];
  state.leadersRows = [];
  refs.leadersInfo.textContent = "\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u0438 \u043f\u0435\u0440\u0438\u043e\u0434\u043e\u0432: \u043f\u0435\u0440\u0432\u044b\u0439 \u0438\u0442\u043e\u0433 20.03.2026 23:59, \u0434\u0430\u043b\u044c\u0448\u0435 \u043a\u0430\u0436\u0434\u0443\u044e \u043f\u044f\u0442\u043d\u0438\u0446\u0443";
  renderLeaders();
}

function connectSocket() {
  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io({
    auth: { token: state.token },
    transports: ["polling", "websocket"],
  });

  state.socket.on("connect", () => {
    setConnectionBadge("online");
  });

  state.socket.on("disconnect", () => {
    setConnectionBadge("offline");
  });

  state.socket.on("lobby:waiting", (payload) => {
    state.waiting = Array.isArray(payload) ? payload : [];
    renderWaiting();
  });

  state.socket.on("tournament:update", (payload) => {
    state.tournament = payload || null;
    renderTournament();
  });

  state.socket.on("lobby:challenge:incoming", (challenge) => {
    state.incomingChallenges = [...state.incomingChallenges.filter((c) => c.id !== challenge.id), challenge];
    renderIncomingChallenges();
    showNotice(`Вызов от ${challenge.fromUser.displayName}`);
  });

  state.socket.on("lobby:challenge:declined", (payload) => {
    showNotice(`Вызов отклонен: ${payload.byUser.displayName}`);
  });

  state.socket.on("match:found", (match) => {
    showNotice(`Матч найден. Ваш цвет: ${match.color}`);
    setView("game");
    openGameFromHistory(match.gameId);
  });

  state.socket.on("game:state", (game) => {
    state.activeGame = game;
    state.selectedSquare = null;
    renderGame();
  });

  state.socket.on("game:finished", async (game) => {
    state.activeGame = game;
    state.selectedSquare = null;
    renderGame();
    showNotice(`Партия завершена: ${game.finishReason}`);

    try {
      await Promise.all([refreshMe(), loadGlobalLeaders(), loadDailyLeaders(), loadHistory()]);
    } catch (err) {
      showNotice(err.message);
    }
  });

  state.socket.on("game:draw:offer", () => {
    showNotice("Соперник предложил ничью");
  });

  state.socket.on("game:rematch:offer", () => {
    showNotice("Соперник предложил реванш");
  });

  state.socket.on("game:rematch:accepted", (payload) => {
    showNotice("Реванш начался");
    openGameFromHistory(payload.newGameId);
    setView("game");
  });

  state.socket.on("game:turn:timeout", (payload) => {
    if (!state.me) return;
    if (payload?.timedOutUserId === state.me.id) {
      showNotice("\u0412\u0440\u0435\u043c\u044f \u043d\u0430 \u0445\u043e\u0434 \u0438\u0441\u0442\u0435\u043a\u043b\u043e, \u0445\u043e\u0434 \u043f\u0435\u0440\u0435\u0434\u0430\u043d \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0443");
    } else {
      showNotice("\u0412\u0440\u0435\u043c\u044f \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0430 \u0438\u0441\u0442\u0435\u043a\u043b\u043e, \u0445\u043e\u0434 \u043f\u0435\u0440\u0435\u0448\u0435\u043b \u0432\u0430\u043c");
    }
  });

  state.socket.on("error:message", (payload) => {
    if (payload?.message) showNotice(payload.message);
  });
}

function startLobbyPolling() {
  if (state.lobbyPollTimer) {
    clearInterval(state.lobbyPollTimer);
  }
  state.lobbyPollTick = 0;

  state.lobbyPollTimer = setInterval(() => {
    if (!state.token) return;
    state.lobbyPollTick += 1;
    loadWaiting().catch(() => {});

    if (state.lobbyPollTick % 12 !== 0) return;

    const shouldRefreshGlobal = state.currentView === "lobby" || state.leadersMode === "global";
    if (shouldRefreshGlobal) {
      loadGlobalLeaders().catch(() => {});
    }
    if (state.currentView === "leaders") {
      if (state.leadersMode === "daily") {
        loadDailyLeaders().catch(() => {});
      } else if (state.leadersMode === "winners") {
        loadDailyWinners().catch(() => {});
      }
    }
    loadTournament().catch(() => {});
  }, 5000);
}

async function syncActiveGame() {
  if (!state.activeGame?.id || !state.token) return;
  try {
    const data = await api(`/api/games/${encodeURIComponent(state.activeGame.id)}`);
    if (data?.game) {
      state.activeGame = data.game;
      renderGame();
    }
  } catch (_) {}
}

function startGamePolling() {
  if (state.gamePollTimer) {
    clearInterval(state.gamePollTimer);
  }

  state.gamePollTimer = setInterval(() => {
    if (!state.token) return;
    if (!state.activeGame || state.activeGame.status !== "active") return;
    syncActiveGame();
  }, 4000);
}

async function joinQueue(gameMode = "untimed") {
  try {
    await api("/api/lobby/queue/join", { method: "POST", body: { gameMode } });
    showNotice(
      gameMode === "timed"
        ? "\u041e\u0447\u0435\u0440\u0435\u0434\u044c: \u0440\u0435\u0436\u0438\u043c \u043d\u0430 \u0432\u0440\u0435\u043c\u044f (60\u0441/\u0445\u043e\u0434)"
        : "\u041e\u0447\u0435\u0440\u0435\u0434\u044c: \u0440\u0435\u0436\u0438\u043c \u0431\u0435\u0437 \u0432\u0440\u0435\u043c\u0435\u043d\u0438",
    );
  } catch (err) {
    showNotice(err.message);
  }
}

async function startBotTrainingGame() {
  try {
    const data = await api("/api/training/bot/start", { method: "POST" });
    if (data?.gameId) {
      await openGameFromHistory(data.gameId);
    }
    showNotice("Training game vs bot started");
  } catch (err) {
    showNotice(err.message);
  }
}

async function leaveQueue() {
  try {
    await api("/api/lobby/queue/leave", { method: "POST" });
    showNotice("Вы вышли из очереди");
  } catch (err) {
    showNotice(err.message);
  }
}

function wireEvents() {
  refs.devLoginBtn.addEventListener("click", async () => {
    const displayName = refs.devName.value.trim();
    if (!displayName) {
      showNotice("Введите имя");
      return;
    }

    try {
      const data = await api("/api/auth/dev", {
        method: "POST",
        body: { displayName },
      });
      await onAuthenticated(data);
    } catch (err) {
      showNotice(err.message);
    }
  });

  if (refs.joinQueueTimedBtn) {
    refs.joinQueueTimedBtn.addEventListener("click", () => joinQueue("timed"));
  }
  if (refs.joinQueueUntimedBtn) {
    refs.joinQueueUntimedBtn.addEventListener("click", () => joinQueue("untimed"));
  }
  if (refs.inviteFriendBtn) {
    refs.inviteFriendBtn.addEventListener("click", inviteFriend);
  }
  refs.startBotGameBtn.addEventListener("click", startBotTrainingGame);
  refs.leaveQueueBtn.addEventListener("click", leaveQueue);

  refs.offerDrawBtn.addEventListener("click", () => {
    if (!state.activeGame || state.activeGame.status !== "active") return;
    state.socket.emit("game:draw:offer", { gameId: state.activeGame.id });
  });

  if (refs.drawAcceptBtn) {
    refs.drawAcceptBtn.addEventListener("click", () => {
      if (!state.activeGame || state.activeGame.status !== "active") return;
      state.socket.emit("game:draw:respond", { gameId: state.activeGame.id, accept: true });
    });
  }
  if (refs.drawDeclineBtn) {
    refs.drawDeclineBtn.addEventListener("click", () => {
      if (!state.activeGame || state.activeGame.status !== "active") return;
      state.socket.emit("game:draw:respond", { gameId: state.activeGame.id, accept: false });
    });
  }

  refs.resignBtn.addEventListener("click", () => {
    if (!state.activeGame || state.activeGame.status !== "active") return;
    if (!window.confirm("Подтвердить сдачу партии?")) return;
    state.socket.emit("game:resign", { gameId: state.activeGame.id });
  });

  refs.rematchBtn.addEventListener("click", () => {
    if (!state.activeGame || state.activeGame.status !== "finished") return;
    state.socket.emit("game:rematch:offer", { gameId: state.activeGame.id });
    showNotice("Предложение реванша отправлено");
  });

  if (refs.themeToggle) {
    refs.themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") || "light";
      applyTheme(cur === "dark" ? "light" : "dark");
    });
  }

  refs.loadGlobalBtn.addEventListener("click", () => loadGlobalLeaders().catch((err) => showNotice(err.message)));
  refs.loadDailyBtn.addEventListener("click", () => loadDailyLeaders().catch((err) => showNotice(err.message)));
  if (refs.loadWinnersBtn) {
    refs.loadWinnersBtn.addEventListener("click", () => loadDailyWinners().catch((err) => showNotice(err.message)));
  }
  if (refs.tournamentRegisterBtn) {
    refs.tournamentRegisterBtn.addEventListener("click", () => registerTournament().catch((err) => showNotice(err.message)));
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
}

async function onAuthenticated(authResponse) {
  state.token = authResponse.token;
  localStorage.setItem("chess_token", state.token);

  await refreshMe();
  await Promise.all([loadWaiting(), loadGlobalLeaders(), loadDailyLeaders(), loadHistory(), loadTournament()]);

  refs.authScreen.classList.add("hidden");
  refs.appScreen.classList.remove("hidden");
  connectSocket();
  startLobbyPolling();
  startGamePolling();
  renderIncomingChallenges();
  renderGame();
  const openedByInvite = await consumePendingInvite();
  if (!openedByInvite) {
    setView("lobby");
  }
}

async function tryLoginByStoredToken() {
  if (!state.token) return false;

  try {
    await onAuthenticated({ token: state.token });
    return true;
  } catch {
    state.token = "";
    if (state.lobbyPollTimer) {
      clearInterval(state.lobbyPollTimer);
      state.lobbyPollTimer = null;
    }
    if (state.gamePollTimer) {
      clearInterval(state.gamePollTimer);
      state.gamePollTimer = null;
    }
    localStorage.removeItem("chess_token");
    return false;
  }
}

async function tryTelegramLogin() {
  const tg = window.Telegram?.WebApp;
  const initData = resolveTelegramInitData(tg);
  if (!initData) {
    return false;
  }

  try {
    tg.ready();
    const data = await api("/api/auth/telegram", {
      method: "POST",
      body: { initData },
    });
    await onAuthenticated(data);
    return true;
  } catch (err) {
    setAuthStatus(`Telegram auth error: ${err.message}`);
    return false;
  }
}

function resolveTelegramInitData(tg) {
  if (tg?.initData) return tg.initData;

  const sources = [window.location.hash, window.location.search];
  for (const raw of sources) {
    if (!raw) continue;
    const qs = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;
    const params = new URLSearchParams(qs);
    const encoded = params.get("tgWebAppData");
    if (!encoded) continue;
    try {
      const decoded = decodeURIComponent(encoded);
      if (decoded) return decoded;
    } catch (_) {
      if (encoded) return encoded;
    }
  }

  return "";
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status) {
  const labels = {
    online: "в сети",
    offline: "не в сети",
    in_queue: "в очереди",
    in_game: "в игре",
  };
  return labels[String(status)] || status;
}

async function bootstrap() {
  initSkin();
  initTelegramWebApp();
  initTheme();
  state.pendingInviteId = resolveInviteIdFromUrlAndTelegram();

  wireEvents();
  renderIncomingChallenges();
  renderWaiting();
  renderGame();

  try {
    state.config = await api("/api/config");
  } catch (err) {
    setAuthStatus(`Ошибка конфигурации: ${err.message}`);
    return;
  }

  setAuthStatus("Проверка авторизации...");
  const byToken = await tryLoginByStoredToken();
  if (byToken) return;

  setAuthStatus("Пробуем вход через Telegram...");
  const byTelegram = await tryTelegramLogin();
  if (byTelegram) return;

  if (state.config.allowDevAuth) {
    setAuthStatus("Dev auth включен: введите имя");
    refs.devAuthBlock.classList.remove("hidden");
    refs.devName.focus();
  } else {
    setAuthStatus("Откройте приложение внутри Telegram для входа");
  }
}

bootstrap();
