(() => {
  "use strict";

  const CONFIG_URL = "../../game_data/game_config.json";
  const BOARD_IMAGE_URL = "../../outputs/final_assets/board/give_and_take_board_with_qr.png";
  const API_BASE = "/api";
  const BACKEND_POLL_MS = 2500;
  const PRODUCTION_APP_URL = "https://avyukt3lg.github.io/give-and-take-qr-app/website/host-dashboard/";
  const STORAGE = {
    auth: "give-and-take:auth:v1",
    backend: "give-and-take:backend:v1",
    client: "give-and-take:client:v1",
    session: "give-and-take:session:v3",
    ui: "give-and-take:ui:v1"
  };

  const deckMeta = {
    investments: { label: "Investment", configKey: "investments", icon: "UP", tone: "investment" },
    events: { label: "Market/Life", configKey: "events", icon: "MK", tone: "market" },
    ethics: { label: "Ethics", configKey: "ethics", icon: "EQ", tone: "ethics" },
    actions: { label: "Action", configKey: "actions", icon: "CK", tone: "action" },
    reflection: { label: "Reflection", configKey: "reflection", icon: "RF", tone: "reflection" }
  };

  const navItems = [
    ["setup", "Setup", "TB"],
    ["play", "Play", "D6"],
    ["market", "Market", "MK"],
    ["players", "Ledger", "PL"],
    ["scoring", "Scores", "SC"],
    ["export", "Export", "EX"],
    ["rules", "Help", "HP"]
  ];

  const playerTokens = ["#d7b45b", "#3fb6a6", "#da6b4f", "#7d6bd6", "#5aa36f"];

  const profileMeta = {
    SP01: { icon: "WL", style: "Liquidity keeper" },
    SP02: { icon: "GR", style: "Growth seeker" },
    SP03: { icon: "ES", style: "Impact first" },
    SP04: { icon: "DB", style: "Balanced builder" },
    SP05: { icon: "TR", style: "Hype watcher" }
  };

  const assetUi = {
    cash: { icon: "CA", pattern: "solid", label: "Low-risk liquidity" },
    bond: { icon: "GB", pattern: "stripe", label: "Defensive income" },
    index: { icon: "IX", pattern: "cross", label: "Diversified basket" },
    growth: { icon: "GS", pattern: "dot", label: "Higher-growth company" },
    crypto: { icon: "CR", pattern: "dash", label: "Extreme volatility" },
    ethical: { icon: "EB", pattern: "stipple", label: "Responsible business" },
    trend: { icon: "UT", pattern: "zigzag", label: "Hype-sensitive trend" }
  };

  const spaceUi = {
    Start: { icon: "ST", tone: "start", help: "Collect profile cash and begin the route." },
    Income: { icon: "IN", tone: "income", help: "Add fictional cash to the player ledger." },
    Invest: { icon: "IV", tone: "invest", help: "Draw Investment and buy or pass." },
    "Research/Action": { icon: "AC", tone: "action", help: "Draw Action or gain risk evidence if empty." },
    Choice: { icon: "CH", tone: "choice", help: "Choose one equal option and commit it." },
    "Market Pulse": { icon: "MK", tone: "market", help: "Draw Market/Life and update shared prices." },
    "Life Expense": { icon: "EX", tone: "expense", help: "Pay the printed expense from cash." },
    "Ethics Crossroad": { icon: "EQ", tone: "ethics", help: "Choose profit or responsible effect." },
    Rebalance: { icon: "RB", tone: "rebalance", help: "Sell or adjust holdings, then gain risk evidence." },
    Reflection: { icon: "RF", tone: "reflection", help: "Answer and score reflection evidence." },
    Finish: { icon: "FN", tone: "finish", help: "Wait for final scoring." }
  };

  const evidenceNotes = {
    Income: "Recorded income and updated cash.",
    "Life Expense": "Recorded expense and updated cash.",
    "Market Pulse": "Observed market event and price impact.",
    "Ethics Crossroad": "Explained profit versus responsible choice.",
    Invest: "Bought or passed after considering risk-return.",
    "Research/Action": "Used action card to manage risk.",
    Rebalance: "Adjusted portfolio and gained risk evidence.",
    Reflection: "Answered reflection prompt.",
    Choice: "Made a risk or ethics trade-off.",
    Start: "Confirmed starting cash and first goal.",
    Finish: "Reached final review."
  };

  const phaseSteps = ["Roll", "Resolve", "Log", "End"];

  const appRoot = document.getElementById("app");
  const model = {
    game: null,
    indexes: null,
    auth: null,
    authTab: "guest",
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
      unavailableReason: "",
      saveState: "local",
      lastSavedAt: null
    },
    ui: {
      theme: readStore(STORAGE.ui, {})?.theme ?? (window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "classroom" : "table"),
      diceMode: readStore(STORAGE.ui, {})?.diceMode ?? "digital",
      boardExpanded: false,
      ledgerEditMode: false,
      rulesQuery: "",
      dialog: null
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

  function persistUi() {
    writeStore(STORAGE.ui, {
      theme: model.ui.theme,
      diceMode: model.ui.diceMode
    });
  }

  function setSaveState(state, detail = "") {
    model.backend.saveState = state;
    model.backend.unavailableReason = detail || model.backend.unavailableReason || "";
    if (state === "synced" || state === "local") {
      model.backend.lastSavedAt = nowIso();
    }
  }

  function withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  function relativeTime(iso) {
    if (!iso) {
      return "not saved yet";
    }
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 10) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function saveModeLabel() {
    if (model.backend.provider === "supabase" && model.backend.online) {
      return "Live table";
    }
    if (model.backend.online) {
      return "Local network";
    }
    return "This browser";
  }

  function sessionStatus() {
    if (model.backend.saving || model.backend.saveState === "saving") {
      return { state: "saving", label: "Saving", detail: "Writing the latest table state.", action: "" };
    }
    if (model.backend.saveState === "failed") {
      return {
        state: "failed",
        label: "Save failed",
        detail: "Saved in this browser. Retry when the connection is back.",
        action: `<button class="mini-button" type="button" data-action="retry-sync">Retry</button>`
      };
    }
    if (model.backend.online && model.backend.saveState === "synced") {
      return { state: "synced", label: "Synced", detail: `Last saved ${relativeTime(model.backend.lastSavedAt)}.`, action: "" };
    }
    if (model.backend.online) {
      return { state: "synced", label: "Ready", detail: `${saveModeLabel()} is ready.`, action: "" };
    }
    return {
      state: "local",
      label: "Local only",
      detail: "This table is stored in the current browser.",
      action: ""
    };
  }

  function assetMeta(assetId) {
    const asset = getAsset(assetId);
    return {
      ...asset,
      ...(assetUi[assetId] ?? { icon: assetId.slice(0, 2).toUpperCase(), pattern: "solid", label: asset.name })
    };
  }

  function spaceMeta(type) {
    return spaceUi[type] ?? { icon: "SP", tone: "generic", help: "Resolve the printed board space." };
  }

  function profileUi(profileId) {
    return profileMeta[profileId] ?? { icon: profileId?.slice(0, 2) ?? "SP", style: "Starter profile" };
  }

  function phaseIndex() {
    if (model.session.gameOver) {
      return phaseSteps.length;
    }
    if (model.session.phase === "Setup") {
      return 0;
    }
    const index = phaseSteps.indexOf(model.session.phase);
    return index >= 0 ? index : 0;
  }

  function choiceDetails(space, choice, index) {
    const text = String(choice ?? "");
    const lower = text.toLowerCase();
    const movement = lower.includes("advance") ? "+1 space; do not resolve it this turn" : "No extra movement";
    const risk = lower.includes("risk-management") ? "+1 risk evidence" : "No risk change";
    const ethics = lower.includes("ethics") && lower.includes("+1") ? "+1 ethics" : lower.includes("profit-first") ? "No ethics bonus" : "No ethics change";
    const title = text.includes(":") ? text.split(":")[0] : `Option ${index + 1}`;
    return {
      title,
      consequence: text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : text,
      risk,
      ethics,
      movement,
      confirm: `You chose ${title}. ${movement}. Confirm this choice for ${space.id} ${space.label}?`
    };
  }

  function scoreStateLabel() {
    return model.session.gameOver || isGameOver() ? "Final Review" : "Provisional Scoreboard";
  }

  function exportSummary() {
    const notes = model.session.players.reduce((sum, player) => sum + player.decisions.length, 0);
    const cardsDrawn = model.session.players.reduce((sum, player) => {
      return sum + player.decisions.filter((decision) => decision.cardId).length;
    }, 0);
    const totalTurns = model.session.players.reduce((sum, player) => sum + player.turnsTaken, 0);
    return {
      code: model.session.code,
      createdAt: model.session.createdAt,
      updatedAt: model.session.updatedAt,
      playerCount: model.session.players.length,
      totalTurns,
      events: model.session.marketHistory.length,
      cardsDrawn,
      notes,
      scoreState: scoreStateLabel(),
      saveMode: saveModeLabel()
    };
  }

  function openDialog(dialog) {
    model.ui.dialog = dialog;
    render();
    window.setTimeout(() => {
      appRoot.querySelector(".dialog-card button, .dialog-card input, .dialog-card textarea, .dialog-card select")?.focus();
    }, 0);
  }

  function closeDialog() {
    model.ui.dialog = null;
    render();
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

  function normaliseUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.href.endsWith("/") ? url.href : `${url.href}/`;
    } catch {
      return PRODUCTION_APP_URL;
    }
  }

  function authRedirectUrl() {
    const staticConfig = window.GIVE_AND_TAKE_SUPABASE ?? {};
    return normaliseUrl(
      staticConfig.authRedirectUrl ??
        staticConfig.siteUrl ??
        staticConfig.appUrl ??
        staticConfig.publicSiteBaseUrl ??
        PRODUCTION_APP_URL
    );
  }

  function backendNotice(mode = model.authTab) {
    if (mode === "signup") {
      return "Create an account for repeat hosting. Email confirmations return to the live GitHub Pages app.";
    }
    if (mode === "guest") {
      return "Host a table without an account, then share the GT code with players.";
    }
    if (mode === "join") {
      return "Enter the GT code from the host to join as a player.";
    }
    return "Login to host or continue a saved table on the live QR app.";
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
      setSaveState("synced");
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.client = null;
      model.backend.unavailableReason = error.message ?? "Session server unavailable.";
      setSaveState("local", model.backend.unavailableReason);
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
      setSaveState("synced");
      return true;
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.client = null;
      model.backend.unavailableReason = error.message ?? "Online table service could not load.";
      setSaveState("local", model.backend.unavailableReason);
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
      setSaveState("local");
      return;
    }
    if (model.backend.saving) {
      model.backend.needsSave = true;
      return;
    }
    setSaveState("saving");
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
      setSaveState("synced");
    } catch (error) {
      model.backend.online = false;
      model.backend.provider = "local";
      model.backend.label = "Local browser";
      model.backend.unavailableReason = error.message ?? "Session server unavailable.";
      setSaveState("failed", model.backend.unavailableReason);
      setMessage("Could not save online. The table is still saved in this browser.");
    } finally {
      model.backend.saving = false;
      if (model.backend.needsSave) {
        model.backend.needsSave = false;
        queueBackendSync();
      } else {
        render();
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
    const { data, error } = await withTimeout(
      model.backend.client.rpc("create_game_session_public", {
        p_code: model.session.code,
        p_client_id: getClientId(),
        p_display_name: model.auth?.name ?? "Host",
        p_session: model.session
      }),
      12000,
      "Live table save timed out."
    );
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
        const { data, error } = await withTimeout(
          model.backend.client.rpc("update_game_session_public", {
            p_session_id: model.backend.sessionId,
            p_client_id: getClientId(),
            p_session: model.session,
            p_revision: model.backend.revision
          }),
          12000,
          "Live table save timed out."
        );
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
      setSaveState("synced");
    } catch (error) {
      setSaveState("failed", error.message ?? "Online save failed.");
      setMessage("Could not save online. The table is still saved in this browser.");
    } finally {
      model.backend.saving = false;
      if (model.backend.needsSave) {
        model.backend.needsSave = false;
        queueBackendSync();
      } else {
        render();
      }
    }
  }

  async function pullSessionFromSupabase() {
    if (!model.backend.sessionId) {
      return;
    }
    try {
      const { data, error } = await withTimeout(
        model.backend.client.rpc("get_game_session_public", {
          p_session_id: model.backend.sessionId,
          p_client_id: getClientId()
        }),
        12000,
        "Live table refresh timed out."
      );
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
    const { data, error } = await withTimeout(
      model.backend.client.rpc("join_game_session_public", {
        p_code: code,
        p_client_id: getClientId(),
        p_display_name: model.auth?.name ?? "Player"
      }),
      12000,
      "Live table join timed out."
    );
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
      priceHistory: [
        {
          at: nowIso(),
          source: "setup",
          prices: Object.fromEntries(model.game.assets.map((asset) => [asset.id, asset.startIndex]))
        }
      ],
      marketHistory: [],
      manualAdjustments: [],
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
    merged.priceHistory = Array.isArray(session?.priceHistory) ? session.priceHistory : fresh.priceHistory;
    merged.marketHistory = Array.isArray(session?.marketHistory) ? session.marketHistory : [];
    merged.manualAdjustments = Array.isArray(session?.manualAdjustments) ? session.manualAdjustments : [];
    merged.activity = Array.isArray(session?.activity) ? session.activity : [];
    return merged;
  }

  function ensurePlayerShape(player) {
    return {
      id: player.id,
      name: player.name,
      profileId: player.profileId,
      profileTitle: player.profileTitle,
      tokenColor: player.tokenColor ?? playerTokens[Number(String(player.id ?? "P1").replace(/\D/g, "")) - 1] ?? playerTokens[0],
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
    const usedNames = new Set();
    for (let index = 0; index < count; index += 1) {
      const name = document.getElementById(`playerName${index}`)?.value.trim();
      const profileId = document.getElementById(`playerProfile${index}`)?.value;
      const profile = model.game.cards.starterProfiles.find((item) => item.id === profileId);
      if (!name) {
        setMessage(`Seat ${index + 1} needs a player name.`);
        render();
        return;
      }
      if (usedNames.has(name.toLowerCase())) {
        openDialog({
          type: "duplicate-names",
          title: "Duplicate names",
          body: "Two players have the same name. Use unique names before starting so the ledger and evidence export stay clear."
        });
        return;
      }
      usedNames.add(name.toLowerCase());
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
        tokenColor: playerTokens[index] ?? playerTokens[0],
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

  function beginFreshHostSession() {
    model.session = createSession();
    model.backend.sessionId = null;
    model.backend.revision = 0;
    model.backend.clientRole = "host";
    model.backend.lastSyncedJson = "";
    model.exportText = "";
    writeStore(STORAGE.backend, null);
    saveSession();
    startBackendPoller();
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
    model.session.priceHistory.unshift({
      at: nowIso(),
      source,
      eventId: event.id,
      appliedEffects,
      prices: { ...model.session.prices }
    });
    model.session.priceHistory = model.session.priceHistory.slice(0, 40);
    model.session.marketHistory.unshift({
      at: nowIso(),
      source,
      playerId: currentPlayer()?.id ?? null,
      playerName: currentPlayer()?.name ?? null,
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
      summary: exportSummary(),
      session: model.session,
      manualAdjustments: model.session.manualAdjustments,
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
          <p>Open the hosted app at <strong>${PRODUCTION_APP_URL}</strong>, or run <strong>npm run start:qr</strong> from the repository root for local testing.</p>
        </section>
      `;
  }

  function renderAuth() {
    appRoot.className = `auth-page theme-${model.ui.theme}`;
    appRoot.innerHTML = `
      <section class="auth-visual" aria-labelledby="entry-title">
        <div class="table-map">
          <img src="${BOARD_IMAGE_URL}" alt="Give And Take board with QR code" />
          <div class="map-badge">S00-S43</div>
        </div>
        <p class="kicker">Give And Take</p>
        <h1 id="entry-title">Open the QR table for the physical board game.</h1>
        <p>Host the table, join with a GT code, track fictional cash and prices, then export the session evidence.</p>
        <div class="auth-proof" aria-label="Game flow">
          <div class="proof-tile"><strong>D6</strong><span>Roll and move on the printed board.</span></div>
          <div class="proof-tile"><strong>GT</strong><span>Share one table code with players.</span></div>
          <div class="proof-tile"><strong>100</strong><span>Score value, diversification, risk, ethics, and reflection.</span></div>
        </div>
        <p class="privacy-line">Uses fictional cash and gameplay notes only. No real investment data.</p>
      </section>
      <section class="auth-card">
        <div class="auth-card-head">
          <div>
            <p class="eyeline">Table entry</p>
            <h2>${model.authTab === "join" ? "Join a table" : model.authTab === "signup" ? "Create account" : model.authTab === "login" ? "Login" : "Host a table"}</h2>
          </div>
          ${renderThemeToggle()}
        </div>
        <div class="auth-tabs" role="tablist" aria-label="Access mode">
          ${["guest", "join", "login", "signup"]
            .map(
              (tab) => `
                <button class="auth-tab" type="button" data-auth-tab="${tab}" aria-selected="${model.authTab === tab}">
                  ${tab === "signup" ? "Sign up" : tab === "login" ? "Login" : tab === "guest" ? "Host" : "Join"}
                </button>
              `
            )
            .join("")}
        </div>
        ${renderAuthPanel()}
      </section>
      ${renderToast()}
      ${renderDialog()}
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
          <p class="notice">${escapeHtml(backendNotice("signup"))}</p>
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
          <div class="entry-preview">
            <strong>Host flow</strong>
            <span>Create a GT code, set 2-5 players, then run turns from the Play table.</span>
          </div>
          <p class="notice">${escapeHtml(backendNotice("guest"))}</p>
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
          <div class="entry-preview">
            <strong>Where is the code?</strong>
            <span>The host shows a code like GT-4827 after creating the table.</span>
          </div>
          <p class="notice">${escapeHtml(backendNotice("join"))}</p>
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
        <p class="notice">${escapeHtml(backendNotice("login"))}</p>
        <button class="button" type="submit">Login</button>
      </form>
    `;
  }

  function renderThemeToggle() {
    const labels = { table: "Table", classroom: "Classroom", contrast: "Contrast" };
    return `
      <div class="theme-toggle" role="group" aria-label="Visual theme">
        ${["table", "classroom", "contrast"]
          .map(
            (theme) => `
              <button class="theme-button" type="button" data-action="set-theme" data-theme="${theme}" aria-pressed="${model.ui.theme === theme}">
                ${labels[theme]}
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderSessionStatus(status = sessionStatus()) {
    return `
      <section class="session-status status-${status.state}" aria-label="Session save status">
        <div>
          <span class="label">${escapeHtml(saveModeLabel())}</span>
          <strong>${escapeHtml(status.label)}</strong>
          <p>${escapeHtml(status.detail)}</p>
        </div>
        ${status.action}
      </section>
    `;
  }

  function renderDialog() {
    const dialog = model.ui.dialog;
    if (!dialog) {
      return "";
    }
    if (dialog.type === "choice") {
      return `
        <div class="dialog-backdrop" data-action="close-dialog">
          <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="choiceDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">Confirm choice</p>
            <h2 id="choiceDialogTitle">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.body)}</p>
            <div class="choice-confirm-grid">
              <span><strong>Risk</strong>${escapeHtml(dialog.risk)}</span>
              <span><strong>Ethics</strong>${escapeHtml(dialog.ethics)}</span>
              <span><strong>Movement</strong>${escapeHtml(dialog.movement)}</span>
            </div>
            <div class="btn-row">
              <button class="button-secondary" type="button" data-action="close-dialog">Review options</button>
              <button class="button" type="button" data-action="confirm-choice" data-choice-index="${dialog.choiceIndex}">Confirm choice</button>
            </div>
          </section>
        </div>
      `;
    }
    if (dialog.type === "adjust") {
      const player = model.session.players.find((item) => item.id === dialog.playerId);
      return `
        <div class="dialog-backdrop" data-action="close-dialog">
          <form class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="adjustDialogTitle" data-modal-form="adjust" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">Ledger correction</p>
            <h2 id="adjustDialogTitle">${escapeHtml(player?.name ?? "Player")} - ${escapeHtml(dialog.label)}</h2>
            <p>Manual edits are for corrections or physical fallback. They are recorded in the export log.</p>
            <input type="hidden" name="playerId" value="${escapeHtml(dialog.playerId)}" />
            <input type="hidden" name="field" value="${escapeHtml(dialog.field)}" />
            <div class="field">
              <label for="adjustAmount">Amount</label>
              <input class="input" id="adjustAmount" name="amount" type="number" step="${dialog.field === "cash" ? "1000" : "1"}" value="${dialog.field === "cash" ? "1000" : "1"}" required />
            </div>
            <div class="field">
              <label for="adjustDirection">Direction</label>
              <select class="select" id="adjustDirection" name="direction">
                <option value="1">Add</option>
                <option value="-1">Subtract</option>
              </select>
            </div>
            <div class="field">
              <label for="adjustReason">Reason</label>
              <textarea class="textarea" id="adjustReason" name="reason" required>Correction from physical board.</textarea>
            </div>
            <div class="btn-row">
              <button class="button-secondary" type="button" data-action="close-dialog">Cancel</button>
              <button class="button" type="submit">Apply and log</button>
            </div>
          </form>
        </div>
      `;
    }
    if (dialog.type === "confirm-action") {
      return `
        <div class="dialog-backdrop" data-action="close-dialog">
          <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">${escapeHtml(dialog.eyeline ?? "Confirm")}</p>
            <h2 id="confirmDialogTitle">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.body)}</p>
            <div class="btn-row">
              <button class="button-secondary" type="button" data-action="close-dialog">Cancel</button>
              <button class="button" type="button" data-action="${escapeHtml(dialog.confirmAction)}">${escapeHtml(dialog.confirmLabel ?? "Confirm")}</button>
            </div>
          </section>
        </div>
      `;
    }
    if (dialog.type === "board") {
      return `
        <div class="dialog-backdrop" data-action="close-dialog">
          <section class="dialog-card board-dialog" role="dialog" aria-modal="true" aria-labelledby="boardDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">${escapeHtml(dialog.eyeline)}</p>
            <h2 id="boardDialogTitle">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.body)}</p>
            <img src="${BOARD_IMAGE_URL}" alt="Give And Take board with QR code" />
            <div class="btn-row">
              <button class="button" type="button" data-action="close-dialog">Close</button>
            </div>
          </section>
        </div>
      `;
    }
    return `
      <div class="dialog-backdrop" data-action="close-dialog">
        <section class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="infoDialogTitle" data-dialog-card>
          <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
          <p class="eyeline">${escapeHtml(dialog.eyeline ?? "Notice")}</p>
          <h2 id="infoDialogTitle">${escapeHtml(dialog.title ?? "Give And Take")}</h2>
          <p>${escapeHtml(dialog.body ?? "")}</p>
          <div class="btn-row">
            <button class="button" type="button" data-action="close-dialog">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderApp() {
    const player = currentPlayer();
    const status = sessionStatus();
    appRoot.className = `app-shell theme-${model.ui.theme}`;
    appRoot.innerHTML = `
      <aside class="rail">
        <div class="brand-mark">
          <div class="brand-token">GT</div>
          <div>
            <p class="brand-title">Give And Take</p>
            <p class="brand-subtitle">QR table companion</p>
          </div>
        </div>
        <div class="rail-status">
          <span class="label">Table</span>
          <strong>${escapeHtml(model.session.code)}</strong>
          <span>${escapeHtml(model.session.phase)} - ${escapeHtml(player?.name ?? "setup")}</span>
        </div>
        <nav class="nav-list" aria-label="Game sections">
          ${navItems
            .map(
              ([view, label, icon]) => `
                <button class="nav-button" type="button" data-view="${view}" aria-current="${model.session.view === view ? "page" : "false"}">
                  <span class="nav-icon" aria-hidden="true">${icon}</span>
                  <span>${label}</span>
                  <span>${view === "play" && model.session.pendingResolution ? "Live" : ""}</span>
                </button>
              `
            )
            .join("")}
        </nav>
        <div class="rail-footer">
          ${renderSessionStatus(status)}
          <button class="mini-button" type="button" data-action="copy-session-code">Copy code</button>
          ${renderThemeToggle()}
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
            <span class="status-pill status-${status.state}">${escapeHtml(status.label)} <strong>${escapeHtml(status.state === "saving" ? "now" : status.state === "synced" ? relativeTime(model.backend.lastSavedAt) : saveModeLabel())}</strong></span>
          </div>
        </header>
        <section class="content">
          ${renderCurrentView()}
        </section>
      </main>
      <nav class="mobile-nav" aria-label="Mobile game sections">
        ${navItems
          .slice(0, 5)
          .map(
            ([view, label, icon]) => `
              <button class="mobile-nav-button" type="button" data-view="${view}" aria-current="${model.session.view === view ? "page" : "false"}">
                <span>${icon}</span>
                <strong>${label}</strong>
              </button>
            `
          )
          .join("")}
      </nav>
      ${renderToast()}
      ${renderDialog()}
    `;
  }

  function sectionTitle(view) {
    return {
      setup: "Session Setup",
      play: "Play Table",
      market: "Market Tracker",
      players: "Player Ledger",
      scoring: scoreStateLabel(),
      export: "Evidence Export",
      rules: "Help Center"
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
    const readyCount = Number(draft.playerCount);
    return `
      <div class="setup-layout">
        <section class="panel setup-session-panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Table setup</p>
              <h2>Prepare the host table</h2>
              <p>Choose 2-5 players, assign unique Starter Profiles, then start the one-D6 route.</p>
            </div>
            <button class="button-ghost" type="button" data-action="new-session">New session</button>
          </div>
          ${hostOnlyNotice()}
          <div class="session-code-card">
            <div>
              <span class="label">GT code</span>
              <strong>${escapeHtml(model.session.code)}</strong>
            </div>
            <div>
              <span class="label">Mode</span>
              <strong>${escapeHtml(saveModeLabel())}</strong>
            </div>
            <button class="button-secondary" type="button" data-action="copy-session-code">Copy code</button>
          </div>
          ${renderSessionStatus()}
          <div class="setup-actions">
            <div class="field">
              <label for="playerCount">Number of players</label>
              <select class="select" id="playerCount" data-draft="count" ${hostDisabledAttr(model.session.started)}>
                ${[2, 3, 4, 5].map((count) => `<option value="${count}" ${Number(draft.playerCount) === count ? "selected" : ""}>${count} players</option>`).join("")}
              </select>
            </div>
            <button class="button" type="button" data-action="start-session" ${hostDisabledAttr(model.session.started)}>Start game: ${readyCount} players ready</button>
            <button class="button-secondary" type="button" data-view="play" ${model.session.started ? "" : "disabled"}>Open play table</button>
          </div>
        </section>

        <section class="panel player-setup-panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Players</p>
              <h2>Starter Profile seats</h2>
              <p>Profile cash and bonuses apply automatically when the game starts.</p>
            </div>
          </div>
          <div class="setup-card-grid">
            ${Array.from({ length: Number(draft.playerCount) }, (_, index) => renderSetupRow(index)).join("")}
          </div>
        </section>

        <section class="panel board-reference">
          <div class="panel-header">
            <div>
              <p class="eyeline">Physical board reference</p>
              <h2>Board and QR check</h2>
              <p>The web app tracks the session; the physical board remains playable.</p>
            </div>
            <button class="mini-button" type="button" data-action="expand-board">Expand</button>
          </div>
          <figure>
            <img src="${BOARD_IMAGE_URL}" alt="Give And Take physical game board" />
            <figcaption>Use this as the visual reference while the website tracks the playable state.</figcaption>
          </figure>
          <div class="checklist">
            ${[
              "Shuffle Investment, Market/Life, Ethics, Action, and Reflection decks.",
              "Put pawns on S00 Student Start.",
              "Keep the D6 and price tracker near the host.",
              "Share the GT code with players.",
              "Confirm player boards and pencils are ready."
            ]
              .map((item, index) => `<label><input type="checkbox" /> <span>${index + 1}. ${escapeHtml(item)}</span></label>`)
              .join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderSetupRow(index) {
    const starterProfiles = model.game.cards.starterProfiles;
    const draft = model.session.draft.players[index] ?? { name: `Player ${index + 1}`, profileId: starterProfiles[index]?.id };
    const profile = starterProfiles.find((item) => item.id === draft.profileId) ?? starterProfiles[index] ?? starterProfiles[0];
    const meta = profileUi(profile.id);
    return `
      <article class="setup-row setup-player-card">
        <header>
          <span class="player-token" style="--token:${cssVar(playerTokens[index] ?? playerTokens[0])}">P${index + 1}</span>
          <div>
            <p class="eyeline">${escapeHtml(meta.style)}</p>
            <h3>${escapeHtml(profile.title)}</h3>
          </div>
          <span class="profile-icon">${escapeHtml(meta.icon)}</span>
        </header>
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
        <div class="profile-summary">
          <span><strong>Cash</strong>${money(profile.cash)}</span>
          <span><strong>Trait</strong>${escapeHtml(profile.trait)}</span>
          <span><strong>Bonus</strong>${escapeHtml(profile.bonus)}</span>
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
      <section class="play-board">
        ${hostOnlyNotice()}
        ${renderPhaseStepper()}
        <div class="play-layout">
          <div class="play-primary">
            ${renderCurrentPlayerCard()}
            ${renderResolutionPanel()}
            ${renderTurnLogPanel()}
          </div>
          <aside class="play-side">
            ${renderPathTracker()}
            ${renderDecks()}
            ${renderPriceTracker()}
          </aside>
        </div>
      </section>
      ${renderLedger()}
    `;
  }

  function renderPhaseStepper() {
    const current = phaseIndex();
    return `
      <nav class="phase-stepper" aria-label="Turn phase tracker">
        ${phaseSteps
          .map((step, index) => {
            const done = index < current || model.session.gameOver;
            const active = index === current && !model.session.gameOver;
            return `
              <span class="phase-step ${done ? "done" : ""} ${active ? "active" : ""}">
                <span>${done ? "OK" : index + 1}</span>
                <strong>${step}</strong>
              </span>
            `;
          })
          .join("")}
      </nav>
    `;
  }

  function renderCurrentPlayerCard() {
    const player = currentPlayer();
    const canRoll = Boolean(player && !model.session.pendingResolution && !model.session.gameOver && !player.finished && player.turnsTaken < model.game.turnLimit);
    const space = getSpace(`S${String(player?.position ?? 0).padStart(2, "0")}`);
    return `
      <article class="current-player-card">
        <div class="panel-header">
          <div>
            <p class="eyeline">Current player</p>
            <h2>${escapeHtml(player?.name ?? "No player")}</h2>
            <p>${escapeHtml(player?.profileTitle ?? "Start setup first")} - ${escapeHtml(space?.id ?? "S00")} ${escapeHtml(space?.label ?? "Student Start")}</p>
          </div>
          <span class="player-token large" style="--token:${cssVar(player?.tokenColor ?? playerTokens[0])}">${escapeHtml(player?.id ?? "P")}</span>
        </div>
        <div class="metric-grid player-metrics">
          <div class="metric-tile"><span>Position</span><strong>S${String(player?.position ?? 0).padStart(2, "0")}</strong></div>
          <div class="metric-tile"><span>Cash</span><strong>${money(player?.cash ?? 0)}</strong></div>
          <div class="metric-tile"><span>Value</span><strong>${money(player ? portfolioValue(player) : 0)}</strong></div>
          <div class="metric-tile"><span>Evidence</span><strong>R${player?.riskEvidence ?? 0} E${player?.ethicsPosition ?? 0} F${player?.reflectionEvidence ?? 0}</strong></div>
        </div>
        <div class="dice-console">
          <div class="dice-mode" role="group" aria-label="Dice mode">
            <button class="mini-button" type="button" data-action="set-dice-mode" data-mode="digital" aria-pressed="${model.ui.diceMode === "digital"}">Digital dice</button>
            <button class="mini-button" type="button" data-action="set-dice-mode" data-mode="physical" aria-pressed="${model.ui.diceMode === "physical"}">Physical dice</button>
          </div>
          ${
            model.ui.diceMode === "physical"
              ? `
                <div class="physical-roll">
                  <label for="physicalDie">Enter D6 result</label>
                  <input class="input die-input" id="physicalDie" type="number" min="1" max="6" value="${model.session.die ?? 1}" ${hostDisabledAttr(!canRoll)} />
                  <button class="button" type="button" data-action="submit-physical-roll" ${hostDisabledAttr(!canRoll)}>Move pawn</button>
                </div>
                <div class="quick-rolls" aria-label="Quick physical die entries">
                  ${[1, 2, 3, 4, 5, 6].map((roll) => `<button class="mini-button" type="button" data-action="manual-roll" data-roll="${roll}" ${hostDisabledAttr(!canRoll)}>${roll}</button>`).join("")}
                </div>
              `
              : `<button class="die-button" type="button" data-action="roll-die" aria-label="Roll digital six-sided die. Current result ${model.session.die ?? "none"}" ${hostDisabledAttr(!canRoll)}>${model.session.die ?? "D6"}</button>`
          }
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
          <button class="mini-button" type="button" data-action="expand-board">Board image</button>
        </div>
        <div class="path-track" aria-label="Board position tracker">
          ${model.game.boardSpaces
            .map((space, index) => {
              const players = occupied.get(index) ?? [];
              const isActive = currentPlayer()?.position === index;
              const isFinish = index === 43;
              const meta = spaceMeta(space.type);
              return `
                <button class="path-dot ${isActive ? "active" : ""} ${isFinish ? "finished" : ""} tone-${meta.tone}" type="button" data-action="space-info" data-space-id="${space.id}" aria-label="${space.id} ${escapeHtml(space.label)}: ${escapeHtml(space.type)}">
                  <span class="path-id">${space.id}</span>
                  <span class="path-icon">${meta.icon}</span>
                  <span class="path-label">${escapeHtml(space.label)}</span>
                  <span class="pawn-markers">${players.map((playerId) => `<span class="pawn-marker" title="${playerId}"></span>`).join("")}</span>
                </button>
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
    const meta = spaceMeta(space.type);
    return `
      <article class="resolution-card ${pending.completed ? "completed" : ""} tone-${meta.tone}">
        <div class="resolver-head">
          <span class="space-badge tone-${meta.tone}">${escapeHtml(meta.icon)}</span>
          <div>
            <p class="eyeline">${escapeHtml(space.type)}</p>
            <h2>${escapeHtml(space.id)} ${escapeHtml(space.label)}</h2>
            <p>${escapeHtml(space.effect ?? meta.help)}</p>
          </div>
        </div>
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
              const asset = assetMeta(assetId);
              return `<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}" aria-label="${escapeHtml(asset.name)} changed ${signed(delta)}">${escapeHtml(asset.icon)} ${escapeHtml(asset.name)} ${signed(delta)}</span>`;
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
        <div class="choice-grid">
          ${(space.choices ?? ["Choice A", "Choice B"])
            .map((choice, index) => {
              const details = choiceDetails(space, choice, index);
              return `
                <button class="choice-card" type="button" data-action="request-choice" data-choice-index="${index}" ${hostDisabledAttr()}>
                  <span class="choice-title">${escapeHtml(details.title)}</span>
                  <span>${escapeHtml(details.consequence)}</span>
                  <span class="choice-meta">Risk: ${escapeHtml(details.risk)}</span>
                  <span class="choice-meta">Ethics: ${escapeHtml(details.ethics)}</span>
                  <span class="choice-meta">Movement: ${escapeHtml(details.movement)}</span>
                </button>
              `;
            })
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
    const suggested = pending ? evidenceNotes[pending.type] ?? "Recorded the turn result and reasoning." : "";
    return `
      <section class="turn-log-card">
        <div class="field">
          <label for="turnNote">Required decision, finance term, or evidence note</label>
          <p class="notice">Use a suggested note or write your own. The note is saved in the evidence export.</p>
          ${
            suggested
              ? `<div class="note-chip-row"><button class="note-chip" type="button" data-action="use-evidence-note" data-note="${escapeHtml(suggested)}" ${pending?.completed && canEditSession() ? "" : "disabled"}>${escapeHtml(suggested)}</button></div>`
              : ""
          }
          <textarea class="textarea" id="turnNote" ${pending?.completed && canEditSession() ? "" : "disabled"}></textarea>
        </div>
        <div class="sticky-turn-actions">
          <span>${pending?.completed ? "Ready to end turn." : "Resolve the space before ending the turn."}</span>
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
                <div class="deck-card tone-${meta.tone}">
                  <span class="deck-icon">${meta.icon}</span>
                  <strong>${meta.label}</strong>
                  <span class="table-label">Draw ${model.session.decks[deckKey].length} / Discard ${model.session.discards[deckKey].length}</span>
                  ${model.session.decks[deckKey].length <= 2 ? `<span class="deck-warning">Low deck</span>` : ""}
                </div>
              `
            )
            .join("")}
        </div>
      </article>
    `;
  }

  function renderPriceTracker() {
    const last = model.session.marketHistory[0];
    return `
      <article>
        <div class="section-head">
          <div>
            <p class="eyeline">Price tracker</p>
            <h2>Asset indexes</h2>
          </div>
        </div>
        <div class="asset-grid" role="list" aria-label="Asset price indexes">
          ${model.game.assets
            .map((asset) => {
              const meta = assetMeta(asset.id);
              const index = Number(model.session.prices[asset.id] ?? asset.startIndex);
              const start = Number(asset.startIndex ?? 1);
              const delta = index - start;
              const lastDelta = Number(last?.appliedEffects?.[asset.id] ?? 0);
              const width = clamp((index / Math.max(1, start + 12)) * 100, 7, 100);
              return `
                <div class="asset-row pattern-${meta.pattern}" role="listitem" style="--asset:${cssVar(asset.color)}">
                  <div class="asset-name"><span>${escapeHtml(meta.icon)}</span><strong>${escapeHtml(asset.name)}</strong><small>Risk ${asset.risk} - ${escapeHtml(meta.label)}</small></div>
                  <div class="bar" aria-label="${escapeHtml(asset.name)} current index ${index}, start ${start}, delta ${signed(delta)}, last change ${signed(lastDelta)}"><span style="width:${width}%"></span></div>
                  <div class="index">
                    <strong>${index}</strong>
                    <span>start ${start}</span>
                    <span>${signed(delta)} total</span>
                    <span>${signed(lastDelta)} last</span>
                  </div>
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
            const asset = assetMeta(assetId);
            return `<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}">${escapeHtml(asset.icon)} ${escapeHtml(asset.name)} x${units}</span>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderMarket() {
    return `
      <div class="market-layout">
        <section class="panel stack">
          ${hostOnlyNotice()}
          <div class="panel-header">
            <div>
              <p class="eyeline">Latest Market/Life card</p>
              <h2>${model.session.activeEvent ? escapeHtml(model.session.activeEvent.title) : "No event revealed yet"}</h2>
              <p>Market events appear after Market Pulse spaces or an intentional host reveal.</p>
            </div>
          </div>
          ${model.session.activeEvent ? renderEventCard(model.session.activeEvent) : `<div class="empty-state">The first Market/Life card will show here with sentiment, bias watch, and price effects.</div>`}
          ${renderPriceTracker()}
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Event history</p>
              <h2>Applied price changes</h2>
            </div>
            <button class="button-secondary" type="button" data-action="confirm-host-reveal" ${hostDisabledAttr(!model.session.started)}>Host reveal</button>
          </div>
          <p class="notice">Use host reveal only when a board space or host flow calls for a Market/Life card.</p>
          <div class="stack">
            ${
              model.session.marketHistory.length
                ? model.session.marketHistory.map(renderMarketHistoryRow).join("")
                : `<div class="empty-state">History starts after the first Market/Life card. Each entry records source, sentiment, bias, and applied deltas.</div>`
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
        <p>${escapeHtml(item.sentiment)} / ${escapeHtml(item.bias)} / ${escapeHtml(item.source)}${item.playerName ? ` / ${escapeHtml(item.playerName)}` : ""}</p>
        <div class="btn-row">
          ${Object.entries(item.priceEffects)
            .map(([assetId, delta]) => {
              const asset = assetMeta(assetId);
              return `<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}">${escapeHtml(asset.icon)} ${escapeHtml(asset.name)} <strong>${signed(delta)}</strong></span>`;
            })
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
      <section class="panel ledger-console">
        <div class="panel-header">
          <div>
            <p class="eyeline">Player ledger</p>
            <h2>Cash, holdings, and evidence</h2>
            <p>Manual edits are for correction or physical fallback only.</p>
          </div>
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="toggle-ledger-edit" aria-pressed="${model.ui.ledgerEditMode}" ${hostDisabledAttr()}>${model.ui.ledgerEditMode ? "Exit edit mode" : "Edit ledger"}</button>
            <button class="mini-button" type="button" data-action="undo-adjustment" ${hostDisabledAttr(!model.session.manualAdjustments.length)}>Undo latest</button>
          </div>
        </div>
        ${hostOnlyNotice()}
        ${model.ui.ledgerEditMode ? `<p class="notice warning">Correction mode is active. Every manual change needs a reason and is included in the export.</p>` : ""}
        <div class="player-grid">
          ${model.session.players.map(renderPlayerCard).join("")}
        </div>
      </section>
    `;
  }

  function renderPlayerCard(player) {
    const lastNote = player.decisions[0]?.note ?? "No turn note yet.";
    return `
      <article class="player-card">
        <header>
          <span class="player-token" style="--token:${cssVar(player.tokenColor ?? playerTokens[0])}">${escapeHtml(player.id)}</span>
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
        <div class="evidence-strip">
          <span>Risk <strong>${player.riskEvidence}</strong></span>
          <span>Ethics <strong>${player.ethicsPosition}</strong></span>
          <span>Reflection <strong>${player.reflectionEvidence}</strong></span>
        </div>
        <div class="stack compact">
          <div>${renderHoldings(player)}</div>
          <p class="latest-note">${escapeHtml(lastNote)}</p>
          ${
            model.ui.ledgerEditMode
              ? `
                <div class="adjust-grid">
                  <button class="mini-button" type="button" data-action="request-adjustment" data-player-id="${player.id}" data-field="cash" data-label="Cash">Cash correction</button>
                  <button class="mini-button" type="button" data-action="request-adjustment" data-player-id="${player.id}" data-field="riskEvidence" data-label="Risk evidence">Risk correction</button>
                  <button class="mini-button" type="button" data-action="request-adjustment" data-player-id="${player.id}" data-field="ethicsPosition" data-label="Ethics">Ethics correction</button>
                  <button class="mini-button" type="button" data-action="request-adjustment" data-player-id="${player.id}" data-field="reflectionEvidence" data-label="Reflection">Reflection correction</button>
                  ${Object.entries(player.holdings)
                    .filter(([, units]) => Number(units) > 0)
                    .map(([assetId]) => `<button class="mini-button" type="button" data-action="sell-holding" data-player-id="${player.id}" data-asset-id="${assetId}" ${hostDisabledAttr()}>Sell ${escapeHtml(getAsset(assetId).name)}</button>`)
                    .join("")}
                </div>
              `
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderScoring() {
    const scores = calculateScores();
    const final = scoreStateLabel() === "Final Review";
    return `
      <section class="panel stack">
        <div class="panel-header">
          <div>
            <p class="eyeline">${final ? "Final Review" : "Provisional"}</p>
            <h2>${escapeHtml(scoreStateLabel())}</h2>
            <p>${final ? "The game has met the scoring condition." : "These scores can still change before all players finish or reach the turn limit."}</p>
          </div>
          <button class="button" type="button" data-action="download-evidence">Export evidence</button>
        </div>
        <details class="rules-accordion" open>
          <summary>How the score is calculated</summary>
          <p>Portfolio 25, diversification 20, risk management 15, ethics 20, reflection 20. Portfolio is normalized against the highest player value.</p>
        </details>
        <div class="score-grid">
          ${scores
            .map(
              (score, index) => `
                <article class="score-row ${index === 0 ? "winner" : ""}">
                  <header>
                    <div>
                      <p class="eyeline">Rank ${index + 1}</p>
                      <h3>${escapeHtml(score.player.name)}</h3>
                      <p>${escapeHtml(scoreInsight(score))}</p>
                    </div>
                    <strong class="score-total">${score.total}<span>/100</span></strong>
                  </header>
                  ${renderScoreBars(score)}
                  <details>
                    <summary>Calculation details</summary>
                    <p>Value ${money(score.value)}. Cash ${money(score.player.cash)}. Categories ${uniqueHoldingCount(score.player)}. Risk evidence ${score.player.riskEvidence}. Ethics position ${score.player.ethicsPosition}. Reflection evidence ${score.player.reflectionEvidence}.</p>
                  </details>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderScoreBars(score) {
    const rows = [
      ["Portfolio", score.portfolioScore, Number(model.game.scoreWeights.portfolioValue ?? 25)],
      ["Diversify", score.diversificationScore, Number(model.game.scoreWeights.diversification ?? 20)],
      ["Risk", score.riskManagementScore, Number(model.game.scoreWeights.riskManagement ?? 15)],
      ["Ethics", score.ethicsScore, Number(model.game.scoreWeights.ethics ?? 20)],
      ["Reflect", score.reflectionScore, Number(model.game.scoreWeights.reflection ?? 20)]
    ];
    return `
      <div class="score-bars">
        ${rows
          .map(([label, value, max]) => {
            const width = clamp((value / max) * 100, 0, 100);
            return `<div class="score-bar"><span>${label}</span><div class="bar" aria-label="${label} ${value} out of ${max}"><span style="width:${width}%"></span></div><strong>${value}/${max}</strong></div>`;
          })
          .join("")}
      </div>
    `;
  }

  function scoreInsight(score) {
    const weak = [
      ["diversification", score.diversificationScore, 20],
      ["risk evidence", score.riskManagementScore, 15],
      ["ethics", score.ethicsScore, 20],
      ["reflection", score.reflectionScore, 20]
    ].sort((a, b) => a[1] / a[2] - b[1] / b[2])[0][0];
    if (score.portfolioScore >= 20 && weak !== "portfolio") {
      return `Strong portfolio score; improve ${weak} evidence.`;
    }
    if (uniqueHoldingCount(score.player) >= 3 && score.player.cash >= 20000) {
      return "Balanced liquidity and diversification.";
    }
    return `Main improvement area: ${weak}.`;
  }

  function renderExport() {
    const text = model.exportText || exportEvidence();
    const summary = exportSummary();
    return `
      <section class="panel stack">
        <div class="panel-header">
          <div>
            <p class="eyeline">Evidence</p>
            <h2>Session export</h2>
            <p>This export supports process evidence and debugging. Real student feedback and observations should still be recorded separately.</p>
          </div>
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="refresh-export">Refresh JSON</button>
            <button class="button-secondary" type="button" data-action="copy-export">Copy JSON</button>
            <button class="button" type="button" data-action="download-evidence">Download JSON</button>
          </div>
        </div>
        <div class="export-summary-grid">
          ${Object.entries(summary)
            .map(([key, value]) => `<div class="metric-tile"><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(value)}</strong></div>`)
            .join("")}
        </div>
        <div class="evidence-completeness">
          ${model.session.players
            .map(
              (player) => `
                <article>
                  <strong>${escapeHtml(player.name)}</strong>
                  <span>Notes ${player.decisions.length}</span>
                  <span>Risk ${player.riskEvidence}</span>
                  <span>Ethics ${player.ethicsPosition}</span>
                  <span>Reflection ${player.reflectionEvidence}</span>
                </article>
              `
            )
            .join("")}
        </div>
        <details class="rules-accordion">
          <summary>Raw JSON preview</summary>
          <pre class="export-box" id="evidenceOutput">${escapeHtml(text)}</pre>
        </details>
      </section>
    `;
  }

  function renderRules() {
    const rules = helpSections().filter((section) => {
      const query = model.ui.rulesQuery.trim().toLowerCase();
      if (!query) return true;
      return `${section.title} ${section.body}`.toLowerCase().includes(query);
    });
    return `
      <div class="grid two">
        <section class="panel stack">
          <div class="panel-header">
            <div>
              <p class="eyeline">Searchable rules</p>
              <h2>Help center</h2>
            </div>
          </div>
          <div class="field">
            <label for="rulesSearch">Search rules and glossary</label>
            <input class="input" id="rulesSearch" data-rules-search="true" value="${escapeHtml(model.ui.rulesQuery)}" autocomplete="off" />
          </div>
          ${rules.map((section) => `<details class="rules-accordion" open><summary>${escapeHtml(section.title)}</summary><p>${escapeHtml(section.body)}</p></details>`).join("")}
        </section>
        <section class="panel stack">
          <div class="panel-header">
            <div>
              <p class="eyeline">Legends</p>
              <h2>Assets and quick cards</h2>
            </div>
          </div>
          <div class="asset-legend">
            ${model.game.assets
              .map((asset) => {
                const meta = assetMeta(asset.id);
                return `<span class="asset-chip pattern-${meta.pattern}" style="--asset:${cssVar(asset.color)}">${escapeHtml(meta.icon)} ${escapeHtml(asset.name)} - risk ${asset.risk}</span>`;
              })
              .join("")}
          </div>
          ${model.game.cards.quickReference
            .map((card) => `<article class="card-face"><strong>${card.id} ${escapeHtml(card.title)}</strong><p>${escapeHtml(card.text)}</p></article>`)
            .join("")}
        </section>
      </div>
    `;
  }

  function helpSections() {
    return [
      { title: "Quick start", body: "Give each player one Starter Profile, Player Board, pawn, and starting cash. Shuffle each deck separately and keep the D6 near the host." },
      { title: "Turn flow", body: "Roll one D6, move on S00-S43, resolve the landing space, record one evidence note, then end the turn." },
      { title: "Movement", body: "If a roll passes S43, stop at S43. Choice advances do not resolve the new space until that player's next turn." },
      { title: "Deck lifecycle", body: "Draw, resolve, discard face-up. When a draw deck is empty, shuffle its discard pile into a new draw deck." },
      { title: "Market", body: "Market/Life cards update shared asset indexes. Asset price indexes cannot fall below 1." },
      { title: "Scoring", body: "Score when all players reach S43 or after 12 turns per player. Value 25, diversification 20, risk 15, ethics 20, reflection 20." },
      { title: "Evidence", body: "Each turn needs one decision, finance term, or evidence note. Suggested notes are allowed; custom notes are better when the decision needs context." },
      { title: "Volatility", body: "How much an asset price can move up or down. High volatility can raise gains and losses." },
      { title: "Diversification", body: "Holding multiple asset categories instead of relying on one category." },
      { title: "Liquidity", body: "How easily cash or an asset can cover expenses without forced selling." },
      { title: "Risk-return", body: "The trade-off between possible reward and possible loss." },
      { title: "FOMO", body: "Fear of missing out. In the game, it appears in hype-driven market choices." },
      { title: "ESG", body: "Environmental, social, and governance factors that can affect ethical and financial decisions." },
      { title: "Troubleshooting", body: "If live saving fails, keep playing on the host browser and retry from the status panel. The physical board and printed cards remain playable." }
    ];
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
        options: {
          data: { name },
          emailRedirectTo: authRedirectUrl()
        }
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
      beginFreshHostSession();
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
          beginFreshHostSession();
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
        beginFreshHostSession();
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

  function adjustPlayer(playerId, field, delta, reason = "Manual correction.") {
    const player = model.session.players.find((item) => item.id === playerId);
    if (!player) {
      return;
    }
    const before = Number(player[field] ?? 0);
    player[field] = before + Number(delta);
    if (["riskEvidence", "reflectionEvidence"].includes(field)) {
      player[field] = Math.max(0, player[field]);
    }
    if (field === "ethicsPosition") {
      player[field] = clamp(player[field], -5, 5);
    }
    const after = Number(player[field] ?? 0);
    const entry = {
      id: `adj-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: nowIso(),
      playerId: player.id,
      playerName: player.name,
      field,
      delta: after - before,
      before,
      after,
      reason
    };
    model.session.manualAdjustments.unshift(entry);
    model.session.manualAdjustments = model.session.manualAdjustments.slice(0, 50);
    player.decisions.unshift({
      at: entry.at,
      turn: player.turnsTaken,
      spaceId: `S${String(player.position).padStart(2, "0")}`,
      type: "Manual adjustment",
      result: `${field} changed by ${signed(entry.delta)}.`,
      note: reason
    });
    player.decisions = player.decisions.slice(0, 30);
    logActivity(`${player.name} correction: ${field} ${signed(entry.delta)}.`);
    saveSession();
    render();
  }

  function undoManualAdjustment() {
    const entry = model.session.manualAdjustments.shift();
    if (!entry) {
      setMessage("No manual correction to undo.");
      render();
      return;
    }
    const player = model.session.players.find((item) => item.id === entry.playerId);
    if (!player) {
      setMessage("Original player is missing; undo was not applied.");
      render();
      return;
    }
    player[entry.field] = entry.before;
    logActivity(`Undid correction for ${player.name}: ${entry.field}.`);
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
      case "close-dialog":
        closeDialog();
        break;
      case "set-theme":
        model.ui.theme = button.dataset.theme || "table";
        persistUi();
        render();
        break;
      case "set-dice-mode":
        model.ui.diceMode = button.dataset.mode || "digital";
        persistUi();
        render();
        break;
      case "retry-sync":
        if (!requireHostAction()) break;
        setSaveState("saving");
        probeBackend().then(syncSessionToBackend).finally(render);
        break;
      case "logout":
        if (model.backend.saveState === "saving" || model.backend.saveState === "failed") {
          openDialog({
            type: "confirm-action",
            title: "Leave this table?",
            body: "There may be unsynced changes. Leaving now keeps the local copy, but this browser will exit the table view.",
            confirmAction: "confirm-logout",
            confirmLabel: "Leave table"
          });
          break;
        }
        if (!window.confirm("Leave this table?")) {
          break;
        }
        // fall through
      case "confirm-logout":
        model.ui.dialog = null;
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
        if (!window.confirm("Create a new table? Current local table state will be replaced in this browser.")) {
          break;
        }
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
      case "submit-physical-roll": {
        if (!requireHostAction()) break;
        const value = Number(document.getElementById("physicalDie")?.value);
        if (!Number.isInteger(value) || value < 1 || value > 6) {
          setMessage("Enter a physical D6 result from 1 to 6.");
          render();
          break;
        }
        rollDie(value);
        break;
      }
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
      case "request-choice": {
        if (!requireHostAction()) break;
        const pending = model.session.pendingResolution;
        const space = pending ? getSpace(pending.spaceId) : null;
        const choiceIndex = Number(button.dataset.choiceIndex);
        const details = space ? choiceDetails(space, space.choices?.[choiceIndex], choiceIndex) : null;
        if (!space || !details) break;
        openDialog({
          type: "choice",
          title: details.title,
          body: details.confirm,
          choiceIndex,
          risk: details.risk,
          ethics: details.ethics,
          movement: details.movement
        });
        break;
      }
      case "confirm-choice":
        if (!requireHostAction()) break;
        applyChoice(Number(button.dataset.choiceIndex));
        closeDialog();
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
      case "use-evidence-note": {
        const note = button.dataset.note ?? "";
        const input = document.getElementById("turnNote");
        if (input) {
          input.value = note;
          input.focus();
        }
        break;
      }
      case "host-reveal-event":
        if (!requireHostAction()) break;
        model.ui.dialog = null;
        resolveMarketPulse("host");
        saveSession();
        render();
        break;
      case "confirm-host-reveal":
        if (!requireHostAction()) break;
        openDialog({
          type: "confirm-action",
          title: "Reveal a Market/Life card?",
          body: "Use this only when the board space or host flow calls for a Market/Life card. It will update prices immediately.",
          confirmAction: "host-reveal-event",
          confirmLabel: "Reveal card"
        });
        break;
      case "adjust-player":
        if (!requireHostAction()) break;
        adjustPlayer(button.dataset.playerId, button.dataset.field, button.dataset.delta);
        break;
      case "toggle-ledger-edit":
        if (!requireHostAction()) break;
        model.ui.ledgerEditMode = !model.ui.ledgerEditMode;
        render();
        break;
      case "request-adjustment":
        if (!requireHostAction()) break;
        openDialog({
          type: "adjust",
          playerId: button.dataset.playerId,
          field: button.dataset.field,
          label: button.dataset.label
        });
        break;
      case "undo-adjustment":
        if (!requireHostAction()) break;
        if (window.confirm("Undo the latest manual correction?")) {
          undoManualAdjustment();
        }
        break;
      case "sell-holding":
        if (!requireHostAction()) break;
        if (!model.ui.ledgerEditMode) {
          setMessage("Open ledger edit mode before selling from the ledger.");
          render();
          break;
        }
        sellHolding(button.dataset.playerId, button.dataset.assetId);
        saveSession();
        render();
        break;
      case "expand-board":
        openDialog({
          type: "board",
          eyeline: "Physical board reference",
          title: "Give And Take board",
          body: "Use the printed board for pawn movement. The QR app mirrors the S00-S43 route and session state."
        });
        break;
      case "space-info": {
        const space = getSpace(button.dataset.spaceId);
        const meta = spaceMeta(space?.type);
        openDialog({
          eyeline: space?.type ?? "Board space",
          title: `${space?.id ?? ""} ${space?.label ?? ""}`,
          body: `${meta.help} ${space?.effect ?? space?.choices?.join(" ") ?? ""}`.trim()
        });
        break;
      }
      case "refresh-export":
        exportEvidence();
        render();
        break;
      case "copy-export":
        navigator.clipboard?.writeText(exportEvidence()).then(
          () => setMessage("Export JSON copied."),
          () => setMessage("Copy failed. Use Download JSON instead.")
        );
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
    if (event.target.matches("[data-rules-search]")) {
      model.ui.rulesQuery = event.target.value;
      render();
      const search = document.getElementById("rulesSearch");
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    }
  }

  function handleSubmit(event) {
    const modalForm = event.target.closest("form[data-modal-form]");
    if (modalForm) {
      event.preventDefault();
      if (modalForm.dataset.modalForm === "adjust") {
        const data = new FormData(modalForm);
        const amount = Number(data.get("amount"));
        const direction = Number(data.get("direction"));
        const reason = String(data.get("reason") ?? "").trim();
        if (!Number.isFinite(amount) || amount <= 0 || !reason) {
          setMessage("Enter a positive amount and a correction reason.");
          render();
          return;
        }
        model.ui.dialog = null;
        adjustPlayer(data.get("playerId"), data.get("field"), amount * direction, reason);
      }
      return;
    }
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
