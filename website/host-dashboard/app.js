(() => {
  "use strict";

  const CONFIG_URL = "../../game_data/game_config.json";
  const BOARD_IMAGE_URL = "../../outputs/final_assets/board/give_and_take_board_final.png";
  const API_BASE = "/api";
  const BACKEND_POLL_MS = 2500;
  const STORAGE = {
    auth: "give-and-take:auth:v1",
    backend: "give-and-take:backend:v1",
    client: "give-and-take:client:v1",
    session: "give-and-take:session:v3"
  };

  const deckMeta = {
    investments: { label: "Investment", configKey: "investments" },
    events: { label: "Market/Life", configKey: "events" },
    ethics: { label: "Ethics", configKey: "ethics" },
    actions: { label: "Action", configKey: "actions" },
    reflection: { label: "Reflection", configKey: "reflection" }
  };

  const navItems = [
    ["setup", "Setup"],
    ["play", "Play"],
    ["market", "Market"],
    ["players", "Players"],
    ["scoring", "Scoring"],
    ["export", "Export"],
    ["rules", "Rules"]
  ];

  const appRoot = document.getElementById("app");
  const model = {
    game: null,
    indexes: null,
    auth: null,
    authTab: "login",
    session: null,
    backend: {
      online: false,
      provider: "local",
      label: "Local browser",
      client: null,
      sessionId: null,
      revision: 0,
      syncTimer: null,
      pollTimer: null,
      saving: false,
      needsSave: false,
      clientRole: null,
      lastSyncedJson: "",
      unavailableReason: ""
    },
    message: "",
    exportText: "",
    configError: null
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value) => Math.round(value);
  const nowIso = () => new Date().toISOString();

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setMessage("This browser blocked local storage. The app can run, but refresh persistence may fail.");
    }
  }

  function getClientId() {
    const existing = readStore(STORAGE.client, null);
    if (existing) {
      return existing;
    }
    const id = `client-${window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    writeStore(STORAGE.client, id);
    return id;
  }

  function normaliseSessionCode(value) {
    const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
    const digits = raw.replace(/[^0-9]/g, "");
    if (/^GT-[0-9]{4}$/.test(raw)) {
      return raw;
    }
    if (/^GT[0-9]{4}$/.test(raw)) {
      return `GT-${raw.slice(2)}`;
    }
    if (digits.length === 4) {
      return `GT-${digits}`;
    }
    return raw;
  }

  function backendNotice() {
    return "Host a table as a guest, then share the table code with players.";
  }

  function tableRoleLabel() {
    return model.backend.clientRole === "player" ? "Player view" : "Host view";
  }

  function canEditSession() {
    return model.backend.clientRole !== "player";
  }

  function hostDisabledAttr(extraDisabled = false) {
    return extraDisabled || !canEditSession() ? "disabled" : "";
  }

  function hostOnlyNotice() {
    return canEditSession() ? "" : `<p class="notice warning">Only the host can change the shared table. This view updates as the host plays.</p>`;
  }

  function requireHostAction() {
    if (canEditSession()) {
      return true;
    }
    setMessage("Only the host can change the shared table.");
    render();
    return false;
  }

  function persistBackendState() {
    if (!model.session) {
      return;
    }
    writeStore(STORAGE.backend, {
      code: model.session.code,
      provider: model.backend.provider,
      sessionId: model.backend.sessionId,
      revision: model.backend.revision,
      clientRole: model.backend.clientRole
    });
  }

  function restoreBackendState() {
    const stored = readStore(STORAGE.backend, null);
    if (!stored || !model.session || stored.code !== model.session.code || stored.provider !== model.backend.provider) {
      return;
    }
    model.backend.sessionId = stored.sessionId ?? null;
    model.backend.revision = Number(stored.revision ?? 0);
    model.backend.clientRole = stored.clientRole ?? null;
  }

  function publicAuth(auth = model.auth) {
    if (!auth) {
      return null;
    }
    return {
      id: auth.id,
      mode: auth.mode,
      name: auth.name,
      email: auth.email ?? null
    };
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data.error ?? `Request failed with HTTP ${response.status}`);
    }
    return data;
  }

  async function probeBackend() {
    const staticConfig = window.GIVE_AND_TAKE_SUPABASE;
    if (staticConfig?.provider === "supabase" && staticConfig.supabaseUrl && (staticConfig.supabasePublishableKey || staticConfig.supabaseAnonKey)) {
      const initialized = await initSupabaseClient(staticConfig);
      if (initialized) {
        return;
      }
    }

    try {
      const config = await apiRequest("/supabase-config");
      if (config.provider === "supabase" && config.supabaseUrl && (config.supabasePublishableKey || config.supabaseAnonKey)) {
        const initialized = await initSupabaseClient(config);
        if (initialized) {
          return;
        }
      }

      const health = await apiRequest("/health");
      model.backend.online = Boolean(health.ok);
      model.backend.provider = health.provider ?? "node-json";
      model.backend.label = health.label ?? "Session server";
      model.backend.client = null;
      model.backend.unavailableReason = "";
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.client = null;
      model.backend.unavailableReason = error.message ?? "Session server unavailable.";
    }
  }

  async function initSupabaseClient(config) {
    try {
      const module = await import("https://esm.sh/@supabase/supabase-js@2.110.0");
      const client = module.createClient(config.supabaseUrl, config.supabasePublishableKey || config.supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
      model.backend.online = true;
      model.backend.provider = "supabase";
      model.backend.label = "Supabase";
      model.backend.client = client;
      model.backend.unavailableReason = "";
      return true;
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.client = null;
      model.backend.unavailableReason = error.message ?? "Online table service could not load.";
      return false;
    }
  }

  function startBackendPoller() {
    if (model.backend.pollTimer) {
      return;
    }
    model.backend.pollTimer = window.setInterval(pullSessionFromBackend, BACKEND_POLL_MS);
  }

  function queueBackendSync() {
    if (!model.backend.online || !model.auth || !model.session) {
      return;
    }
    if (model.backend.saving) {
      model.backend.needsSave = true;
      return;
    }
    window.clearTimeout(model.backend.syncTimer);
    model.backend.syncTimer = window.setTimeout(syncSessionToBackend, 450);
  }

  async function syncSessionToBackend() {
    if (!model.backend.online || !model.auth || !model.session || model.backend.saving) {
      if (model.backend.saving) {
        model.backend.needsSave = true;
      }
      return;
    }
    if (model.backend.provider === "supabase") {
      await syncSessionToSupabase();
      return;
    }
    const localJson = JSON.stringify(model.session);
    if (localJson === model.backend.lastSyncedJson) {
      return;
    }
    model.backend.saving = true;
    try {
      const result = await apiRequest(`/sessions/${encodeURIComponent(model.session.code)}`, {
        method: "PUT",
        body: {
          auth: publicAuth(),
          session: model.session,
          revision: model.backend.revision
        }
      });
      model.backend.revision = Number(result.revision ?? model.backend.revision);
      model.backend.lastSyncedJson = JSON.stringify(result.session ?? model.session);
      model.backend.unavailableReason = "";
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.unavailableReason = error.message ?? "Session server unavailable.";
      setMessage("Session server went offline. Continuing in this browser.");
    } finally {
      model.backend.saving = false;
      if (model.backend.needsSave) {
        model.backend.needsSave = false;
        queueBackendSync();
      }
    }
  }

  async function pullSessionFromBackend() {
    if (!model.backend.online || !model.auth || !model.session || model.backend.saving) {
      return;
    }
    if (model.backend.clientRole === "host") {
      return;
    }
    if (model.backend.provider === "supabase") {
      await pullSessionFromSupabase();
      return;
    }
    try {
      const result = await apiRequest(`/sessions/${encodeURIComponent(model.session.code)}`);
      const remoteRevision = Number(result.revision ?? 0);
      if (remoteRevision > model.backend.revision && result.session) {
        model.session = ensureSessionShape(result.session);
        model.backend.revision = remoteRevision;
        model.backend.lastSyncedJson = JSON.stringify(model.session);
        writeStore(STORAGE.session, model.session);
        render();
      }
    } catch {
      // Keep the local session usable if another device has not created the code yet.
    }
  }

  async function loadBackendSession(code) {
    if (model.backend.provider === "supabase") {
      return loadSupabaseSession(code);
    }
    const result = await apiRequest(`/sessions/${encodeURIComponent(code)}`);
    model.backend.revision = Number(result.revision ?? 0);
    model.backend.lastSyncedJson = JSON.stringify(result.session ?? {});
    return ensureSessionShape(result.session);
  }

  function applySupabaseRecord(record) {
    model.backend.sessionId = record.id;
    model.backend.revision = Number(record.revision ?? 0);
    model.backend.lastSyncedJson = JSON.stringify(record.session ?? {});
    persistBackendState();
    return ensureSessionShape(record.session);
  }

  async function createSupabaseSession() {
    const { data, error } = await model.backend.client.rpc("create_game_session_public", {
      p_code: model.session.code,
      p_client_id: getClientId(),
      p_display_name: model.auth?.name ?? "Host",
      p_session: model.session
    });
    if (error) {
      throw error;
    }
    model.backend.clientRole = "host";
    return Array.isArray(data) ? data[0] : data;
  }

  async function syncSessionToSupabase() {
    if (model.backend.sessionId && model.backend.clientRole !== "host") {
      return;
    }
    const localJson = JSON.stringify(model.session);
    if (localJson === model.backend.lastSyncedJson) {
      return;
    }
    model.backend.saving = true;
    try {
      let record;
      if (!model.backend.sessionId) {
        record = await createSupabaseSession();
      } else {
        const { data, error } = await model.backend.client.rpc("update_game_session_public", {
          p_session_id: model.backend.sessionId,
          p_client_id: getClientId(),
          p_session: model.session,
          p_revision: model.backend.revision
        });
        if (error) {
          throw error;
        }
        record = Array.isArray(data) ? data[0] : data;
      }
      model.backend.sessionId = record.id;
      model.backend.revision = Number(record.revision ?? model.backend.revision);
      model.backend.lastSyncedJson = localJson;
      persistBackendState();
      writeStore(STORAGE.session, model.session);
    } catch (error) {
      setMessage("Online table save failed. The current browser state is still available.");
    } finally {
      model.backend.saving = false;
      if (model.backend.needsSave) {
        model.backend.needsSave = false;
        queueBackendSync();
      }
    }
  }

  async function pullSessionFromSupabase() {
    if (!model.backend.sessionId) {
      return;
    }
    try {
      const { data, error } = await model.backend.client.rpc("get_game_session_public", {
        p_session_id: model.backend.sessionId,
        p_client_id: getClientId()
      });
      if (error) {
        throw error;
      }
      const record = Array.isArray(data) ? data[0] : data;
      const remoteRevision = Number(record.revision ?? 0);
      if (remoteRevision > model.backend.revision) {
        model.session = applySupabaseRecord(record);
        writeStore(STORAGE.session, model.session);
        render();
      }
    } catch {
      // Keep local interaction responsive if the network drops mid-session.
    }
  }

  async function loadSupabaseSession(code) {
    const { data, error } = await model.backend.client.rpc("join_game_session_public", {
      p_code: code,
      p_client_id: getClientId(),
      p_display_name: model.auth?.name ?? "Player"
    });
    if (error) {
      throw error;
    }
    model.backend.clientRole = "player";
    return applySupabaseRecord(Array.isArray(data) ? data[0] : data);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cssVar(value) {
    return String(value || "#d4af37").replace(/[^#a-zA-Z0-9(),.% -]/g, "");
  }

  function money(value) {
    return `INR ${round(value).toLocaleString("en-IN")}`;
  }

  function makeSessionCode() {
    return `GT-${Math.floor(1000 + Math.random() * 9000)}`;
  }

  function shuffled(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function loadGame() {
    try {
      const response = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return normaliseGame(await response.json());
    } catch (error) {
      if (window.GIVE_AND_TAKE_DATA?.boardSpaces && window.GIVE_AND_TAKE_DATA?.cards) {
        return normaliseGame(window.GIVE_AND_TAKE_DATA);
      }
      if (window.GIVE_AND_TAKE_DATA?.assets && window.GIVE_AND_TAKE_DATA?.events) {
        const legacy = window.GIVE_AND_TAKE_DATA;
        return normaliseGame({
          meta: legacy.meta,
          prototypeContract: {
            turnLimit: legacy.meta.turnLimit,
            movement: legacy.meta.movement,
            dashboardRole: "Legacy event tracker fallback."
          },
          componentCounts: { boardSpaces: 44, totalCards: 81 },
          assets: legacy.assets,
          boardSpaces: [],
          cards: {
            starterProfiles: legacy.starterProfiles,
            investments: [],
            events: legacy.events,
            ethics: [],
            actions: [],
            reflection: [],
            quickReference: legacy.quickReference,
            qr: []
          },
          scoreWeights: legacy.scoreWeights
        });
      }
      throw error;
    }
  }

  function normaliseGame(config) {
    const game = {
      title: config.meta?.title ?? "Give And Take",
      version: config.meta?.version ?? "local",
      prototypeContract: config.prototypeContract ?? {},
      componentCounts: config.componentCounts ?? {},
      rules: config.rules ?? {},
      assets: config.assets ?? [],
      boardSpaces: config.boardSpaces ?? [],
      cards: config.cards ?? {},
      scoreWeights: config.scoreWeights ?? {}
    };
    game.turnLimit = Number(game.prototypeContract.turnLimit ?? config.meta?.turnLimit ?? 12);

    const requiredDecks = ["starterProfiles", "investments", "events", "ethics", "actions", "reflection", "quickReference"];
    const missingDecks = requiredDecks.filter((key) => !Array.isArray(game.cards[key]));
    if (!game.assets.length || missingDecks.length || game.boardSpaces.length !== 44) {
      throw new Error(
        "The full game_config.json must be served with the QR app. Start the local server from the give-and-take folder."
      );
    }

    return game;
  }

  function buildIndexes(game) {
    return {
      assets: new Map(game.assets.map((asset) => [asset.id, asset])),
      spaces: new Map(game.boardSpaces.map((space) => [space.id, space])),
      cards: Object.fromEntries(
        Object.entries(deckMeta).map(([deckKey, meta]) => [
          deckKey,
          new Map((game.cards[meta.configKey] ?? []).map((card) => [card.id, card]))
        ])
      )
    };
  }

  function createSession() {
    const starterProfiles = model.game.cards.starterProfiles;
    return {
      schema: STORAGE.session,
      code: makeSessionCode(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      view: "setup",
      started: false,
      gameOver: false,
      phase: "Setup",
      die: null,
      currentPlayerIndex: 0,
      draft: {
        playerCount: 2,
        players: starterProfiles.slice(0, 5).map((profile, index) => ({
          name: `Player ${index + 1}`,
          profileId: profile.id
        }))
      },
      prices: Object.fromEntries(model.game.assets.map((asset) => [asset.id, asset.startIndex])),
      decks: {
        investments: shuffled(model.game.cards.investments.map((card) => card.id)),
        events: shuffled(model.game.cards.events.map((card) => card.id)),
        ethics: shuffled(model.game.cards.ethics.map((card) => card.id)),
        actions: shuffled(model.game.cards.actions.map((card) => card.id)),
        reflection: shuffled(model.game.cards.reflection.map((card) => card.id))
      },
      discards: {
        investments: [],
        events: [],
        ethics: [],
        actions: [],
        reflection: []
      },
      players: [],
      pendingResolution: null,
      activeEvent: null,
      peekedEventId: null,
      marketHistory: [],
      activity: []
    };
  }

  function ensureSessionShape(session) {
    const fresh = createSession();
    const merged = { ...fresh, ...session };
    merged.draft = { ...fresh.draft, ...(session?.draft ?? {}) };
    merged.draft.players = Array.isArray(merged.draft.players) ? merged.draft.players : fresh.draft.players;
    merged.prices = { ...fresh.prices, ...(session?.prices ?? {}) };
    merged.decks = { ...fresh.decks, ...(session?.decks ?? {}) };
    merged.discards = { ...fresh.discards, ...(session?.discards ?? {}) };
    merged.players = Array.isArray(session?.players) ? session.players.map(ensurePlayerShape) : [];
    merged.marketHistory = Array.isArray(session?.marketHistory) ? session.marketHistory : [];
    merged.activity = Array.isArray(session?.activity) ? session.activity : [];
    return merged;
  }

  function ensurePlayerShape(player) {
    return {
      id: player.id,
      name: player.name,
      profileId: player.profileId,
      profileTitle: player.profileTitle,
      cash: Number(player.cash ?? 0),
      position: Number(player.position ?? 0),
      turnsTaken: Number(player.turnsTaken ?? 0),
      holdings: { ...(player.holdings ?? {}) },
      riskEvidence: Number(player.riskEvidence ?? 0),
      ethicsPosition: Number(player.ethicsPosition ?? 0),
      reflectionEvidence: Number(player.reflectionEvidence ?? 0),
      decisions: Array.isArray(player.decisions) ? player.decisions : [],
      finished: Boolean(player.finished),
      profileBonuses: { ...(player.profileBonuses ?? {}) },
      pending: { ...(player.pending ?? {}) }
    };
  }

  function saveSession() {
    if (!model.session) {
      return;
    }
    model.session.updatedAt = nowIso();
    writeStore(STORAGE.session, model.session);
    if (canEditSession()) {
      queueBackendSync();
    }
  }

  function setMessage(message) {
    model.message = message;
    window.clearTimeout(setMessage.timer);
    if (message) {
      setMessage.timer = window.setTimeout(() => {
        model.message = "";
        render();
      }, 4200);
    }
  }

  function logActivity(text, detail = {}) {
    model.session.activity.unshift({
      at: nowIso(),
      text,
      ...detail
    });
    model.session.activity = model.session.activity.slice(0, 80);
  }

  function currentPlayer() {
    return model.session.players[model.session.currentPlayerIndex] ?? null;
  }

  function currentTurnLabel() {
    const player = currentPlayer();
    if (!model.session.started || !player) {
      return "Setup";
    }
    return `${Math.min(player.turnsTaken + 1, model.game.turnLimit)} / ${model.game.turnLimit}`;
  }

  function portfolioValue(player, prices = model.session.prices) {
    const holdingValue = Object.entries(player.holdings ?? {}).reduce((sum, [assetId, units]) => {
      return sum + Number(units || 0) * Number(prices[assetId] || 0) * 1000;
    }, 0);
    return Number(player.cash || 0) + holdingValue;
  }

  function uniqueHoldingCount(player) {
    return Object.values(player.holdings ?? {}).filter((units) => Number(units) > 0).length;
  }

  function drawCard(deckKey) {
    const deck = model.session.decks[deckKey];
    const discard = model.session.discards[deckKey];
    if (!deck.length && discard.length) {
      model.session.decks[deckKey] = shuffled(discard);
      model.session.discards[deckKey] = [];
    }
    return model.session.decks[deckKey].shift() ?? null;
  }

  function discardCard(deckKey, cardId) {
    if (cardId) {
      model.session.discards[deckKey].push(cardId);
    }
  }

  function getCard(deckKey, cardId) {
    return model.indexes.cards[deckKey].get(cardId) ?? null;
  }

  function getAsset(assetId) {
    return model.indexes.assets.get(assetId) ?? { id: assetId, name: assetId, color: "#d4af37", risk: 0 };
  }

  function getSpace(spaceId) {
    return model.indexes.spaces.get(spaceId) ?? null;
  }

  function setView(view) {
    model.session.view = view;
    saveSession();
    render();
  }

  function startSession() {
    updateDraftFromInputs();
    const count = Number(document.getElementById("playerCount")?.value ?? 2);
    if (count < 2 || count > 5) {
      setMessage("Choose 2-5 players.");
      render();
      return;
    }

    const players = [];
    const usedProfiles = new Set();
    for (let index = 0; index < count; index += 1) {
      const name = document.getElementById(`playerName${index}`)?.value.trim() || `Player ${index + 1}`;
      const profileId = document.getElementById(`playerProfile${index}`)?.value;
      const profile = model.game.cards.starterProfiles.find((item) => item.id === profileId);
      if (!profile) {
        setMessage(`Player ${index + 1} needs a Starter Profile.`);
        render();
        return;
      }
      if (usedProfiles.has(profile.id)) {
        setMessage("Starter Profiles must be unique in this prototype.");
        render();
        return;
      }
      usedProfiles.add(profile.id);
      players.push({
        id: `P${index + 1}`,
        name,
        profileId: profile.id,
        profileTitle: profile.title,
        cash: profile.cash,
        position: 0,
        turnsTaken: 0,
        holdings: {},
        riskEvidence: 0,
        ethicsPosition: profile.id === "SP03" ? 1 : 0,
        reflectionEvidence: 0,
        decisions: [
          {
            at: nowIso(),
            turn: 0,
            spaceId: "S00",
            note: `${profile.title}: ${profile.bonus}`,
            result: "Starter Profile assigned."
          }
        ],
        finished: false,
        profileBonuses: {},
        pending: {}
      });
    }

    model.session.players = players;
    model.session.started = true;
    model.session.gameOver = false;
    model.session.phase = "Roll";
    model.session.currentPlayerIndex = 0;
    model.session.pendingResolution = null;
    model.session.view = "play";
    logActivity(`Session started with ${players.length} players.`);
    saveSession();
    render();
  }

  function resetSession() {
    model.session = createSession();
    model.backend.sessionId = null;
    model.backend.revision = 0;
    model.backend.clientRole = "host";
    model.backend.lastSyncedJson = "";
    model.exportText = "";
    persistBackendState();
    saveSession();
    setMessage("New session created.");
    render();
  }

  function updateDraftFromInputs() {
    const count = Number(document.getElementById("playerCount")?.value ?? model.session.draft.playerCount);
    model.session.draft.playerCount = clamp(count, 2, 5);
    for (let index = 0; index < 5; index += 1) {
      const draft = model.session.draft.players[index] ?? { name: `Player ${index + 1}`, profileId: "" };
      const nameInput = document.getElementById(`playerName${index}`);
      const profileInput = document.getElementById(`playerProfile${index}`);
      draft.name = nameInput?.value ?? draft.name;
      draft.profileId = profileInput?.value ?? draft.profileId;
      model.session.draft.players[index] = draft;
    }
    saveSession();
  }

  function rollDie(value = null) {
    const session = model.session;
    const player = currentPlayer();
    if (!session.started || !player || session.gameOver) {
      setMessage("Start a session before rolling.");
      render();
      return;
    }
    if (session.pendingResolution) {
      setMessage("Resolve the current space before rolling again.");
      render();
      return;
    }
    if (player.finished || player.turnsTaken >= model.game.turnLimit) {
      setMessage(`${player.name} is already waiting for scoring.`);
      render();
      return;
    }

    const die = value ?? Math.floor(1 + Math.random() * 6);
    const nextPosition = Math.min(43, player.position + die);
    player.position = nextPosition;
    player.finished = nextPosition >= 43;
    session.die = die;
    session.phase = "Resolve";
    beginResolution(player, getSpace(`S${String(nextPosition).padStart(2, "0")}`), die);
    saveSession();
    render();
  }

  function beginResolution(player, space, die) {
    const pending = {
      playerId: player.id,
      spaceId: space.id,
      die,
      type: space.type,
      completed: false,
      cardDeck: null,
      cardId: null,
      result: []
    };
    model.session.pendingResolution = pending;

    if (space.cash) {
      player.cash += Number(space.cash);
      pending.result.push(`${space.label}: ${space.cash > 0 ? "gained" : "paid"} ${money(Math.abs(space.cash))}.`);
      completeResolution();
      return;
    }

    switch (space.type) {
      case "Start":
        pending.result.push("Starting cash is already assigned from the Starter Profile.");
        completeResolution();
        break;
      case "Finish":
        player.finished = true;
        pending.result.push("Reached Finish Review and waits for final scoring.");
        completeResolution();
        break;
      case "Market Pulse":
        resolveMarketPulse("board");
        break;
      case "Invest":
        pending.cardDeck = "investments";
        pending.cardId = drawCard("investments");
        if (!pending.cardId) {
          pending.result.push("Investment deck is empty. Player may pass and keep cash.");
          completeResolution();
        }
        break;
      case "Ethics Crossroad":
        pending.cardDeck = "ethics";
        pending.cardId = drawCard("ethics");
        if (!pending.cardId) {
          pending.result.push("Ethics deck is empty. Gain +1 ethics for discussing the printed fallback.");
          player.ethicsPosition += 1;
          completeResolution();
        }
        break;
      case "Research/Action":
        pending.cardDeck = "actions";
        pending.cardId = drawCard("actions");
        if (!pending.cardId) {
          player.riskEvidence += 1;
          pending.result.push("Action deck is empty. Fallback applied: +1 risk-management evidence.");
          completeResolution();
        }
        break;
      case "Reflection":
        pending.cardDeck = "reflection";
        pending.cardId = drawCard("reflection");
        if (!pending.cardId) {
          pending.result.push("Reflection deck is empty. Host may ask a finance explanation question.");
        }
        break;
      case "Choice":
      case "Rebalance":
        break;
      default:
        pending.result.push(`${space.type} resolved by host.`);
        completeResolution();
    }
  }

  function completeResolution(extraText = "") {
    const pending = model.session.pendingResolution;
    if (!pending) {
      return;
    }
    if (extraText) {
      pending.result.push(extraText);
    }
    pending.completed = true;
    model.session.phase = "Log";
  }

  function resolveMarketPulse(source) {
    const pending = model.session.pendingResolution;
    const cardId = drawCard("events");
    const event = getCard("events", cardId);
    if (!event) {
      if (pending) {
        pending.result.push("Market/Life deck is empty and no discard is available. No price change this turn.");
        completeResolution();
      }
      return;
    }
    applyMarketEvent(event, source);
    discardCard("events", event.id);
    if (pending) {
      pending.cardDeck = "events";
      pending.cardId = event.id;
      pending.result.push(`${event.id} ${event.title} revealed. Price floor of 1 enforced.`);
      completeResolution();
    }
  }

  function applyMarketEvent(event, source) {
    const beforeValues = new Map(model.session.players.map((player) => [player.id, portfolioValue(player)]));
    const appliedEffects = {};
    Object.entries(event.priceEffects ?? {}).forEach(([assetId, delta]) => {
      const next = Math.max(1, Number(model.session.prices[assetId] ?? 1) + Number(delta));
      appliedEffects[assetId] = next - Number(model.session.prices[assetId] ?? 1);
      model.session.prices[assetId] = next;
    });

    model.session.players.forEach((player) => {
      const trendDelta = Number(event.priceEffects?.trend ?? 0);
      if (player.profileId === "SP05" && trendDelta < 0 && Number(player.holdings.trend ?? 0) > 0 && !player.profileBonuses.trendLossCharged) {
        player.riskEvidence = Math.max(0, player.riskEvidence - 1);
        player.profileBonuses.trendLossCharged = true;
        logActivity(`${player.name} triggered Trend Chaser risk penalty.`);
      }

      const insuranceAsset = player.pending.insuranceAsset;
      if (insuranceAsset && Number(event.priceEffects?.[insuranceAsset] ?? 0) < 0) {
        player.cash += 3000;
        logActivity(`${player.name} collected ${money(3000)} from Insurance Hedge.`);
      }
      if (insuranceAsset) {
        delete player.pending.insuranceAsset;
      }

      const stopLossAsset = player.pending.stopLossAsset;
      if (stopLossAsset && Number(event.priceEffects?.[stopLossAsset] ?? 0) < 0) {
        const units = Number(player.holdings[stopLossAsset] ?? 0);
        if (units > 0) {
          const cashCompensation = Math.ceil(Math.abs(Number(event.priceEffects[stopLossAsset])) / 2) * units * 1000;
          player.cash += cashCompensation;
          logActivity(`${player.name} used Stop-Loss for ${money(cashCompensation)} protection.`);
        }
      }
      if (stopLossAsset) {
        delete player.pending.stopLossAsset;
      }

      if (player.pending.reserveReady) {
        const after = portfolioValue(player);
        if (Number(player.holdings.cash ?? 0) > 0 && after < Number(beforeValues.get(player.id) ?? after)) {
          player.cash += 4000;
          logActivity(`${player.name} used Emergency Reserve for ${money(4000)}.`);
        }
        delete player.pending.reserveReady;
      }
    });

    model.session.activeEvent = event;
    model.session.marketHistory.unshift({
      at: nowIso(),
      source,
      id: event.id,
      title: event.title,
      sentiment: event.sentiment,
      bias: event.bias,
      priceEffects: event.priceEffects,
      appliedEffects,
      prices: { ...model.session.prices }
    });
    model.session.marketHistory = model.session.marketHistory.slice(0, 30);
    logActivity(`Reveal Event: ${event.id} ${event.title}.`);
  }

  function buyInvestment(cardId) {
    const pending = model.session.pendingResolution;
    const player = currentPlayer();
    const card = getCard("investments", cardId);
    if (!pending || !player || !card) {
      return;
    }

    const cost = investmentCost(player, card);
    if (player.cash < cost) {
      setMessage(`${player.name} cannot afford ${card.title}.`);
      render();
      return;
    }

    player.cash -= cost;
    player.holdings[card.asset] = Number(player.holdings[card.asset] ?? 0) + Number(card.units ?? 1);
    consumeInvestmentDiscounts(player, card);
    discardCard("investments", card.id);
    completeResolution(`${player.name} bought ${card.title} for ${money(cost)}.`);
    saveSession();
    render();
  }

  function passInvestment(cardId) {
    const card = getCard("investments", cardId);
    if (card) {
      discardCard("investments", card.id);
    }
    completeResolution("Investment passed. Cash kept liquid.");
    saveSession();
    render();
  }

  function investmentCost(player, card) {
    let cost = Number(card.costIndex ?? 0) * 1000;
    if (player.profileId === "SP02" && !player.profileBonuses.firstGrowthIndexDiscount && ["growth", "index"].includes(card.asset)) {
      cost -= 2000;
    }
    if (player.profileId === "SP05" && card.asset === "trend") {
      cost -= 1000;
    }
    if (player.pending.riskyDiscount && ["growth", "crypto", "trend"].includes(card.asset)) {
      cost -= Number(player.pending.riskyDiscount);
    }
    if (
      player.pending.diversifyDiscount &&
      uniqueHoldingCount(player) >= 1 &&
      uniqueHoldingCount(player) <= 2 &&
      Number(player.holdings[card.asset] ?? 0) === 0
    ) {
      cost -= Number(player.pending.diversifyDiscount);
    }
    return Math.max(1000, cost);
  }

  function consumeInvestmentDiscounts(player, card) {
    if (player.profileId === "SP02" && ["growth", "index"].includes(card.asset)) {
      player.profileBonuses.firstGrowthIndexDiscount = true;
    }
    if (player.pending.riskyDiscount && ["growth", "crypto", "trend"].includes(card.asset)) {
      delete player.pending.riskyDiscount;
    }
    if (player.pending.diversifyDiscount && Number(player.holdings[card.asset] ?? 0) === 1) {
      delete player.pending.diversifyDiscount;
    }
  }

  function chooseEthics(choice) {
    const pending = model.session.pendingResolution;
    const player = currentPlayer();
    const card = pending ? getCard("ethics", pending.cardId) : null;
    if (!pending || !player || !card) {
      return;
    }
    const effect = card[choice];
    if (!effect) {
      return;
    }
    player.cash += Number(effect.cash ?? 0);
    player.ethicsPosition += Number(effect.ethics ?? 0);
    let result = `${choice === "responsible" ? "Responsible" : "Profit"} option: ${money(effect.cash ?? 0)}, ethics ${signed(effect.ethics ?? 0)}.`;

    if (choice === "responsible" && player.pending.ethicsAudit) {
      player.ethicsPosition += 1;
      delete player.pending.ethicsAudit;
      result += " Ethics Audit added +1 extra ethics.";
    }
    if (choice === "responsible" && effect.action) {
      const actionId = drawCard("actions");
      if (actionId) {
        discardCard("actions", actionId);
        result += ` Bonus Action drawn and logged: ${actionId}.`;
      }
    }
    discardCard("ethics", card.id);
    completeResolution(result);
    saveSession();
    render();
  }

  function resolveActionCard(assetId = "") {
    const pending = model.session.pendingResolution;
    const player = currentPlayer();
    const card = pending ? getCard("actions", pending.cardId) : null;
    if (!pending || !player || !card) {
      return;
    }

    let result = `${card.id} ${card.title}: ${card.text}`;
    switch (card.type) {
      case "research": {
        model.session.peekedEventId = model.session.decks.events[0] ?? null;
        const nextEvent = getCard("events", model.session.peekedEventId);
        result += nextEvent ? ` Peeked next event: ${nextEvent.id} ${nextEvent.title}.` : " No event available to peek.";
        break;
      }
      case "discount-risky":
        player.pending.riskyDiscount = 2000;
        result += " Next Growth/Crypto/Trend buy gets INR 2000 discount.";
        break;
      case "loss-limit":
        player.pending.stopLossAsset = assetId || bestRiskyHolding(player) || "growth";
        result += ` Stop-Loss armed for ${getAsset(player.pending.stopLossAsset).name}.`;
        break;
      case "hedge":
        player.pending.insuranceAsset = assetId || bestHolding(player) || "growth";
        result += ` Insurance Hedge armed for ${getAsset(player.pending.insuranceAsset).name}.`;
        break;
      case "cash-buffer":
        if (player.cash >= 20000) {
          player.riskEvidence += 2;
          result += " Cash condition met: +2 risk evidence.";
        } else {
          result += " Cash below INR 20000: no evidence bonus yet.";
        }
        break;
      case "reserve":
        player.pending.reserveReady = true;
        result += " Emergency Reserve armed for the next portfolio fall while holding Cash.";
        break;
      case "rebalance":
        player.pending.freeRebalance = true;
        player.riskEvidence += 1;
        result += " Free rebalance armed and +1 risk evidence added.";
        break;
      case "risk-check":
        player.riskEvidence += 1;
        result += " Second Opinion completed: +1 risk evidence.";
        break;
      case "explain":
        player.reflectionEvidence += 2;
        result += " Peer Review completed: +2 reflection evidence.";
        break;
      case "hold":
        player.cash += 1000;
        player.riskEvidence += 1;
        result += " Market Patience applied: INR 1000 and +1 risk evidence.";
        break;
      case "ethics-boost":
        player.pending.ethicsAudit = true;
        result += " Next responsible ethics choice gains +1 extra ethics.";
        break;
      case "diversify":
        player.pending.diversifyDiscount = 2000;
        result += " Next new category buy can receive INR 2000 discount.";
        break;
      default:
        result += " Host logged the action.";
    }
    discardCard("actions", card.id);
    completeResolution(result);
    saveSession();
    render();
  }

  function bestHolding(player) {
    return Object.entries(player.holdings ?? {})
      .filter(([, units]) => Number(units) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
  }

  function bestRiskyHolding(player) {
    return Object.entries(player.holdings ?? {})
      .filter(([assetId, units]) => Number(units) > 0 && ["growth", "crypto", "trend"].includes(assetId))
      .sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0];
  }

  function scoreReflection(score) {
    const pending = model.session.pendingResolution;
    const player = currentPlayer();
    const card = pending ? getCard("reflection", pending.cardId) : null;
    if (!pending || !player) {
      return;
    }
    player.reflectionEvidence += clamp(Number(score), 0, 10);
    if (card) {
      discardCard("reflection", card.id);
    }
    completeResolution(`Reflection evidence scored +${clamp(Number(score), 0, 10)}.`);
    saveSession();
    render();
  }

  function applyChoice(choiceIndex) {
    const pending = model.session.pendingResolution;
    const player = currentPlayer();
    const space = pending ? getSpace(pending.spaceId) : null;
    if (!pending || !player || !space) {
      return;
    }
    let result = "";
    if (space.id === "S04") {
      if (choiceIndex === 0) {
        player.riskEvidence += 1;
        result = "Safe choice: +1 risk-management evidence.";
      } else {
        player.position = Math.min(43, player.position + 1);
        result = "Risky choice: advanced +1 space. New space will not resolve until next turn.";
      }
    } else if (space.id === "S14") {
      if (choiceIndex === 0) {
        player.ethicsPosition += 1;
        result = "Responsible choice: +1 ethics.";
      } else {
        result = "Profit-first choice: no ethics bonus.";
      }
    } else if (space.id === "S26") {
      if (choiceIndex === 0) {
        player.riskEvidence += 1;
        result = "Held cash: +1 risk-management evidence.";
      } else {
        player.position = Math.min(43, player.position + 1);
        result = "Chased return: advanced +1 space. New space will not resolve until next turn.";
      }
    } else if (space.id === "S38") {
      if (choiceIndex === 0) {
        player.ethicsPosition += 1;
        result = "Impact choice: +1 ethics.";
      } else {
        player.position = Math.min(43, player.position + 1);
        result = "Profit sprint: advanced +1 space. New space will not resolve until next turn.";
      }
    } else {
      result = space.choices?.[choiceIndex] ?? "Choice logged.";
    }
    completeResolution(result);
    saveSession();
    render();
  }

  function sellHolding(playerId, assetId, silent = false) {
    const player = model.session.players.find((item) => item.id === playerId);
    if (!player || Number(player.holdings[assetId] ?? 0) <= 0) {
      return;
    }
    player.holdings[assetId] -= 1;
    if (player.holdings[assetId] <= 0) {
      delete player.holdings[assetId];
    }
    const saleValue = Number(model.session.prices[assetId] ?? 0) * 1000;
    player.cash += saleValue;
    if (!silent) {
      logActivity(`${player.name} sold 1 ${getAsset(assetId).name} for ${money(saleValue)}.`);
    }
  }

  function completeRebalance() {
    const player = currentPlayer();
    if (!player) {
      return;
    }
    player.riskEvidence += 1;
    if (player.pending.freeRebalance) {
      delete player.pending.freeRebalance;
    }
    completeResolution("Rebalance completed: +1 risk-management evidence.");
    saveSession();
    render();
  }

  function endTurn() {
    const session = model.session;
    const pending = session.pendingResolution;
    const player = currentPlayer();
    if (!player || !pending?.completed) {
      setMessage("Resolve the space before ending the turn.");
      render();
      return;
    }
    const note = document.getElementById("turnNote")?.value.trim();
    if (!note) {
      setMessage("Record one decision, finance term, or evidence note before ending the turn.");
      render();
      return;
    }

    player.decisions.unshift({
      at: nowIso(),
      turn: player.turnsTaken + 1,
      die: pending.die,
      spaceId: pending.spaceId,
      type: pending.type,
      cardId: pending.cardId,
      result: pending.result.join(" "),
      note
    });
    player.decisions = player.decisions.slice(0, 30);
    player.turnsTaken += 1;
    player.finished = player.finished || player.position >= 43 || player.turnsTaken >= model.game.turnLimit;
    applyProfileEndTurnBonuses(player);
    logActivity(`${player.name} ended turn ${player.turnsTaken} at S${String(player.position).padStart(2, "0")}.`);

    session.pendingResolution = null;
    session.die = null;
    session.peekedEventId = null;
    if (isGameOver()) {
      session.gameOver = true;
      session.phase = "Scoring";
      session.view = "scoring";
    } else {
      advanceCurrentPlayer();
      session.phase = "Roll";
    }
    saveSession();
    render();
  }

  function applyProfileEndTurnBonuses(player) {
    if (player.profileId === "SP01" && player.turnsTaken === 1 && player.cash >= 20000 && !player.profileBonuses.budgetBuilderRisk) {
      player.riskEvidence += 1;
      player.profileBonuses.budgetBuilderRisk = true;
      logActivity(`${player.name} earned Budget Builder +1 risk evidence.`);
    }
    if (player.profileId === "SP04" && player.turnsTaken <= 3 && uniqueHoldingCount(player) >= 3 && !player.profileBonuses.balancedPlannerReflection) {
      player.reflectionEvidence += 2;
      player.profileBonuses.balancedPlannerReflection = true;
      logActivity(`${player.name} earned Balanced Planner +2 reflection evidence.`);
    }
  }

  function isGameOver() {
    return model.session.players.length > 0 && model.session.players.every((player) => player.finished || player.turnsTaken >= model.game.turnLimit);
  }

  function advanceCurrentPlayer() {
    const players = model.session.players;
    for (let offset = 1; offset <= players.length; offset += 1) {
      const index = (model.session.currentPlayerIndex + offset) % players.length;
      const candidate = players[index];
      if (!candidate.finished && candidate.turnsTaken < model.game.turnLimit) {
        model.session.currentPlayerIndex = index;
        return;
      }
    }
  }

  function calculateScores() {
    const players = model.session.players;
    const values = players.map((player) => portfolioValue(player));
    const highest = Math.max(1, ...values);
    return players
      .map((player, index) => {
        const unique = uniqueHoldingCount(player);
        const value = values[index];
        const portfolioScore = round((value / highest) * Number(model.game.scoreWeights.portfolioValue ?? 25));
        const diversificationScore = Math.min(Number(model.game.scoreWeights.diversification ?? 20), unique * 4);
        const riskBase = player.riskEvidence * 2 + (player.cash >= 20000 ? 4 : 0) + (unique >= 3 ? 3 : 0);
        const riskManagementScore = Math.min(Number(model.game.scoreWeights.riskManagement ?? 15), riskBase);
        const ethicsScore = clamp(10 + player.ethicsPosition * 2, 0, Number(model.game.scoreWeights.ethics ?? 20));
        const reflectionScore = clamp(player.reflectionEvidence, 0, Number(model.game.scoreWeights.reflection ?? 20));
        const total = portfolioScore + diversificationScore + riskManagementScore + ethicsScore + reflectionScore;
        return {
          player,
          value,
          portfolioScore,
          diversificationScore,
          riskManagementScore,
          ethicsScore,
          reflectionScore,
          total
        };
      })
      .sort((a, b) => b.total - a.total || b.value - a.value);
  }

  function exportEvidence() {
    const payload = {
      exportedAt: nowIso(),
      app: "Give And Take QR session app",
      accessModel: "Host and players use the table code shown on the physical board or shared by the host.",
      session: model.session,
      scorePreview: calculateScores().map((score) => ({
        playerId: score.player.id,
        name: score.player.name,
        portfolioValue: score.value,
        portfolioScore: score.portfolioScore,
        diversificationScore: score.diversificationScore,
        riskManagementScore: score.riskManagementScore,
        ethicsScore: score.ethicsScore,
        reflectionScore: score.reflectionScore,
        total: score.total
      })),
      rulesLock: {
        movement: model.game.prototypeContract.movement,
        turnLimit: model.game.turnLimit,
        boardSpaces: model.game.boardSpaces.length,
        cardCounts: model.game.componentCounts,
        scoreWeights: model.game.scoreWeights
      },
      physicalFallback:
        "The website can run the full local session, but the physical board, cards, D6, and physical player boards remain valid if the QR site is unavailable."
    };
    model.exportText = JSON.stringify(payload, null, 2);
    return model.exportText;
  }

  function downloadEvidence() {
    const text = exportEvidence();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${model.session.code.toLowerCase()}-give-and-take-evidence.json`;
    link.click();
    URL.revokeObjectURL(url);
    render();
  }

  function signed(value) {
    const number = Number(value ?? 0);
    return number > 0 ? `+${number}` : String(number);
  }

  function render() {
    if (model.configError) {
      renderFatal(model.configError);
      return;
    }
    if (!model.game) {
      appRoot.innerHTML = `
        <section class="boot-card">
          <p class="kicker">Give And Take</p>
          <h1>Loading game rules...</h1>
          <p>Reading ${CONFIG_URL}.</p>
        </section>
      `;
      return;
    }
    if (!model.auth) {
      renderAuth();
      return;
    }
    renderApp();
  }

  function renderFatal(error) {
    appRoot.className = "boot-shell";
    appRoot.innerHTML = `
      <section class="boot-card">
        <p class="kicker">Give And Take</p>
        <h1>Game config is not available.</h1>
        <p>${escapeHtml(error.message ?? error)}</p>
        <p>Run the site from the repository root with <strong>python3 -m http.server 4173 -d .</strong>.</p>
      </section>
    `;
  }

  function renderAuth() {
    appRoot.className = "auth-page";
    appRoot.innerHTML = `
      <section class="auth-visual">
        <p class="kicker">Give And Take</p>
        <h1>Host or join a live game table.</h1>
        <p>Use the table code from the board to keep turns, prices, player ledgers, and final scoring aligned during play.</p>
        <div class="auth-proof">
          <div class="proof-tile"><strong>Host</strong><span>Create a table code</span></div>
          <div class="proof-tile"><strong>Join</strong><span>Enter the table code</span></div>
          <div class="proof-tile"><strong>Score</strong><span>Finish the review</span></div>
        </div>
      </section>
      <section class="auth-card">
        <div class="auth-tabs" role="tablist" aria-label="Access mode">
          ${["login", "signup", "guest", "join"]
            .map(
              (tab) => `
                <button class="auth-tab" type="button" data-auth-tab="${tab}" aria-selected="${model.authTab === tab}">
                  ${tab === "signup" ? "Sign up" : tab === "login" ? "Login" : tab === "guest" ? "Guest" : "Join"}
                </button>
              `
            )
            .join("")}
        </div>
        ${renderAuthPanel()}
      </section>
      ${renderToast()}
    `;
  }

  function renderAuthPanel() {
    if (model.authTab === "signup") {
      return `
        <form class="stack" data-auth-form="signup">
          <div class="field">
            <label for="signupName">Name</label>
            <input class="input" id="signupName" name="name" autocomplete="name" required />
          </div>
          <div class="field">
            <label for="signupEmail">Email</label>
            <input class="input" id="signupEmail" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="signupPassword">Password</label>
            <input class="input" id="signupPassword" name="password" type="password" autocomplete="new-password" minlength="6" required />
          </div>
          <p class="notice">${escapeHtml(backendNotice())}</p>
          <button class="button" type="submit">Create account</button>
        </form>
      `;
    }
    if (model.authTab === "guest") {
      return `
        <form class="stack" data-auth-form="guest">
          <div class="field">
            <label for="guestName">Host name</label>
            <input class="input" id="guestName" name="name" autocomplete="name" required />
          </div>
          <p class="notice">${escapeHtml(backendNotice())}</p>
          <button class="button" type="submit">Host table</button>
        </form>
      `;
    }
    if (model.authTab === "join") {
      return `
        <form class="stack" data-auth-form="join">
          <div class="field">
            <label for="joinName">Player name</label>
            <input class="input" id="joinName" name="name" autocomplete="name" required />
          </div>
          <div class="field">
            <label for="joinCode">Session code</label>
            <input class="input code-input" id="joinCode" name="code" value="GT-" inputmode="text" autocomplete="off" required />
          </div>
          <p class="notice">${escapeHtml(backendNotice())}</p>
          <button class="button" type="submit">Join session</button>
        </form>
      `;
    }
    return `
      <form class="stack" data-auth-form="login">
        <div class="field">
          <label for="loginEmail">Email</label>
          <input class="input" id="loginEmail" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="loginPassword">Password</label>
          <input class="input" id="loginPassword" name="password" type="password" autocomplete="current-password" required />
        </div>
        <p class="notice">${escapeHtml(backendNotice())}</p>
        <button class="button" type="submit">Login</button>
      </form>
    `;
  }

  function renderApp() {
    const player = currentPlayer();
    appRoot.className = "app-shell";
    appRoot.innerHTML = `
      <aside class="rail">
        <div class="brand-mark">
          <div class="brand-token">GT</div>
          <div>
            <p class="brand-title">Give And Take</p>
            <p class="brand-subtitle">QR game table</p>
          </div>
        </div>
        <nav class="nav-list" aria-label="Game sections">
          ${navItems
            .map(
              ([view, label]) => `
                <button class="nav-button" type="button" data-view="${view}" aria-current="${model.session.view === view ? "page" : "false"}">
                  <span>${label}</span>
                  <span>${view === "play" && model.session.pendingResolution ? "Live" : ""}</span>
                </button>
              `
            )
            .join("")}
        </nav>
        <div class="rail-footer">
          <div class="session-mini">
            <span class="label">Session</span>
            <strong>${escapeHtml(model.session.code)}</strong>
            <button class="mini-button" type="button" data-action="copy-session-code">Copy code</button>
          </div>
          <button class="button-ghost" type="button" data-action="logout">Logout</button>
        </div>
      </aside>
      <main class="main-shell">
        <header class="topbar">
          <div class="topbar-title">
            <div class="brand-token">D6</div>
            <div>
              <h1>${escapeHtml(sectionTitle(model.session.view))}</h1>
              <p>${escapeHtml(`${tableRoleLabel()}: ${model.auth.name}`)}</p>
            </div>
          </div>
          <div class="status-strip">
            <span class="status-pill">Turn <strong>${escapeHtml(currentTurnLabel())}</strong></span>
            <span class="status-pill">Player <strong>${escapeHtml(player?.name ?? "None")}</strong></span>
            <span class="status-pill">Phase <strong>${escapeHtml(model.session.phase)}</strong></span>
            <span class="status-pill">Mode <strong>${model.session.started ? "Live" : "Setup"}</strong></span>
          </div>
        </header>
        <section class="content">
          ${renderCurrentView()}
        </section>
      </main>
      ${renderToast()}
    `;
  }

  function sectionTitle(view) {
    return {
      setup: "Session Setup",
      play: "Play Table",
      market: "Market Tracker",
      players: "Player Ledger",
      scoring: "Final Scoring",
      export: "Evidence Export",
      rules: "Rules Reference"
    }[view] ?? "Give And Take";
  }

  function renderCurrentView() {
    switch (model.session.view) {
      case "setup":
        return renderSetup();
      case "play":
        return renderPlay();
      case "market":
        return renderMarket();
      case "players":
        return renderPlayers();
      case "scoring":
        return renderScoring();
      case "export":
        return renderExport();
      case "rules":
        return renderRules();
      default:
        return renderSetup();
    }
  }

  function renderSetup() {
    const draft = model.session.draft;
    return `
      <div class="grid two">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Setup</p>
              <h2>Build the table</h2>
              <p>Choose 2-5 unique Starter Profiles. Starting cash and profile bonuses apply automatically.</p>
            </div>
            <button class="button-ghost" type="button" data-action="new-session">New session</button>
          </div>
          <div class="stack">
            ${hostOnlyNotice()}
            <div class="session-code-card">
              <div>
                <span class="label">Table code</span>
                <strong>${escapeHtml(model.session.code)}</strong>
              </div>
              <div>
                <span class="label">Access</span>
                <strong>${escapeHtml(tableRoleLabel())}</strong>
              </div>
              <button class="button-secondary" type="button" data-action="copy-session-code">Copy code</button>
            </div>
            <div class="field">
              <label for="playerCount">Players</label>
              <select class="select" id="playerCount" data-draft="count" ${hostDisabledAttr(model.session.started)}>
                ${[2, 3, 4, 5]
                  .map((count) => `<option value="${count}" ${Number(draft.playerCount) === count ? "selected" : ""}>${count} players</option>`)
                  .join("")}
              </select>
            </div>
            ${Array.from({ length: Number(draft.playerCount) }, (_, index) => renderSetupRow(index)).join("")}
            <div class="btn-row">
              <button class="button" type="button" data-action="start-session" ${hostDisabledAttr(model.session.started)}>Start game</button>
              <button class="button-secondary" type="button" data-view="play" ${model.session.started ? "" : "disabled"}>Open play table</button>
            </div>
          </div>
        </section>
        <section class="panel board-reference">
          <div class="panel-header">
            <div>
              <p class="eyeline">Board reference</p>
              <h2>S00-S43 physical board</h2>
              <p>The QR app follows the same one-D6 route and stops at S43.</p>
            </div>
          </div>
          <figure>
            <img src="${BOARD_IMAGE_URL}" alt="Give And Take physical game board" />
            <figcaption>Use this as the visual reference while the website tracks the playable state.</figcaption>
          </figure>
        </section>
      </div>
    `;
  }

  function renderSetupRow(index) {
    const starterProfiles = model.game.cards.starterProfiles;
    const draft = model.session.draft.players[index] ?? { name: `Player ${index + 1}`, profileId: starterProfiles[index]?.id };
    const profile = starterProfiles.find((item) => item.id === draft.profileId) ?? starterProfiles[index] ?? starterProfiles[0];
    return `
      <article class="setup-row">
        <div class="metric-tile">
          <span>Seat</span>
          <strong>P${index + 1}</strong>
        </div>
        <div class="field">
          <label for="playerName${index}">Player name</label>
          <input class="input" id="playerName${index}" data-draft="name" data-index="${index}" value="${escapeHtml(draft.name)}" ${hostDisabledAttr(model.session.started)} />
        </div>
        <div class="field">
          <label for="playerProfile${index}">Starter Profile</label>
          <select class="select" id="playerProfile${index}" data-draft="profile" data-index="${index}" ${hostDisabledAttr(model.session.started)}>
            ${starterProfiles
              .map((item) => `<option value="${item.id}" ${item.id === profile.id ? "selected" : ""}>${item.id} ${escapeHtml(item.title)} - ${money(item.cash)}</option>`)
              .join("")}
          </select>
        </div>
      </article>
    `;
  }

  function renderPlay() {
    if (!model.session.started) {
      return `
        <section class="panel">
          <div class="empty-state">
            <h2>Setup is required before play.</h2>
            <p>Create 2-5 players, assign Starter Profiles, then start the session.</p>
            <button class="button" type="button" data-view="setup">Open setup</button>
          </div>
        </section>
      `;
    }
    return `
      <div class="grid three">
        <section class="panel stack">
          ${hostOnlyNotice()}
          ${renderCurrentPlayerCard()}
          ${renderPathTracker()}
        </section>
        <section class="panel stack">
          ${renderResolutionPanel()}
          ${renderTurnLogPanel()}
        </section>
        <section class="panel stack">
          ${renderDecks()}
          ${renderPriceTracker()}
        </section>
      </div>
      <div style="height:16px"></div>
      ${renderLedger()}
    `;
  }

  function renderCurrentPlayerCard() {
    const player = currentPlayer();
    const canRoll = Boolean(player && !model.session.pendingResolution && !model.session.gameOver && !player.finished && player.turnsTaken < model.game.turnLimit);
    return `
      <article class="resolution-card">
        <div class="panel-header">
          <div>
            <p class="eyeline">Current player</p>
            <h2>${escapeHtml(player?.name ?? "No player")}</h2>
            <p>${escapeHtml(player?.profileTitle ?? "Start setup first")}</p>
          </div>
          <button class="die-button" type="button" data-action="roll-die" ${hostDisabledAttr(!canRoll)}>${model.session.die ?? "D6"}</button>
        </div>
        <div class="metric-grid">
          <div class="metric-tile"><span>Position</span><strong>S${String(player?.position ?? 0).padStart(2, "0")}</strong></div>
          <div class="metric-tile"><span>Cash</span><strong>${money(player?.cash ?? 0)}</strong></div>
          <div class="metric-tile"><span>Value</span><strong>${money(player ? portfolioValue(player) : 0)}</strong></div>
          <div class="metric-tile"><span>Evidence</span><strong>R${player?.riskEvidence ?? 0} E${player?.ethicsPosition ?? 0} F${player?.reflectionEvidence ?? 0}</strong></div>
        </div>
        <div class="btn-row">
          ${[1, 2, 3, 4, 5, 6]
            .map((roll) => `<button class="mini-button" type="button" data-action="manual-roll" data-roll="${roll}" ${hostDisabledAttr(!canRoll)}>${roll}</button>`)
            .join("")}
        </div>
      </article>
    `;
  }

  function renderPathTracker() {
    const occupied = new Map();
    model.session.players.forEach((player) => {
      const list = occupied.get(player.position) ?? [];
      list.push(player.id);
      occupied.set(player.position, list);
    });
    return `
      <article>
        <div class="section-head">
          <div>
            <p class="eyeline">Board path</p>
            <h2>S00 to S43</h2>
          </div>
        </div>
        <div class="path-track" aria-label="Board position tracker">
          ${model.game.boardSpaces
            .map((space, index) => {
              const players = occupied.get(index) ?? [];
              const isActive = currentPlayer()?.position === index;
              const isFinish = index === 43;
              return `
                <div class="path-dot ${isActive ? "active" : ""} ${isFinish ? "finished" : ""}" title="${space.id} ${escapeHtml(space.label)}">
                  ${String(index).padStart(2, "0")}
                  <span class="pawn-markers">${players.map(() => `<span class="pawn-marker"></span>`).join("")}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      </article>
    `;
  }

  function renderResolutionPanel() {
    const pending = model.session.pendingResolution;
    if (model.session.gameOver) {
      return `
        <article class="resolution-card completed">
          <p class="eyeline">Scoring</p>
          <h2>Game is ready for final scoring.</h2>
          <p>All active players reached S43 or hit the 12-turn limit.</p>
          <button class="button" type="button" data-view="scoring">Open scoring</button>
        </article>
      `;
    }
    if (!pending) {
      return `
        <article class="resolution-card">
          <p class="eyeline">Resolve space</p>
          <h2>Ready to roll.</h2>
          <p>Roll one D6 or enter the physical die result. Movement is capped at S43.</p>
        </article>
      `;
    }
    const space = getSpace(pending.spaceId);
    return `
      <article class="resolution-card ${pending.completed ? "completed" : ""}">
        <p class="eyeline">${escapeHtml(space.type)}</p>
        <h2>${escapeHtml(space.id)} ${escapeHtml(space.label)}</h2>
        <p>${escapeHtml(space.effect ?? space.choices?.join(" ") ?? "Resolve this board space.")}</p>
        ${renderPendingCard(pending)}
        ${renderResolutionControls(pending, space)}
        ${pending.result.length ? `<ul class="effect-list">${pending.result.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </article>
    `;
  }

  function renderPendingCard(pending) {
    if (!pending.cardDeck || !pending.cardId) {
      return "";
    }
    const card = getCard(pending.cardDeck, pending.cardId);
    if (!card) {
      return "";
    }
    if (pending.cardDeck === "events") {
      return renderEventCard(card);
    }
    if (pending.cardDeck === "investments") {
      const asset = getAsset(card.asset);
      return `
        <article class="card-face" style="border-left-color:${cssVar(asset.color)}">
          <strong>${card.id} ${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.text)} Asset: ${escapeHtml(asset.name)}. Units: ${card.units}. Cost: ${money(investmentCost(currentPlayer(), card))}.</p>
        </article>
      `;
    }
    if (pending.cardDeck === "ethics") {
      return `
        <article class="card-face" style="border-left-color:var(--purple)">
          <strong>${card.id} ${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.prompt)}</p>
          <p>Profit: ${money(card.profit.cash)} / ethics ${signed(card.profit.ethics)}. Responsible: ${money(card.responsible.cash)} / ethics ${signed(card.responsible.ethics)}.</p>
        </article>
      `;
    }
    if (pending.cardDeck === "actions") {
      return `
        <article class="card-face" style="border-left-color:var(--teal)">
          <strong>${card.id} ${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.text)}</p>
        </article>
      `;
    }
    if (pending.cardDeck === "reflection") {
      return `
        <article class="card-face" style="border-left-color:var(--gold)">
          <strong>${card.id} ${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.prompt)}</p>
        </article>
      `;
    }
    return "";
  }

  function renderEventCard(event) {
    return `
      <article class="card-face" style="border-left-color:${event.sentiment === "Bear" ? "var(--red)" : event.sentiment === "Bull" ? "var(--green)" : "var(--gold)"}">
        <strong>${event.id} ${escapeHtml(event.title)}</strong>
        <p>Sentiment: ${escapeHtml(event.sentiment)}. Bias watch: ${escapeHtml(event.bias)}.</p>
        <div class="btn-row">
          ${Object.entries(event.priceEffects)
            .map(([assetId, delta]) => {
              const asset = getAsset(assetId);
              return `<span class="asset-chip" style="background:${cssVar(asset.color)}">${escapeHtml(asset.name)} ${signed(delta)}</span>`;
            })
            .join("")}
        </div>
      </article>
    `;
  }

  function renderResolutionControls(pending, space) {
    if (pending.completed) {
      return `<p class="success-text">Space resolved. Add the required note below, then end the turn.</p>`;
    }
    if (space.type === "Invest") {
      const card = getCard("investments", pending.cardId);
      return `
        <div class="btn-row">
          <button class="button" type="button" data-action="buy-investment" data-card-id="${escapeHtml(card?.id)}" ${hostDisabledAttr()}>Buy unit</button>
          <button class="button-secondary" type="button" data-action="pass-investment" data-card-id="${escapeHtml(card?.id)}" ${hostDisabledAttr()}>Pass</button>
        </div>
      `;
    }
    if (space.type === "Ethics Crossroad") {
      return `
        <div class="btn-row">
          <button class="button-secondary" type="button" data-action="choose-ethics" data-choice="profit" ${hostDisabledAttr()}>Profit option</button>
          <button class="button" type="button" data-action="choose-ethics" data-choice="responsible" ${hostDisabledAttr()}>Responsible option</button>
        </div>
      `;
    }
    if (space.type === "Research/Action") {
      const card = getCard("actions", pending.cardId);
      if (card?.type === "loss-limit" || card?.type === "hedge") {
        return `
          <div class="btn-row">
            ${["growth", "crypto", "trend", "index", "ethical", "bond"]
              .map((assetId) => `<button class="mini-button" type="button" data-action="resolve-action" data-asset-id="${assetId}" ${hostDisabledAttr()}>${escapeHtml(getAsset(assetId).name)}</button>`)
              .join("")}
          </div>
        `;
      }
      return `<button class="button" type="button" data-action="resolve-action" ${hostDisabledAttr()}>Apply Action</button>`;
    }
    if (space.type === "Reflection") {
      return `
        <div class="btn-row">
          ${[0, 2, 4, 6, 8, 10]
            .map((score) => `<button class="mini-button" type="button" data-action="score-reflection" data-score="${score}" ${hostDisabledAttr()}>${score}</button>`)
            .join("")}
        </div>
      `;
    }
    if (space.type === "Choice") {
      return `
        <div class="btn-row">
          ${(space.choices ?? ["Choice A", "Choice B"])
            .map((choice, index) => `<button class="${index === 0 ? "button" : "button-secondary"}" type="button" data-action="apply-choice" data-choice-index="${index}" ${hostDisabledAttr()}>${escapeHtml(choice)}</button>`)
            .join("")}
        </div>
      `;
    }
    if (space.type === "Rebalance") {
      const player = currentPlayer();
      return `
        <div class="btn-row">
          ${Object.entries(player.holdings)
            .filter(([, units]) => Number(units) > 0)
            .map(([assetId]) => `<button class="mini-button" type="button" data-action="sell-current-holding" data-asset-id="${assetId}" ${hostDisabledAttr()}>Sell 1 ${escapeHtml(getAsset(assetId).name)}</button>`)
            .join("")}
          <button class="button" type="button" data-action="complete-rebalance" ${hostDisabledAttr()}>Complete Rebalance</button>
        </div>
      `;
    }
    return `<button class="button" type="button" data-action="complete-generic" ${hostDisabledAttr()}>Complete</button>`;
  }

  function renderTurnLogPanel() {
    const pending = model.session.pendingResolution;
    return `
      <section class="stack">
        <div class="field">
          <label for="turnNote">Required decision, finance term, or evidence note</label>
          <p class="notice">Example note: I kept cash because liquidity protects me from surprise expenses.</p>
          <textarea class="textarea" id="turnNote" ${pending?.completed && canEditSession() ? "" : "disabled"}></textarea>
        </div>
        <div class="btn-row">
          <button class="button" type="button" data-action="end-turn" ${hostDisabledAttr(!pending?.completed)}>End turn</button>
        </div>
      </section>
    `;
  }

  function renderDecks() {
    return `
      <article>
        <div class="section-head">
          <div>
            <p class="eyeline">Decks</p>
            <h2>Draw and discard state</h2>
          </div>
        </div>
        <div class="deck-grid">
          ${Object.entries(deckMeta)
            .map(
              ([deckKey, meta]) => `
                <div class="deck-card">
                  <strong>${meta.label}</strong>
                  <span class="table-label">Deck ${model.session.decks[deckKey].length} / Discard ${model.session.discards[deckKey].length}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function renderPriceTracker() {
    return `
      <article>
        <div class="section-head">
          <div>
            <p class="eyeline">Price tracker</p>
            <h2>Asset indexes</h2>
          </div>
        </div>
        <div class="asset-bars">
          ${model.game.assets
            .map((asset) => {
              const index = Number(model.session.prices[asset.id] ?? asset.startIndex);
              const width = clamp(index * 4, 7, 100);
              return `
                <div class="asset-row">
                  <div class="asset-name">${escapeHtml(asset.name)}</div>
                  <div class="bar"><span style="width:${width}%; background:${cssVar(asset.color)}"></span></div>
                  <div class="index">${index}</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </article>
    `;
  }

  function renderLedger() {
    if (!model.session.players.length) {
      return "";
    }
    return `
      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyeline">Players</p>
            <h2>Ledger</h2>
          </div>
        </div>
        <div class="ledger">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Space</th>
                <th>Cash</th>
                <th>Portfolio value</th>
                <th>Holdings</th>
                <th>Risk</th>
                <th>Ethics</th>
                <th>Reflection</th>
              </tr>
            </thead>
            <tbody>
              ${model.session.players.map(renderLedgerRow).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderLedgerRow(player) {
    return `
      <tr>
        <td><strong>${escapeHtml(player.name)}</strong><br><span>${escapeHtml(player.profileTitle)}</span></td>
        <td class="num">S${String(player.position).padStart(2, "0")}</td>
        <td class="num">${money(player.cash)}</td>
        <td class="num">${money(portfolioValue(player))}</td>
        <td>${renderHoldings(player)}</td>
        <td class="num">${player.riskEvidence}</td>
        <td class="num">${player.ethicsPosition}</td>
        <td class="num">${player.reflectionEvidence}</td>
      </tr>
    `;
  }

  function renderHoldings(player) {
    const holdings = Object.entries(player.holdings ?? {}).filter(([, units]) => Number(units) > 0);
    if (!holdings.length) {
      return `<span class="muted">Cash only</span>`;
    }
    return `
      <div class="holding-list">
        ${holdings
          .map(([assetId, units]) => {
            const asset = getAsset(assetId);
            return `<span class="asset-chip" style="background:${cssVar(asset.color)}">${escapeHtml(asset.name)} x${units}</span>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderMarket() {
    return `
      <div class="grid two">
        <section class="panel stack">
          ${hostOnlyNotice()}
          <div class="panel-header">
            <div>
              <p class="eyeline">Host market</p>
              <h2>Reveal Event</h2>
              <p>Use this only when the board space or host flow calls for a Market/Life card.</p>
            </div>
            <button class="button" type="button" data-action="host-reveal-event" ${hostDisabledAttr(!model.session.started)}>Reveal Event</button>
          </div>
          ${model.session.activeEvent ? renderEventCard(model.session.activeEvent) : `<div class="empty-state">No Market/Life event revealed yet.</div>`}
          ${renderPriceTracker()}
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Market history</p>
              <h2>Latest events</h2>
            </div>
          </div>
          <div class="stack">
            ${
              model.session.marketHistory.length
                ? model.session.marketHistory.map(renderMarketHistoryRow).join("")
                : `<div class="empty-state">Market history starts after the first event.</div>`
            }
          </div>
        </section>
      </div>
    `;
  }

  function renderMarketHistoryRow(item) {
    return `
      <article class="event-row">
        <strong>${escapeHtml(item.id)} ${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.sentiment)} / ${escapeHtml(item.bias)} / ${escapeHtml(item.source)}</p>
        <div class="btn-row">
          ${Object.entries(item.priceEffects)
            .map(([assetId, delta]) => `<span class="chip">${escapeHtml(getAsset(assetId).name)} <strong>${signed(delta)}</strong></span>`)
            .join("")}
        </div>
      </article>
    `;
  }

  function renderPlayers() {
    if (!model.session.players.length) {
      return `<section class="panel"><div class="empty-state">Start setup before editing player ledgers.</div></section>`;
    }
    return `
      <div class="grid two">
        ${hostOnlyNotice()}
        ${model.session.players.map(renderPlayerCard).join("")}
      </div>
    `;
  }

  function renderPlayerCard(player) {
    return `
      <article class="player-card">
        <header>
          <div>
            <p class="eyeline">${escapeHtml(player.id)}</p>
            <h2>${escapeHtml(player.name)}</h2>
            <p>${escapeHtml(player.profileTitle)}</p>
          </div>
          <span class="status-pill">S<strong>${String(player.position).padStart(2, "0")}</strong></span>
        </header>
        <div class="metric-grid">
          <div class="metric-tile"><span>Cash</span><strong>${money(player.cash)}</strong></div>
          <div class="metric-tile"><span>Value</span><strong>${money(portfolioValue(player))}</strong></div>
          <div class="metric-tile"><span>Categories</span><strong>${uniqueHoldingCount(player)}</strong></div>
          <div class="metric-tile"><span>Turns</span><strong>${player.turnsTaken}/${model.game.turnLimit}</strong></div>
        </div>
        <div class="stack compact">
          <div>${renderHoldings(player)}</div>
          <div class="adjust-grid">
            <button class="mini-button" type="button" data-action="adjust-player" data-player-id="${player.id}" data-field="cash" data-delta="1000" ${hostDisabledAttr()}>+INR 1000</button>
            <button class="mini-button" type="button" data-action="adjust-player" data-player-id="${player.id}" data-field="riskEvidence" data-delta="1" ${hostDisabledAttr()}>+Risk</button>
            <button class="mini-button" type="button" data-action="adjust-player" data-player-id="${player.id}" data-field="ethicsPosition" data-delta="1" ${hostDisabledAttr()}>+Ethics</button>
            <button class="mini-button" type="button" data-action="adjust-player" data-player-id="${player.id}" data-field="reflectionEvidence" data-delta="1" ${hostDisabledAttr()}>+Reflection</button>
            ${Object.entries(player.holdings)
              .filter(([, units]) => Number(units) > 0)
              .map(([assetId]) => `<button class="mini-button" type="button" data-action="sell-holding" data-player-id="${player.id}" data-asset-id="${assetId}" ${hostDisabledAttr()}>Sell ${escapeHtml(getAsset(assetId).name)}</button>`)
              .join("")}
          </div>
        </div>
      </article>
    `;
  }

  function renderScoring() {
    const scores = calculateScores();
    return `
      <section class="panel stack">
        <div class="panel-header">
          <div>
            <p class="eyeline">Final Review</p>
            <h2>Score out of 100</h2>
            <p>Portfolio 25, diversification 20, risk management 15, ethics 20, reflection 20.</p>
          </div>
          <button class="button" type="button" data-action="download-evidence">Export evidence</button>
        </div>
        <div class="stack">
          ${scores
            .map(
              (score, index) => `
                <article class="score-row ${index === 0 ? "winner" : ""}">
                  <div>
                    <h3>${index + 1}. ${escapeHtml(score.player.name)}</h3>
                    <p>
                      Value ${money(score.value)} | Portfolio ${score.portfolioScore} | Diversification ${score.diversificationScore}
                      | Risk ${score.riskManagementScore} | Ethics ${score.ethicsScore} | Reflection ${score.reflectionScore}
                    </p>
                  </div>
                  <strong class="num">${score.total}</strong>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderExport() {
    const text = model.exportText || exportEvidence();
    return `
      <section class="panel stack">
        <div class="panel-header">
          <div>
            <p class="eyeline">Evidence</p>
            <h2>Session export</h2>
            <p>Use this JSON for host evidence and debugging. It includes local gameplay state, not fabricated playtest findings.</p>
          </div>
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="refresh-export">Refresh JSON</button>
            <button class="button" type="button" data-action="download-evidence">Download JSON</button>
          </div>
        </div>
        <pre class="export-box" id="evidenceOutput">${escapeHtml(text)}</pre>
      </section>
    `;
  }

  function renderRules() {
    const rules = [
      ["Setup", "Give each player one Starter Profile, Player Board, pawn, and starting cash."],
      ["Turn", "Roll one D6, move forward on S00-S43, resolve the landing space, then record one note."],
      ["Movement", "If a roll passes S43, stop at S43. Choice advances do not resolve the new space until next turn."],
      ["Decks", "When a deck runs out, shuffle its discard pile into a new draw deck."],
      ["Market", "Asset price indexes cannot fall below 1."],
      ["End", "Score when all players reach S43 or after 12 turns per player."],
      ["Formula", "Value 25, diversification 20, risk 15, ethics 20, reflection 20."]
    ];
    return `
      <div class="grid two">
        <section class="panel stack">
          <div class="panel-header">
            <div>
              <p class="eyeline">Quick reference</p>
              <h2>Game rules</h2>
            </div>
          </div>
          ${rules.map(([title, text]) => `<article class="rule-row"><strong>${title}</strong><span>${escapeHtml(text)}</span></article>`).join("")}
        </section>
        <section class="panel stack">
          <div class="panel-header">
            <div>
              <p class="eyeline">Reference cards</p>
              <h2>Printed quick cards</h2>
            </div>
          </div>
          ${model.game.cards.quickReference
            .map((card) => `<article class="card-face"><strong>${card.id} ${escapeHtml(card.title)}</strong><p>${escapeHtml(card.text)}</p></article>`)
            .join("")}
        </section>
      </div>
    `;
  }

  function renderToast() {
    return model.message ? `<div class="toast" role="status">${escapeHtml(model.message)}</div>` : "";
  }

  async function createGuestAuth(name) {
    if (model.backend.provider === "supabase") {
      return {
        mode: "guest",
        id: getClientId(),
        name,
        email: null
      };
    }
    if (!model.backend.online) {
      return { mode: "guest", name, id: `guest-${Date.now()}` };
    }
    const result = await apiRequest("/auth/guest", {
      method: "POST",
      body: { name }
    });
    return result.auth;
  }

  async function createAccountAuth(name, email, password) {
    if (model.backend.provider === "supabase") {
      const { data, error } = await model.backend.client.auth.signUp({
        email,
        password,
        options: { data: { name } }
      });
      if (error) {
        throw error;
      }
      if (!data.session && data.user) {
        throw new Error("Email confirmation is required before this account can be used.");
      }
      return {
        mode: "account",
        id: data.user.id,
        name,
        email
      };
    }
    if (!model.backend.online) {
      return null;
    }
    const result = await apiRequest("/auth/signup", {
      method: "POST",
      body: { name, email, password }
    });
    return result.auth;
  }

  async function loginAccountAuth(email, password) {
    if (model.backend.provider === "supabase") {
      const { data, error } = await model.backend.client.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        throw error;
      }
      return {
        mode: "account",
        id: data.user.id,
        name: data.user.user_metadata?.name ?? email,
        email
      };
    }
    if (!model.backend.online) {
      return null;
    }
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    return result.auth;
  }

  async function joinSessionFromAuth(formData) {
    const name = String(formData.get("name") ?? "").trim();
    const code = normaliseSessionCode(formData.get("code"));
    if (!name) {
      setMessage("Enter a player name.");
      render();
      return;
    }
    if (!/^GT-[0-9]{4}$/.test(code)) {
      setMessage("Use a session code like GT-4827.");
      render();
      return;
    }

    if (model.backend.online) {
      try {
        model.auth = await createGuestAuth(name);
        writeStore(STORAGE.auth, model.auth);
        model.session = await loadBackendSession(code);
        writeStore(STORAGE.session, model.session);
        persistBackendState();
        startBackendPoller();
        setMessage(`Joined ${code}.`);
        render();
      } catch (error) {
        setMessage(error.message ?? `Could not join ${code}.`);
        render();
      }
      return;
    }

    const stored = readStore(STORAGE.session, null);
    if (stored && normaliseSessionCode(stored.code) === code) {
      model.auth = { mode: "guest", name, id: `guest-${Date.now()}` };
      writeStore(STORAGE.auth, model.auth);
      model.backend.clientRole = "player";
      model.session = ensureSessionShape(stored);
      writeStore(STORAGE.session, model.session);
      setMessage(`Joined ${code} in local mode.`);
      render();
      return;
    }

    setMessage("That code is not stored in this browser. Start the session server for cross-device joins.");
    render();
  }

  async function copySessionCode() {
    const code = model.session?.code ?? "";
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`${code} copied.`);
    } catch {
      setMessage(`Session code: ${code}`);
    }
    render();
  }

  async function handleAuthSubmit(form) {
    const formData = new FormData(form);
    const mode = form.dataset.authForm;

    if (mode === "join") {
      await joinSessionFromAuth(formData);
      return;
    }

    if (mode === "guest") {
      const name = String(formData.get("name") ?? "").trim();
      if (!name) {
        setMessage("Enter a host name.");
        render();
        return;
      }
      try {
        model.auth = await createGuestAuth(name);
      } catch (error) {
        model.backend.online = false;
        model.auth = { mode: "guest", name, id: `guest-${Date.now()}` };
        setMessage("Online table setup is unavailable. This browser can still host locally.");
      }
      writeStore(STORAGE.auth, model.auth);
      model.backend.clientRole = "host";
      model.session = ensureSessionShape(readStore(STORAGE.session, null) ?? createSession());
      restoreBackendState();
      saveSession();
      startBackendPoller();
      render();
      return;
    }

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) {
      setMessage("Email and password are required.");
      render();
      return;
    }

    if (mode === "signup") {
      const name = String(formData.get("name") ?? "").trim();
      if (!name || password.length < 6) {
        setMessage("Use a name and a password of at least 6 characters.");
        render();
        return;
      }
      if (model.backend.online) {
        try {
          model.auth = await createAccountAuth(name, email, password);
          writeStore(STORAGE.auth, model.auth);
          model.backend.clientRole = "host";
          model.session = ensureSessionShape(readStore(STORAGE.session, null) ?? createSession());
          restoreBackendState();
          saveSession();
          startBackendPoller();
          render();
          return;
        } catch (error) {
          setMessage("Account creation is unavailable right now. Use guest hosting for this play session.");
          render();
          return;
        }
      }
      setMessage("Account creation needs the hosted account service. Use guest hosting on this device.");
      render();
      return;
    }

    if (model.backend.online) {
      try {
        model.auth = await loginAccountAuth(email, password);
        writeStore(STORAGE.auth, model.auth);
        model.backend.clientRole = "host";
        model.session = ensureSessionShape(readStore(STORAGE.session, null) ?? createSession());
        restoreBackendState();
        saveSession();
        startBackendPoller();
        render();
        return;
      } catch (error) {
        setMessage("Account login is unavailable or the credentials are incorrect. Use guest hosting for this play session.");
        render();
        return;
      }
    }

    setMessage("Account login needs the hosted account service. Use guest hosting on this device.");
    render();
  }

  function adjustPlayer(playerId, field, delta) {
    const player = model.session.players.find((item) => item.id === playerId);
    if (!player) {
      return;
    }
    player[field] = Number(player[field] ?? 0) + Number(delta);
    if (["riskEvidence", "reflectionEvidence"].includes(field)) {
      player[field] = Math.max(0, player[field]);
    }
    logActivity(`${player.name} adjusted ${field} by ${signed(delta)}.`);
    saveSession();
    render();
  }

  function handleClick(event) {
    const button = event.target.closest("button");
    if (!button) {
      return;
    }

    const authTab = button.dataset.authTab;
    if (authTab) {
      model.authTab = authTab;
      render();
      return;
    }

    const view = button.dataset.view;
    if (view) {
      setView(view);
      return;
    }

    const action = button.dataset.action;
    if (!action) {
      return;
    }

    switch (action) {
      case "logout":
        if (model.backend.provider === "supabase") {
          model.backend.client.auth.signOut();
        }
        model.auth = null;
        model.backend.sessionId = null;
        model.backend.revision = 0;
        model.backend.clientRole = null;
        model.backend.lastSyncedJson = "";
        writeStore(STORAGE.auth, null);
        writeStore(STORAGE.backend, null);
        render();
        break;
      case "new-session":
        resetSession();
        break;
      case "copy-session-code":
        copySessionCode();
        break;
      case "start-session":
        if (!requireHostAction()) break;
        startSession();
        break;
      case "roll-die":
        if (!requireHostAction()) break;
        rollDie();
        break;
      case "manual-roll":
        if (!requireHostAction()) break;
        rollDie(Number(button.dataset.roll));
        break;
      case "buy-investment":
        if (!requireHostAction()) break;
        buyInvestment(button.dataset.cardId);
        break;
      case "pass-investment":
        if (!requireHostAction()) break;
        passInvestment(button.dataset.cardId);
        break;
      case "choose-ethics":
        if (!requireHostAction()) break;
        chooseEthics(button.dataset.choice);
        break;
      case "resolve-action":
        if (!requireHostAction()) break;
        resolveActionCard(button.dataset.assetId);
        break;
      case "score-reflection":
        if (!requireHostAction()) break;
        scoreReflection(Number(button.dataset.score));
        break;
      case "apply-choice":
        if (!requireHostAction()) break;
        applyChoice(Number(button.dataset.choiceIndex));
        break;
      case "sell-current-holding":
        if (!requireHostAction()) break;
        sellHolding(currentPlayer().id, button.dataset.assetId);
        saveSession();
        render();
        break;
      case "complete-rebalance":
        if (!requireHostAction()) break;
        completeRebalance();
        break;
      case "complete-generic":
        if (!requireHostAction()) break;
        completeResolution("Host marked the space resolved.");
        saveSession();
        render();
        break;
      case "end-turn":
        if (!requireHostAction()) break;
        endTurn();
        break;
      case "host-reveal-event":
        if (!requireHostAction()) break;
        resolveMarketPulse("host");
        saveSession();
        render();
        break;
      case "adjust-player":
        if (!requireHostAction()) break;
        adjustPlayer(button.dataset.playerId, button.dataset.field, button.dataset.delta);
        break;
      case "sell-holding":
        if (!requireHostAction()) break;
        sellHolding(button.dataset.playerId, button.dataset.assetId);
        saveSession();
        render();
        break;
      case "refresh-export":
        exportEvidence();
        render();
        break;
      case "download-evidence":
        downloadEvidence();
        break;
      default:
        break;
    }
  }

  function handleChange(event) {
    if (event.target.matches("[data-draft]")) {
      updateDraftFromInputs();
      if (event.target.dataset.draft === "count") {
        render();
      }
    }
  }

  function handleInput(event) {
    if (event.target.matches('[data-draft="name"]')) {
      updateDraftFromInputs();
    }
  }

  function handleSubmit(event) {
    const form = event.target.closest("form[data-auth-form]");
    if (!form) {
      return;
    }
    event.preventDefault();
    handleAuthSubmit(form);
  }

  async function init() {
    appRoot.addEventListener("click", handleClick);
    appRoot.addEventListener("input", handleInput);
    appRoot.addEventListener("change", handleChange);
    appRoot.addEventListener("submit", handleSubmit);

    try {
      model.game = await loadGame();
      model.indexes = buildIndexes(model.game);
      await probeBackend();
      model.auth = readStore(STORAGE.auth, null);
      model.session = ensureSessionShape(readStore(STORAGE.session, null) ?? createSession());
      if (!model.auth) {
        model.session = createSession();
        model.backend.clientRole = null;
      } else {
        restoreBackendState();
        if (!model.backend.clientRole && !model.backend.sessionId) {
          model.backend.clientRole = "host";
        }
      }
      saveSession();
      startBackendPoller();
    } catch (error) {
      model.configError = error;
    }
    render();
  }

  init();
})();
