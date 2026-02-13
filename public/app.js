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
  currentView: "lobby",
  noticeTimer: null,
};

/** Telegram Mini App: доступен только при открытии из бота */
function getTelegramWebApp() {
  return typeof window !== "undefined" && window.Telegram?.WebApp;
}

function initTelegramWebApp() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  tg.ready();
  tg.expand();

  const theme = tg.themeParams || {};
  if (theme.bg_color) {
    document.documentElement.style.setProperty("--tg-bg", theme.bg_color);
    document.body.style.background = theme.bg_color;
  }
  if (theme.text_color) {
    document.documentElement.style.setProperty("--tg-text", theme.text_color);
    document.body.style.color = theme.text_color;
  }

  if (tg.BackButton) {
    tg.BackButton.onClick(() => {
      tg.BackButton.hide();
      setView("lobby");
    });
  }
}

const PIECES = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
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
  connectionBadge: document.getElementById("connectionBadge"),
  waitingList: document.getElementById("waitingList"),
  incomingChallenges: document.getElementById("incomingChallenges"),
  lobbyLeaders: document.getElementById("lobbyLeaders"),
  board: document.getElementById("board"),
  gameMeta: document.getElementById("gameMeta"),
  drawOfferBlock: document.getElementById("drawOfferBlock"),
  drawAcceptBtn: document.getElementById("drawAcceptBtn"),
  drawDeclineBtn: document.getElementById("drawDeclineBtn"),
  moveList: document.getElementById("moveList"),
  profileStats: document.getElementById("profileStats"),
  leadersInfo: document.getElementById("leadersInfo"),
  leadersTable: document.getElementById("leadersTable"),
  historyList: document.getElementById("historyList"),
  joinQueueBtn: document.getElementById("joinQueueBtn"),
  leaveQueueBtn: document.getElementById("leaveQueueBtn"),
  offerDrawBtn: document.getElementById("offerDrawBtn"),
  resignBtn: document.getElementById("resignBtn"),
  rematchBtn: document.getElementById("rematchBtn"),
  loadGlobalBtn: document.getElementById("loadGlobalBtn"),
  loadDailyBtn: document.getElementById("loadDailyBtn"),
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
      <div>${escapeHtml(user.displayName)} ${user.id === state.me?.id ? "(вы)" : ""}</div>
      <div class="meta">${escapeHtml(statusLabel(user.status))}</div>
    `;

    item.appendChild(left);

    if (state.me && user.id !== state.me.id) {
      const btn = document.createElement("button");
      btn.className = "ghost";
      btn.textContent = "Вызвать";
      btn.onclick = async () => {
        try {
          await api("/api/lobby/challenge", {
            method: "POST",
            body: { toUserId: user.id },
          });
          showNotice(`Вызов отправлен: ${user.displayName}`);
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
      <div>${escapeHtml(challenge.fromUser.displayName)}</div>
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
    refs.lobbyLeaders.innerHTML = '<div class="muted">Загрузка рейтинга…</div>';
    return;
  }
  refs.lobbyLeaders.innerHTML = `
    <table class="table table-compact">
      <thead>
        <tr><th>#</th><th>Игрок</th><th>Очки</th></tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const me = r.user?.id === state.me?.id;
          return `<tr class="${me ? "me" : ""}"><td>${r.rank}</td><td>${escapeHtml(r.user?.displayName || "")}</td><td>${r.points}</td></tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderGame() {
  const game = state.activeGame;

  if (!game) {
    refs.gameMeta.textContent = "Нет активной партии";
    refs.board.innerHTML = "";
    refs.moveList.innerHTML = '<div class="muted">Ходы появятся после старта партии</div>';
    return;
  }

  const white = game.players?.white?.displayName || "Белые";
  const black = game.players?.black?.displayName || "Черные";
  const opponent = game.viewerColor === "white" ? black : white;
  const viewerSide = game.viewerColor === "white" ? "белые" : "черные";

  const turnText = game.status === "active" ? `Ход: ${game.turnColor === "white" ? "белые" : "черные"}` : "Партия завершена";
  const statusText = game.status === "active" ? (isMyTurn(game) ? "Ваш ход" : "Ход соперника") : game.finishReason || "finished";

  refs.gameMeta.textContent = `Вы: ${viewerSide} | Соперник: ${opponent} | ${turnText} | ${statusText}`;

  const pieceMap = fenToSquareMap(game.fen);
  const legalMoves = game.legalMoves || {};
  const selected = state.selectedSquare;
  const targetSquares = selected && legalMoves[selected] ? legalMoves[selected].map((m) => m.to) : [];

  refs.board.innerHTML = "";

  for (const square of squareOrder(game.viewerColor)) {
    const btn = document.createElement("button");
    btn.className = `square ${isSquareLight(square) ? "light" : "dark"}`;
    btn.dataset.square = square;

    if (selected === square) {
      btn.classList.add("selected");
    }

    if (targetSquares.includes(square)) {
      btn.classList.add("target");
    }

    const piece = pieceMap[square];
    if (piece) {
      btn.textContent = PIECES[piece] || "";
    } else if (targetSquares.includes(square)) {
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
    refs.profileStats.innerHTML = '<div class="muted">Нет данных</div>';
    return;
  }

  const rows = [
    ["Победы", state.stats.wins],
    ["Поражения", state.stats.losses],
    ["Ничьи", state.stats.draws],
    ["Всего партий", state.stats.gamesTotal],
    ["Очки", state.stats.pointsTotal],
  ];

  refs.profileStats.innerHTML = rows
    .map(([label, value]) => {
      return `<div class="stat-card"><div class="muted">${label}</div><div class="stat-value">${value}</div></div>`;
    })
    .join("");
}

function renderLeaders() {
  if (!state.leadersRows.length) {
    refs.leadersTable.innerHTML = '<div class="muted">Пока нет данных</div>';
    return;
  }

  refs.leadersTable.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Игрок</th>
          <th>Очки</th>
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
                <td>${escapeHtml(row.user.displayName)}</td>
                <td>${row.points}</td>
                <td>${row.wins}</td>
                <td>${row.losses}</td>
                <td>${row.draws}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderHistory() {
  if (!state.history.length) {
    refs.historyList.innerHTML = '<div class="muted">История пока пустая</div>';
    return;
  }

  refs.historyList.innerHTML = "";

  for (const game of state.history) {
    const item = document.createElement("div");
    item.className = "list-item";

    const label =
      game.perspectiveResult === "win"
        ? "Победа"
        : game.perspectiveResult === "loss"
          ? "Поражение"
          : game.perspectiveResult === "draw"
            ? "Ничья"
            : "В процессе";

    item.innerHTML = `
      <div>
        <div>${escapeHtml(game.opponent?.displayName || "Неизвестный")} | ${label}</div>
        <div class="meta">${escapeHtml(game.finishReason || "-")} | ходов: ${game.movesCount}</div>
      </div>
    `;

    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "Открыть";
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
  refs.whoami.textContent = state.me.displayName + " · " + statusLabel(data.status);
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

async function loadGlobalLeaders() {
  const data = await api("/api/leaderboard/global");
  state.leadersMode = "global";
  state.leadersRows = data.leaderboard || [];
  refs.leadersInfo.textContent = "Общий рейтинг";
  renderLeaders();
  renderLobbyLeaders();
}

async function loadDailyLeaders() {
  const [data, winnerData] = await Promise.all([
    api("/api/leaderboard/daily"),
    api("/api/leaderboard/daily/winner"),
  ]);
  state.leadersMode = "daily";
  state.leadersRows = data.leaderboard || [];
  const winnerName = winnerData?.winner?.user?.displayName || "нет";
  refs.leadersInfo.textContent = `Суточный рейтинг: ${data.date} (${data.timezone}) | победитель: ${winnerName}`;
  renderLeaders();
}

function connectSocket() {
  if (state.socket) {
    state.socket.disconnect();
  }

  state.socket = io({ auth: { token: state.token } });

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

  state.socket.on("error:message", (payload) => {
    if (payload?.message) showNotice(payload.message);
  });
}

async function joinQueue() {
  try {
    await api("/api/lobby/queue/join", { method: "POST" });
    showNotice("Вы в очереди");
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

  refs.joinQueueBtn.addEventListener("click", joinQueue);
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

  refs.loadGlobalBtn.addEventListener("click", () => loadGlobalLeaders().catch((err) => showNotice(err.message)));
  refs.loadDailyBtn.addEventListener("click", () => loadDailyLeaders().catch((err) => showNotice(err.message)));

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
}

async function onAuthenticated(authResponse) {
  state.token = authResponse.token;
  localStorage.setItem("chess_token", state.token);

  await refreshMe();
  await Promise.all([loadWaiting(), loadGlobalLeaders(), loadDailyLeaders(), loadHistory()]);

  refs.authScreen.classList.add("hidden");
  refs.appScreen.classList.remove("hidden");
  connectSocket();
  renderIncomingChallenges();
  renderGame();
  setView("lobby");
}

async function tryLoginByStoredToken() {
  if (!state.token) return false;

  try {
    await onAuthenticated({ token: state.token });
    return true;
  } catch {
    state.token = "";
    localStorage.removeItem("chess_token");
    return false;
  }
}

async function tryTelegramLogin() {
  const tg = window.Telegram?.WebApp;
  if (!tg || !tg.initData) {
    return false;
  }

  try {
    tg.ready();
    const data = await api("/api/auth/telegram", {
      method: "POST",
      body: { initData: tg.initData },
    });
    await onAuthenticated(data);
    return true;
  } catch (err) {
    setAuthStatus(`Telegram auth error: ${err.message}`);
    return false;
  }
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
  initTelegramWebApp();

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
