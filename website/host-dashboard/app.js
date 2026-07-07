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
    session: "give-and-take:table:v5",
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

  const commonEvidenceNotes = [
    "Updated the physical player board and explained the decision.",
    "Used the printed card and recorded the effect.",
    "Compared risk-return before acting.",
    "Checked diversification before choosing.",
    "Explained the ethical trade-off.",
    "Updated the price tracker and noted the market impact.",
    "Kept cash liquid to manage risk.",
    "Asked for clarification before committing."
  ];

  const physicalChecklistLabels = {
    pawnMoved: "Pawn moved on physical board",
    cardDiscarded: "Physical card placed in correct discard pile",
    playerBoardUpdated: "Cash/holdings updated on player board",
    evidenceNote: "Evidence note added",
    priceTrackerUpdated: "Price tracker updated if applicable"
  };

  const physicalModeLabels = {
    host: "Physical Play",
    table: "Table Display",
    player: "Player Assist"
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
      provider: "supabase",
      label: "Supabase",
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
      saveState: "connecting",
      lastSavedAt: null
    },
    ui: {
      theme: readStore(STORAGE.ui, {})?.theme ?? (window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "classroom" : "table"),
      diceMode: readStore(STORAGE.ui, {})?.diceMode ?? "physical",
      companionMode: readStore(STORAGE.ui, {})?.companionMode ?? "host",
      reducedMotion: Boolean(readStore(STORAGE.ui, {})?.reducedMotion ?? false),
      boardExpanded: false,
      boardZoom: Number(readStore(STORAGE.ui, {})?.boardZoom ?? 1),
      ledgerEditMode: false,
      rulesQuery: "",
      cardLookupId: "",
      boardLookupId: "",
      selectedBoardSpaceId: "S00",
      selectedAssistPlayerId: "",
      pendingPhysicalDie: null,
      setupChecklist: readStore(STORAGE.ui, {})?.setupChecklist ?? {},
      announcement: "",
      marketFilters: {
        sentiment: "all",
        asset: "all",
        bias: "all"
      },
      selectedMarketEventId: "",
      turnNoteDraft: "",
      undoRollSession: null,
      lastPhase: "",
      dialog: null
    },
    message: "",
    exportText: "",
    configError: null
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round = (value) => Math.round(value);
  const nowIso = () => new Date().toISOString();

  function readStore(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      setMessage("This device cannot retain interface preferences. Supabase saving still controls the table state.");
    }
  }

  function persistUi() {
    writeStore(STORAGE.ui, {
      theme: model.ui.theme,
      diceMode: model.ui.diceMode,
      boardZoom: model.ui.boardZoom,
      companionMode: model.ui.companionMode,
      reducedMotion: model.ui.reducedMotion,
      setupChecklist: model.ui.setupChecklist
    });
  }

  function setSaveState(state, detail = "") {
    model.backend.saveState = state;
    model.backend.unavailableReason = detail || model.backend.unavailableReason || "";
    if (state === "synced" || state === "connected") {
      model.backend.lastSavedAt = nowIso();
    }
  }

  function announce(message) {
    model.ui.announcement = String(message ?? "");
  }

  function physicalDieDraft() {
    return model.session?.pendingResolution?.die ?? model.ui.pendingPhysicalDie ?? "";
  }

  function setPhysicalDieDraft(value) {
    const die = Number(value);
    if (!Number.isInteger(die) || die < 1 || die > 6) {
      model.ui.pendingPhysicalDie = null;
      return false;
    }
    model.ui.pendingPhysicalDie = die;
    announce(`Physical die result ${die} selected. Confirm movement when the pawn has been moved.`);
    return true;
  }

  function clearPhysicalDieDraft() {
    model.ui.pendingPhysicalDie = null;
    announce("Physical die selection cleared.");
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
    return "Backend: Supabase";
  }

  function sessionStatus() {
    if (model.backend.saving || model.backend.saveState === "saving") {
      return { state: "saving", label: "Saving to Supabase", detail: "Writing the latest table state to Supabase.", action: "" };
    }
    if (model.backend.saveState === "failed") {
      return {
        state: "failed",
        label: "Supabase error",
        detail: model.backend.unavailableReason || "Supabase did not accept the latest table state.",
        action: `<button class="mini-button" type="button" data-action="retry-sync">Retry</button>`
      };
    }
    if (model.backend.online && model.backend.saveState === "synced") {
      return { state: "synced", label: "Saved to Supabase", detail: `Last saved to Supabase ${relativeTime(model.backend.lastSavedAt)}.`, action: "" };
    }
    if (model.backend.online) {
      return { state: "connected", label: "Saved to Supabase", detail: "Connected to Supabase.", action: "" };
    }
    return {
      state: "failed",
      label: "Supabase error",
      detail: model.backend.unavailableReason || "Connect to Supabase before hosting or joining a table.",
      action: `<button class="mini-button" type="button" data-action="retry-sync">Retry</button>`
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

  function boardSpaceBoxes() {
    const boxes = [["S00", 24, 24, 282, 332]];
    let x = 304;
    let y = 38;
    let w = 214;
    let h = 286;
    let gap = 8;
    for (let index = 1; index <= 12; index += 1) {
      boxes.push([`S${String(index).padStart(2, "0")}`, x + (index - 1) * (w + gap), y, x + (index - 1) * (w + gap) + w, y + h]);
    }
    x = 2716;
    y = 354;
    w = 252;
    h = 235;
    gap = 14;
    for (let index = 13; index <= 21; index += 1) {
      const offset = index - 13;
      boxes.push([`S${String(index).padStart(2, "0")}`, x, y + offset * (h + gap), x + w, y + offset * (h + gap) + h]);
    }
    x = 2686;
    y = 2708;
    w = 190;
    h = 252;
    gap = 8;
    for (let index = 22; index <= 34; index += 1) {
      const offset = index - 22;
      const xx = x - offset * (w + gap);
      boxes.push([`S${String(index).padStart(2, "0")}`, xx, y, xx + w, y + h]);
    }
    x = 42;
    y = 2680;
    w = 232;
    h = 280;
    gap = 20;
    for (let index = 35; index <= 42; index += 1) {
      const offset = index - 35;
      boxes.push([`S${String(index).padStart(2, "0")}`, x, y - offset * (h + gap), x + w, y - offset * (h + gap) + h]);
    }
    boxes.push(["S43", 42, 338, 274, 532]);
    return boxes;
  }

  function boardBoxStyle(box) {
    const [, x1, y1, x2, y2] = box;
    return `left:${(x1 / 3000) * 100}%;top:${(y1 / 3000) * 100}%;width:${((x2 - x1) / 3000) * 100}%;height:${((y2 - y1) / 3000) * 100}%;`;
  }

  function boardSpaceDescription(space) {
    const meta = spaceMeta(space?.type);
    const details = [meta.help, space?.effect, ...(space?.choices ?? [])].filter(Boolean).join(" ");
    return `${space?.id ?? ""} ${space?.label ?? ""}: ${space?.type ?? "Board space"}. ${details}`.trim();
  }

  function deckKeyForCardId(cardId) {
    const prefix = String(cardId ?? "").trim().toUpperCase()[0];
    return {
      I: "investments",
      M: "events",
      E: "ethics",
      A: "actions",
      R: "reflection"
    }[prefix] ?? "";
  }

  function deckKeyForSpace(space) {
    if (!space) return "";
    return {
      Invest: "investments",
      "Market Pulse": "events",
      "Ethics Crossroad": "ethics",
      "Research/Action": "actions",
      Reflection: "reflection"
    }[space.type] ?? "";
  }

  function normaliseCardId(value) {
    const raw = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const match = raw.match(/^([IMEAR])0*([0-9]{1,2})$/);
    return match ? `${match[1]}${String(Number(match[2])).padStart(2, "0")}` : raw;
  }

  function normaliseSpaceId(value) {
    const raw = String(value ?? "").trim().toUpperCase().replace(/[^S0-9]/g, "");
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) return raw;
    return `S${String(clamp(Number(digits), 0, 43)).padStart(2, "0")}`;
  }

  function findCardByPrintedId(value) {
    const id = normaliseCardId(value);
    const deckKey = deckKeyForCardId(id);
    if (!deckKey) return null;
    const card = getCard(deckKey, id);
    return card ? { deckKey, card } : null;
  }

  function deckLabel(deckKey) {
    return deckMeta[deckKey]?.label ?? "Card";
  }

  function discardInstruction(deckKey, cardId = "") {
    if (!deckKey || !cardId) {
      return "No printed card is attached to this turn.";
    }
    return `After resolving ${cardId}, place it face-up in the ${deckLabel(deckKey)} discard pile.`;
  }

  function spaceRequiredDeck(space) {
    const deckKey = deckKeyForSpace(space);
    return deckKey ? `${deckLabel(deckKey)} deck` : "No deck required";
  }

  function physicalActionForSpace(space) {
    if (!space) return "Check the printed board and ask the host for the correct action.";
    if (space.cash) {
      return `${space.cash > 0 ? "Add" : "Pay"} ${money(Math.abs(space.cash))} on the player board.`;
    }
    const actions = {
      Start: "Confirm the pawn is on S00 and the player has their Starter Profile cash.",
      Invest: "Draw one Investment card from the physical deck, enter its ID, then buy or pass.",
      "Market Pulse": "Draw one Market/Life card from the physical deck, enter its ID, update the price tracker, then discard it.",
      "Research/Action": "Draw one Action card from the physical deck, enter its ID, apply it, then discard it.",
      "Ethics Crossroad": "Draw one Ethics card from the physical deck, enter its ID, choose profit or responsible, then discard it.",
      Reflection: "Draw one Reflection card from the physical deck, enter its ID, discuss the prompt, score evidence, then discard it.",
      Choice: "Read the two printed choices aloud and confirm the chosen option before recording it.",
      Rebalance: "Update the physical player board after selling or adjusting holdings.",
      Finish: "Move the pawn to Finish Review and wait for final scoring."
    };
    return actions[space.type] ?? "Resolve the printed instruction on the board.";
  }

  function spaceInstruction(space) {
    const meta = spaceMeta(space?.type);
    return [
      `${space?.id ?? ""} ${space?.label ?? ""}`,
      `${space?.type ?? "Board space"}: ${meta.help}`,
      space?.effect,
      ...(space?.choices ?? []),
      `Required deck: ${spaceRequiredDeck(space)}.`,
      `Physical action: ${physicalActionForSpace(space)}`
    ]
      .filter(Boolean)
      .join(" ");
  }

  function priceEffectText(priceEffects = {}) {
    const entries = Object.entries(priceEffects);
    if (!entries.length) return "No price change.";
    return entries.map(([assetId, delta]) => `${getAsset(assetId).name} ${signed(delta)}`).join(", ");
  }

  function cardExplanation(deckKey, card) {
    if (!card) return "No printed card selected.";
    if (deckKey === "events") {
      return `${card.id} ${card.title}. Market/Life card. Sentiment ${card.sentiment}. Bias watch ${card.bias}. Price effects: ${priceEffectText(card.priceEffects)}. ${discardInstruction(deckKey, card.id)}`;
    }
    if (deckKey === "investments") {
      const asset = getAsset(card.asset);
      return `${card.id} ${card.title}. Investment card. ${card.text} Asset ${asset.name}. Units ${card.units}. Printed cost index ${card.costIndex}. ${discardInstruction(deckKey, card.id)}`;
    }
    if (deckKey === "ethics") {
      return `${card.id} ${card.title}. Ethics card. ${card.prompt} Profit option: ${money(card.profit?.cash ?? 0)}, ethics ${signed(card.profit?.ethics ?? 0)}. Responsible option: ${money(card.responsible?.cash ?? 0)}, ethics ${signed(card.responsible?.ethics ?? 0)}. ${discardInstruction(deckKey, card.id)}`;
    }
    if (deckKey === "actions") {
      return `${card.id} ${card.title}. Action card. ${card.text} ${discardInstruction(deckKey, card.id)}`;
    }
    if (deckKey === "reflection") {
      return `${card.id} ${card.title}. Reflection card. ${card.prompt} Score the explanation evidence from 0 to 10. ${discardInstruction(deckKey, card.id)}`;
    }
    return `${card.id} ${card.title}. ${discardInstruction(deckKey, card.id)}`;
  }

  function cardSummaryLines(deckKey, card) {
    if (!card) return [];
    if (deckKey === "events") {
      return [
        ["Card type", "Market/Life"],
        ["Sentiment", card.sentiment],
        ["Bias watch", card.bias],
        ["Price effects", priceEffectText(card.priceEffects)]
      ];
    }
    if (deckKey === "investments") {
      return [
        ["Card type", "Investment"],
        ["Asset", getAsset(card.asset).name],
        ["Units", card.units],
        ["Cost", money(Number(card.costIndex ?? 0) * 1000)]
      ];
    }
    if (deckKey === "ethics") {
      return [
        ["Card type", "Ethics"],
        ["Profit option", `${money(card.profit?.cash ?? 0)}, ethics ${signed(card.profit?.ethics ?? 0)}`],
        ["Responsible option", `${money(card.responsible?.cash ?? 0)}, ethics ${signed(card.responsible?.ethics ?? 0)}`]
      ];
    }
    if (deckKey === "actions") {
      return [
        ["Card type", "Action"],
        ["Action type", card.type],
        ["Effect", card.text]
      ];
    }
    if (deckKey === "reflection") {
      return [
        ["Card type", "Reflection"],
        ["Prompt", card.prompt],
        ["Evidence", "Score 0-10"]
      ];
    }
    return [["Card type", deckLabel(deckKey)]];
  }

  function defaultPhysicalChecks() {
    return {
      pawnMoved: false,
      cardDiscarded: false,
      playerBoardUpdated: false,
      evidenceNote: false,
      priceTrackerUpdated: false
    };
  }

  function resetPhysicalChecks() {
    model.session.physicalChecks = defaultPhysicalChecks();
  }

  function requiredPhysicalChecks(pending = model.session.pendingResolution) {
    const required = ["pawnMoved", "playerBoardUpdated", "evidenceNote"];
    if (pending?.cardId) required.push("cardDiscarded");
    if (pending?.cardDeck === "events") required.push("priceTrackerUpdated");
    return required;
  }

  function missingPhysicalChecks() {
    const checks = model.session.physicalChecks ?? defaultPhysicalChecks();
    return requiredPhysicalChecks().filter((key) => !checks[key]);
  }

  function effectiveCompanionMode() {
    if (model.backend.clientRole === "player") {
      return "player";
    }
    return model.ui.companionMode || "host";
  }

  function assistPlayer() {
    const bySelection = model.session.players.find((player) => player.id === model.ui.selectedAssistPlayerId);
    if (bySelection) return bySelection;
    const authName = String(model.auth?.name ?? "").trim().toLowerCase();
    const byName = model.session.players.find((player) => player.name.trim().toLowerCase() === authName);
    return byName ?? currentPlayer() ?? model.session.players[0] ?? null;
  }

  function speak(text) {
    const message = String(text ?? "").trim();
    if (!message || !("speechSynthesis" in window)) {
      setMessage("Read-aloud is not available in this browser.");
      render();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
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
      return "Create an account when you want repeat hosting and access to past Supabase tables.";
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
    } catch (error) {
      model.backend.unavailableReason = error.message ?? "Supabase configuration could not be loaded.";
    }
    model.backend.online = false;
    model.backend.provider = "supabase";
    model.backend.label = "Supabase";
    model.backend.client = null;
    setSaveState("failed", model.backend.unavailableReason || "Supabase configuration is missing.");
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
      model.backend.provider = "supabase";
      model.backend.label = "Supabase";
      model.backend.client = null;
      model.backend.unavailableReason = error.message ?? "Supabase client could not load.";
      setSaveState("failed", model.backend.unavailableReason);
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
      setSaveState("failed", "Supabase connection is required before saving this table.");
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
      if (!model.backend.online) {
        setSaveState("failed", "Supabase connection is required before saving this table.");
      }
      return;
    }
    await syncSessionToSupabase();
  }

  async function pullSessionFromBackend() {
    if (!model.backend.online || !model.auth || !model.session || model.backend.saving) {
      return;
    }
    if (model.backend.clientRole === "host") {
      return;
    }
    await pullSessionFromSupabase();
  }

  async function loadBackendSession(code) {
    return loadSupabaseSession(code);
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
      setMessage("Supabase save failed. Retry before continuing important table actions.");
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
    } catch (error) {
      setSaveState("failed", error.message ?? "Supabase refresh failed.");
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

  function cloneSession(session) {
    if (typeof structuredClone === "function") {
      return structuredClone(session);
    }
    return JSON.parse(JSON.stringify(session));
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
            dashboardRole: "Legacy event tracker mode."
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
      physicalChecks: defaultPhysicalChecks(),
      lastPhysicalCard: null,
      lastPhysicalMove: null,
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
    merged.physicalChecks = { ...defaultPhysicalChecks(), ...(session?.physicalChecks ?? {}) };
    merged.lastPhysicalCard = session?.lastPhysicalCard ?? null;
    merged.lastPhysicalMove = session?.lastPhysicalMove ?? null;
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
    if (cardId && !model.session.discards[deckKey].includes(cardId)) {
      model.session.discards[deckKey].push(cardId);
    }
  }

  function nextSyncedCardId(deckKey) {
    if (!model.session.decks[deckKey]?.length && model.session.discards[deckKey]?.length) {
      model.session.decks[deckKey] = shuffled(model.session.discards[deckKey]);
      model.session.discards[deckKey] = [];
    }
    return model.session.decks[deckKey]?.[0] ?? null;
  }

  function takePrintedCard(deckKey, cardId) {
    const warnings = [];
    const nextId = nextSyncedCardId(deckKey);
    const deck = model.session.decks[deckKey] ?? [];
    const discard = model.session.discards[deckKey] ?? [];
    if (nextId && nextId !== cardId) {
      warnings.push(`App deck expected ${nextId}; physical card entered was ${cardId}. Check whether the physical deck was shuffled or a card was missed.`);
    }
    const deckIndex = deck.indexOf(cardId);
    if (deckIndex >= 0) {
      deck.splice(deckIndex, 1);
      return warnings;
    }
    const discardIndex = discard.indexOf(cardId);
    if (discardIndex >= 0) {
      discard.splice(discardIndex, 1);
      warnings.push(`${cardId} was already in the app discard pile. The host should check the physical discard pile.`);
      return warnings;
    }
    warnings.push(`${cardId} was not found in the app draw or discard state. Continuing with the printed card ID, but the deck state needs host attention.`);
    return warnings;
  }

  function useSyncedCardForPending() {
    const pending = model.session.pendingResolution;
    if (!pending?.cardDeck) {
      setMessage("The current space does not need a printed card.");
      render();
      return;
    }
    const cardId = nextSyncedCardId(pending.cardDeck);
    if (!cardId) {
      setMessage(`${deckLabel(pending.cardDeck)} deck has no app-synced card available.`);
      render();
      return;
    }
    applyPrintedCardId(cardId);
  }

  function applyPrintedCardId(rawId) {
    const lookup = findCardByPrintedId(rawId);
    if (!lookup) {
      setMessage(`No printed card found for ${normaliseCardId(rawId)}.`);
      render();
      return;
    }
    const pending = model.session.pendingResolution;
    const { deckKey, card } = lookup;
    if (!pending) {
      openCardLookupDialog(deckKey, card, []);
      return;
    }
    const warnings = [];
    if (pending?.cardDeck && pending.cardDeck !== deckKey) {
      warnings.push(`Current space expects ${deckLabel(pending.cardDeck)}, but ${card.id} is a ${deckLabel(deckKey)} card.`);
    }
    warnings.push(...takePrintedCard(deckKey, card.id));
    model.session.lastPhysicalCard = {
      at: nowIso(),
      deckKey,
      cardId: card.id,
      title: card.title,
      warnings
    };
    pending.cardDeck = deckKey;
    pending.cardId = card.id;
    pending.deckConflict = warnings.join(" ");
    if (deckKey === "events") {
      const before = { ...model.session.prices };
      const applied = applyMarketEvent(card, "physical-card");
      pending.priceBefore = before;
      pending.priceAfter = { ...model.session.prices };
      pending.appliedEffects = applied.appliedEffects;
      discardCard(deckKey, card.id);
      pending.result.push(`${card.id} ${card.title} applied from the printed Market/Life deck. Price floor of 1 enforced.`);
      completeResolution();
    }
    saveSession();
    render();
  }

  function openCardLookupDialog(deckKey, card, warnings = []) {
    openDialog({
      type: "card-lookup",
      deckKey,
      cardId: card.id,
      title: card.title,
      warnings
    });
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
    clearPhysicalDieDraft();
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

    model.ui.undoRollSession = cloneSession(session);
    const fromPosition = player.position;
    const die = value ?? Math.floor(1 + Math.random() * 6);
    clearPhysicalDieDraft();
    const nextPosition = Math.min(43, fromPosition + die);
    player.position = nextPosition;
    player.finished = nextPosition >= 43;
    session.die = die;
    session.phase = "Resolve";
    resetPhysicalChecks();
    model.session.lastPhysicalMove = {
      playerId: player.id,
      fromSpaceId: `S${String(fromPosition).padStart(2, "0")}`,
      die,
      expectedSpaceId: `S${String(nextPosition).padStart(2, "0")}`,
      confirmed: false
    };
    beginResolution(player, getSpace(`S${String(nextPosition).padStart(2, "0")}`), die, fromPosition);
    saveSession();
    render();
  }

  function beginResolution(player, space, die, fromPosition = player.position) {
    const pending = {
      playerId: player.id,
      fromSpaceId: `S${String(fromPosition).padStart(2, "0")}`,
      spaceId: space.id,
      die,
      type: space.type,
      completed: false,
      cardDeck: null,
      cardId: null,
      expectedCardId: null,
      deckConflict: "",
      physicalPawnConfirmed: false,
      cashBefore: null,
      cashAfter: null,
      priceBefore: null,
      priceAfter: null,
      appliedEffects: null,
      result: []
    };
    model.session.pendingResolution = pending;

    if (space.cash) {
      pending.cashBefore = player.cash;
      player.cash += Number(space.cash);
      pending.cashAfter = player.cash;
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
        pending.cardDeck = "events";
        pending.expectedCardId = model.session.decks.events[0] ?? null;
        break;
      case "Invest":
        pending.cardDeck = "investments";
        pending.expectedCardId = model.session.decks.investments[0] ?? null;
        if (!pending.expectedCardId && !model.session.discards.investments.length) {
          pending.result.push("Investment deck is empty. Player may pass and keep cash.");
          completeResolution();
        }
        break;
      case "Ethics Crossroad":
        pending.cardDeck = "ethics";
        pending.expectedCardId = model.session.decks.ethics[0] ?? null;
        if (!pending.expectedCardId && !model.session.discards.ethics.length) {
          pending.result.push("Ethics deck is empty. Gain +1 ethics for discussing the printed space instruction.");
          player.ethicsPosition += 1;
          completeResolution();
        }
        break;
      case "Research/Action":
        pending.cardDeck = "actions";
        pending.expectedCardId = model.session.decks.actions[0] ?? null;
        if (!pending.expectedCardId && !model.session.discards.actions.length) {
          player.riskEvidence += 1;
          pending.result.push("Action deck is empty. Printed space instruction applied: +1 risk-management evidence.");
          completeResolution();
        }
        break;
      case "Reflection":
        pending.cardDeck = "reflection";
        pending.expectedCardId = model.session.decks.reflection[0] ?? null;
        if (!pending.expectedCardId && !model.session.discards.reflection.length) {
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
    model.ui.undoRollSession = null;
    model.session.phase = "Log";
    if (!pending.cardId) {
      model.session.physicalChecks.cardDiscarded = true;
    }
    if (pending.cardDeck !== "events") {
      model.session.physicalChecks.priceTrackerUpdated = true;
    }
  }

  function cancelRoll() {
    if (!model.ui.undoRollSession || !model.session.pendingResolution || model.session.pendingResolution.completed) {
      setMessage("There is no unresolved roll to undo.");
      render();
      return;
    }
    model.session = ensureSessionShape(model.ui.undoRollSession);
    model.ui.undoRollSession = null;
    clearPhysicalDieDraft();
    model.ui.turnNoteDraft = "";
    setMessage("Roll cancelled. Pawn and deck state restored.");
    saveSession();
    render();
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
    const applied = applyMarketEvent(event, source);
    discardCard("events", event.id);
    if (pending) {
      pending.cardDeck = "events";
      pending.cardId = event.id;
      pending.priceBefore = applied.beforePrices;
      pending.priceAfter = applied.afterPrices;
      pending.appliedEffects = applied.appliedEffects;
      pending.result.push(`${event.id} ${event.title} revealed. Price floor of 1 enforced.`);
      completeResolution();
    }
  }

  function applyMarketEvent(event, source) {
    const beforeValues = new Map(model.session.players.map((player) => [player.id, portfolioValue(player)]));
    const beforePrices = { ...model.session.prices };
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
      turn: currentPlayer() ? currentPlayer().turnsTaken + 1 : null,
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
    return {
      beforePrices,
      afterPrices: { ...model.session.prices },
      appliedEffects
    };
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
    const note = (model.ui.turnNoteDraft || document.getElementById("turnNote")?.value || "").trim();
    if (!note) {
      setMessage("Record one decision, finance term, or evidence note before ending the turn.");
      render();
      return;
    }
    model.session.physicalChecks.evidenceNote = true;
    const missingChecks = missingPhysicalChecks();
    if (missingChecks.length) {
      setMessage(`Finish the physical checklist first: ${missingChecks.map((key) => physicalChecklistLabels[key]).join(", ")}.`);
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
    session.physicalChecks = defaultPhysicalChecks();
    session.die = null;
    session.peekedEventId = null;
    model.ui.undoRollSession = null;
    model.ui.turnNoteDraft = "";
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
    const sessionSnapshot = exportSessionSnapshot();
    const payload = {
      exportedAt: nowIso(),
      app: "Give And Take QR session app",
      accessModel: "Host and players use the table code shown on the physical board or shared by the host.",
      summary: exportSummary(),
      session: sessionSnapshot,
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
      }
    };
    model.exportText = JSON.stringify(payload, null, 2);
    return model.exportText;
  }

  function exportSessionSnapshot() {
    const snapshot = cloneSession(model.session);
    delete snapshot.schema;
    return snapshot;
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

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function playerNotesText(player) {
    return player.decisions
      .map((decision) => {
        const turn = Number(decision.turn ?? 0);
        const prefix = turn ? `Turn ${turn}` : "Setup";
        return `${prefix} ${decision.spaceId ?? ""}: ${decision.note ?? ""}${decision.result ? ` (${decision.result})` : ""}`.trim();
      })
      .join(" | ");
  }

  function holdingsSummaryText(player) {
    return model.game.assets
      .map((asset) => {
        const units = Number(player.holdings?.[asset.id] ?? 0);
        const index = Number(model.session.prices[asset.id] ?? asset.startIndex ?? 0);
        const value = units * index * 1000;
        return `${asset.name}: ${units} units, index ${index}, value ${money(value)}`;
      })
      .join(" | ");
  }

  function scoreBreakdownText(score) {
    return `Portfolio ${score.portfolioScore}/25; Diversify ${score.diversificationScore}/20; Risk ${score.riskManagementScore}/15; Ethics ${score.ethicsScore}/20; Reflection ${score.reflectionScore}/20; Total ${score.total}/100`;
  }

  function exportCsv() {
    const scoresByPlayer = new Map(calculateScores().map((score) => [score.player.id, score]));
    const rows = [
      [
        "player",
        "turns_taken",
        "cash",
        "portfolio_value",
        "asset_categories",
        "risk_evidence",
        "ethics_position",
        "reflection_evidence",
        "notes",
        "player_notes",
        "holdings_summary",
        "portfolio_score",
        "diversification_score",
        "risk_score",
        "ethics_score",
        "reflection_score",
        "total_score",
        "score_breakdown",
        "missing_evidence"
      ]
    ];
    model.session.players.forEach((player) => {
      const score = scoresByPlayer.get(player.id);
      rows.push([
        player.name,
        `${player.turnsTaken}/${model.game.turnLimit}`,
        player.cash,
        score?.value ?? portfolioValue(player),
        uniqueHoldingCount(player),
        player.riskEvidence,
        player.ethicsPosition,
        player.reflectionEvidence,
        player.decisions.length,
        playerNotesText(player),
        holdingsSummaryText(player),
        score?.portfolioScore ?? 0,
        score?.diversificationScore ?? 0,
        score?.riskManagementScore ?? 0,
        score?.ethicsScore ?? 0,
        score?.reflectionScore ?? 0,
        score?.total ?? 0,
        score ? scoreBreakdownText(score) : "",
        missingEvidence(player).join("; ")
      ]);
    });
    return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  }

  function downloadCsv() {
    const blob = new Blob([exportCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${model.session.code.toLowerCase()}-give-and-take-summary.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printSummary() {
    const scores = calculateScores();
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(model.session.code)} Give And Take Summary</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; margin: 24px; color: #172026; }
            h1, h2 { margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin: 18px 0; }
            th, td { border: 1px solid #9a8a68; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #efe5d0; }
            .note { color: #5b4a2e; }
          </style>
        </head>
        <body>
          <h1>Give And Take Session Summary</h1>
          <p class="note">Table ${escapeHtml(model.session.code)} - ${escapeHtml(scoreStateLabel())} - ${escapeHtml(saveModeLabel())} - last saved ${escapeHtml(relativeTime(model.backend.lastSavedAt))}</p>
          <h2>Scores</h2>
          <table>
            <thead><tr><th>Player</th><th>Total</th><th>Portfolio</th><th>Diversify</th><th>Risk</th><th>Ethics</th><th>Reflect</th><th>Missing evidence</th></tr></thead>
            <tbody>
              ${scores
                .map((score) => `<tr><td>${escapeHtml(score.player.name)}</td><td>${score.total}/100</td><td>${score.portfolioScore}/25</td><td>${score.diversificationScore}/20</td><td>${score.riskManagementScore}/15</td><td>${score.ethicsScore}/20</td><td>${score.reflectionScore}/20</td><td>${escapeHtml(missingEvidence(score.player).join("; ") || "Complete")}</td></tr>`)
                .join("")}
            </tbody>
          </table>
          <h2>Player Notes And Holdings</h2>
          <table>
            <thead><tr><th>Player</th><th>Holdings summary</th><th>Evidence notes</th></tr></thead>
            <tbody>
              ${model.session.players
                .map((player) => `<tr><td>${escapeHtml(player.name)}</td><td>${escapeHtml(holdingsSummaryText(player))}</td><td>${escapeHtml(playerNotesText(player) || "No notes recorded")}</td></tr>`)
                .join("")}
            </tbody>
          </table>
          <h2>Latest Market Events</h2>
          <table>
            <thead><tr><th>Card</th><th>Sentiment</th><th>Bias</th><th>Player</th><th>Effects</th></tr></thead>
            <tbody>
              ${model.session.marketHistory
                .slice(0, 10)
                .map((item) => `<tr><td>${escapeHtml(item.id)} ${escapeHtml(item.title)}</td><td>${escapeHtml(item.sentiment)}</td><td>${escapeHtml(item.bias)}</td><td>${escapeHtml(item.playerName ?? "Host")}</td><td>${escapeHtml(marketEventExplanation(item))}</td></tr>`)
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `;
    const win = window.open("about:blank", "_blank");
    if (!win) {
      setMessage("Pop-up blocked. Allow pop-ups to print the summary.");
      render();
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  function missingEvidence(player) {
    const missing = [];
    const notes = playerNotesText(player).toLowerCase();
    if (!player.decisions.length) missing.push("no turn notes");
    if (player.reflectionEvidence <= 0 && !notes.includes("reflect")) missing.push("missing reflection note");
    if (player.riskEvidence <= 0 && !notes.includes("risk")) missing.push("missing risk note");
    if (player.ethicsPosition <= 0 && !notes.includes("ethic")) missing.push("missing ethics note");
    if (player.turnsTaken < model.game.turnLimit && !player.finished && !model.session.gameOver) missing.push("incomplete turns");
    return missing;
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
      afterRender();
      return;
    }
    renderApp();
    afterRender();
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
          ${renderSettingsControl({ includeMode: false, label: "Display" })}
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
            <input class="input" id="signupName" name="name" autocomplete="name" aria-describedby="signupNameHelp" required />
            <span class="field-help" id="signupNameHelp">Enter your name.</span>
          </div>
          <div class="field">
            <label for="signupEmail">Email</label>
            <input class="input" id="signupEmail" name="email" type="email" autocomplete="email" aria-describedby="signupEmailHelp" required />
            <span class="field-help" id="signupEmailHelp">Use the email you want tied to hosted tables.</span>
          </div>
          <div class="field">
            <label for="signupPassword">Password</label>
            <input class="input" id="signupPassword" name="password" type="password" autocomplete="new-password" minlength="6" aria-describedby="signupPasswordHelp" required />
            <span class="field-help" id="signupPasswordHelp">Use at least 6 characters.</span>
          </div>
          <div class="entry-preview">
            <strong>Why create an account?</strong>
            <span>Use the same identity for repeat hosting and returning to past Supabase tables.</span>
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
            <input class="input" id="guestName" name="name" autocomplete="name" aria-describedby="guestNameHelp" required />
            <span class="field-help" id="guestNameHelp">Enter your host name.</span>
          </div>
          <div class="entry-preview">
            <strong>Host flow</strong>
            <span>A GT code is the shared table code players enter to join this physical game session.</span>
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
            <input class="input" id="joinName" name="name" autocomplete="name" aria-describedby="joinNameHelp" required />
            <span class="field-help" id="joinNameHelp">Enter your player name.</span>
          </div>
          <div class="field">
            <label for="joinCode">Session code</label>
            <input class="input code-input" id="joinCode" name="code" value="GT-" pattern="GT-[0-9]{4}" maxlength="7" inputmode="text" autocomplete="off" aria-describedby="joinCodeHelp" required />
            <span class="field-help" id="joinCodeHelp">Use the format GT-0000. The host sees this code after creating the table.</span>
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
          <input class="input" id="loginEmail" name="email" type="email" autocomplete="email" aria-describedby="loginEmailHelp" required />
          <span class="field-help" id="loginEmailHelp">Use your host account email.</span>
        </div>
        <div class="field">
          <label for="loginPassword">Password</label>
          <input class="input" id="loginPassword" name="password" type="password" autocomplete="current-password" aria-describedby="loginPasswordHelp" required />
          <span class="field-help" id="loginPasswordHelp">Enter your password.</span>
        </div>
        <div class="entry-preview">
          <strong>Account benefit</strong>
          <span>Login when you want to host with the same account and keep access to past Supabase tables.</span>
        </div>
        <p class="notice">${escapeHtml(backendNotice("login"))}</p>
        <button class="button" type="submit">Login</button>
      </form>
    `;
  }

  function renderSettingsControl(options = {}) {
    const includeMode = options.includeMode ?? true;
    const label = options.label ?? "Settings";
    return `
      <details class="settings-popover">
        <summary class="settings-trigger" aria-label="Open display and mode settings">
          <span aria-hidden="true">${heroIcon("cog")}</span>
          <strong>${escapeHtml(label)}</strong>
        </summary>
        <div class="settings-panel">
          <section class="settings-group">
            <div>
              <p class="eyeline">Display theme</p>
              <h3>Choose the room style</h3>
            </div>
            ${renderThemeToggle()}
          </section>
          ${
            includeMode
              ? `
                <section class="settings-group">
                  <div>
                    <p class="eyeline">Companion mode</p>
                    <h3>Pick the screen role</h3>
                  </div>
                  ${renderCompanionModeToggle()}
                </section>
              `
              : ""
          }
        </div>
      </details>
    `;
  }

  function heroIcon(name) {
    const paths = {
      cog: "M11.42 2.62a1.5 1.5 0 0 1 2.16 0l.78.81a1.5 1.5 0 0 0 1.38.43l1.1-.23a1.5 1.5 0 0 1 1.76 1.02l.35 1.07a1.5 1.5 0 0 0 1.03 1l1.08.32a1.5 1.5 0 0 1 1.06 1.74l-.2 1.1a1.5 1.5 0 0 0 .46 1.37l.83.76a1.5 1.5 0 0 1 .03 2.16l-.81.78a1.5 1.5 0 0 0-.43 1.38l.23 1.1a1.5 1.5 0 0 1-1.02 1.76l-1.07.35a1.5 1.5 0 0 0-1 1.03l-.32 1.08a1.5 1.5 0 0 1-1.74 1.06l-1.1-.2a1.5 1.5 0 0 0-1.37.46l-.76.83a1.5 1.5 0 0 1-2.16.03l-.78-.81a1.5 1.5 0 0 0-1.38-.43l-1.1.23a1.5 1.5 0 0 1-1.76-1.02l-.35-1.07a1.5 1.5 0 0 0-1.03-1l-1.08-.32a1.5 1.5 0 0 1-1.06-1.74l.2-1.1a1.5 1.5 0 0 0-.46-1.37l-.83-.76a1.5 1.5 0 0 1-.03-2.16l.81-.78a1.5 1.5 0 0 0 .43-1.38l-.23-1.1a1.5 1.5 0 0 1 1.02-1.76l1.07-.35a1.5 1.5 0 0 0 1-1.03l.32-1.08a1.5 1.5 0 0 1 1.74-1.06l1.1.2a1.5 1.5 0 0 0 1.37-.46l.76-.83ZM12.5 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${paths[name] ?? paths.cog}"/></svg>`;
  }

  function renderThemeToggle() {
    const labels = { table: "Table", classroom: "Classroom", contrast: "Contrast" };
    const descriptions = {
      table: "Beige board-game table theme.",
      classroom: "Light theme optimized for projection.",
      contrast: "Dark high-contrast theme with reduced pattern intensity."
    };
    return `
      <div class="theme-toggle segmented-control" role="group" aria-label="Visual theme">
        ${["table", "classroom", "contrast"]
          .map(
            (theme) => `
              <button class="theme-button" type="button" data-action="set-theme" data-theme="${theme}" aria-pressed="${model.ui.theme === theme}" aria-label="${escapeHtml(labels[theme])}: ${escapeHtml(descriptions[theme])}" title="${escapeHtml(descriptions[theme])}">
                <strong>${labels[theme]}</strong>
                <span>${descriptions[theme]}</span>
              </button>
            `
          )
          .join("")}
        <button class="theme-button" type="button" data-action="toggle-reduced-motion" aria-pressed="${model.ui.reducedMotion}" title="Reduce animation and smooth scrolling"><strong>Reduced motion</strong><span>Limit animation and smooth scrolling.</span></button>
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

  function renderCompanionModeToggle() {
    if (model.backend.clientRole === "player") {
      return `<span class="status-pill">Mode <strong>Player Assist</strong></span>`;
    }
    return `
      <div class="mode-toggle segmented-control" role="group" aria-label="Companion mode">
        ${Object.entries(physicalModeLabels)
          .map(([mode, label]) => {
            const current = effectiveCompanionMode() === mode;
            const disabled = current || (mode !== "host" && !model.session.started);
            const description = mode === "host" ? "Host workflow for physical turns." : mode === "table" ? "Large classroom projection view." : "Student-only assist screen.";
            return `
              <button class="theme-button" type="button" data-action="set-companion-mode" data-mode="${mode}" aria-pressed="${current}" title="${description}" ${disabled ? "disabled" : ""}>
                <strong>${label}</strong>
                <span>${description}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function speakButton(text, label = "Read aloud") {
    return `<button class="mini-button read-button" type="button" data-action="speak" data-speak="${escapeHtml(text)}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
  }

  function renderSpaceDetailPanel(spaceId, compact = false) {
    const space = getSpace(spaceId) ?? getSpace("S00");
    const meta = spaceMeta(space?.type);
    const instruction = spaceInstruction(space);
    return `
      <article class="space-detail-panel tone-${meta.tone}">
        <div class="panel-header">
          <div>
            <p class="eyeline">Board space lookup</p>
            <h2>${escapeHtml(space.id)} ${escapeHtml(space.label)}</h2>
            <p>${escapeHtml(space.type)} - ${escapeHtml(spaceRequiredDeck(space))}</p>
          </div>
          <span class="space-badge tone-${meta.tone}">${escapeHtml(meta.icon)}</span>
        </div>
        <p class="large-readable">${escapeHtml(physicalActionForSpace(space))}</p>
        <dl class="lookup-detail-grid">
          <div><dt>Instruction</dt><dd>${escapeHtml(meta.help)}</dd></div>
          <div><dt>Required deck</dt><dd>${escapeHtml(spaceRequiredDeck(space))}</dd></div>
          <div><dt>Effect</dt><dd>${escapeHtml(space.effect ?? space.choices?.join(" ") ?? "Resolve the printed board instruction.")}</dd></div>
          <div><dt>Physical action</dt><dd>${escapeHtml(physicalActionForSpace(space))}</dd></div>
        </dl>
        ${compact ? "" : `<div class="btn-row">${speakButton(instruction, "Read space")}</div>`}
      </article>
    `;
  }

  function renderLargeCard(deckKey, card, warnings = []) {
    if (!card) {
      return `<article class="large-card-view"><h2>No card selected</h2></article>`;
    }
    const explanation = cardExplanation(deckKey, card);
    return `
      <article class="large-card-view tone-${deckMeta[deckKey]?.tone ?? "generic"}">
        <div class="panel-header">
          <div>
            <p class="eyeline">${escapeHtml(deckLabel(deckKey))} printed card</p>
            <h2>${escapeHtml(card.id)} ${escapeHtml(card.title)}</h2>
          </div>
          <span class="deck-icon">${escapeHtml(deckMeta[deckKey]?.icon ?? card.id.slice(0, 1))}</span>
        </div>
        ${warnings.length ? `<div class="notice warning">${warnings.map(escapeHtml).join("<br>")}</div>` : ""}
        <p class="large-readable">${escapeHtml(explanation)}</p>
        <dl class="lookup-detail-grid">
          ${cardSummaryLines(deckKey, card)
            .map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`)
            .join("")}
          <div><dt>Discard instruction</dt><dd>${escapeHtml(discardInstruction(deckKey, card.id))}</dd></div>
        </dl>
        <div class="btn-row">${speakButton(explanation, "Read card")}</div>
      </article>
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
            <p>Manual edits are for corrections after checking the physical board or cards. They are recorded in the export log.</p>
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
              <textarea class="textarea" id="adjustReason" name="reason" required></textarea>
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
    if (dialog.type === "card-lookup") {
      const card = getCard(dialog.deckKey, dialog.cardId);
      return `
        <div class="dialog-backdrop">
          <section class="dialog-card lookup-dialog" role="dialog" aria-modal="true" aria-labelledby="cardLookupDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <h2 id="cardLookupDialogTitle">Printed card lookup</h2>
            ${renderLargeCard(dialog.deckKey, card, dialog.warnings ?? [])}
            <div class="btn-row">
              <button class="button" type="button" data-action="close-dialog">Close</button>
            </div>
          </section>
        </div>
      `;
    }
    if (dialog.type === "profile-picker") {
      const starterProfiles = model.game.cards.starterProfiles;
      const index = Number(dialog.index ?? 0);
      const draft = model.session.draft.players[index] ?? {};
      const selectedId = draft.profileId ?? starterProfiles[index]?.id;
      return `
        <div class="dialog-backdrop">
          <section class="dialog-card profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profileDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">Starter Profile</p>
            <h2 id="profileDialogTitle">Choose Player ${index + 1} profile</h2>
            <p>Pick one printed Starter Profile. Cash, trait, and bonus apply when the game starts.</p>
            <div class="profile-option-grid modal-profile-grid" aria-label="Starter Profile choices">
              ${starterProfiles
                .map((item) => {
                  const optionMeta = profileUi(item.id);
                  return `
                    <button class="profile-option ${item.id === selectedId ? "selected" : ""}" type="button" data-action="select-profile" data-index="${index}" data-profile-id="${item.id}" ${hostDisabledAttr(model.session.started)}>
                      <strong>${escapeHtml(optionMeta.icon)} ${escapeHtml(item.id)} ${escapeHtml(item.title)}</strong>
                      <span>${money(item.cash)} - ${escapeHtml(item.trait)}</span>
                      <small>${escapeHtml(item.bonus)}</small>
                    </button>
                  `;
                })
                .join("")}
            </div>
            <div class="btn-row">
              <button class="button-secondary" type="button" data-action="close-dialog">Cancel</button>
            </div>
          </section>
        </div>
      `;
    }
    if (dialog.type === "board") {
      const occupied = new Map();
      model.session.players.forEach((player) => {
        const list = occupied.get(player.position) ?? [];
        list.push(player.id);
        occupied.set(player.position, list);
      });
      const selectedSpaceId = dialog.selectedSpaceId ?? model.ui.selectedBoardSpaceId ?? `S${String(currentPlayer()?.position ?? 0).padStart(2, "0")}`;
      return `
        <div class="dialog-backdrop">
          <section class="dialog-card board-dialog" role="dialog" aria-modal="true" aria-labelledby="boardDialogTitle" data-dialog-card>
            <button class="dialog-close" type="button" data-action="close-dialog" aria-label="Close dialog">x</button>
            <p class="eyeline">${escapeHtml(dialog.eyeline)}</p>
            <h2 id="boardDialogTitle">${escapeHtml(dialog.title)}</h2>
            <p>${escapeHtml(dialog.body)}</p>
            <div class="board-dialog-grid">
              ${renderInteractiveBoard(occupied, "modal")}
              ${renderSpaceDetailPanel(selectedSpaceId)}
            </div>
            <div class="board-legend" aria-label="Board space legend">
              ${Object.entries(spaceUi)
                .map(([type, meta]) => `<span class="asset-chip tone-${meta.tone}"><strong>${escapeHtml(meta.icon)}</strong>${escapeHtml(type)}</span>`)
                .join("")}
            </div>
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
            ${dialog.helpTopic ? `<button class="button-secondary" type="button" data-action="dialog-help-topic" data-topic="${escapeHtml(dialog.helpTopic)}">Open help</button>` : ""}
            <button class="button" type="button" data-action="close-dialog">Close</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderApp() {
    if (effectiveCompanionMode() === "table") {
      renderTableDisplayApp();
      return;
    }
    if (effectiveCompanionMode() === "player") {
      renderPlayerAssistApp();
      return;
    }
    const player = currentPlayer();
    const status = sessionStatus();
    appRoot.className = `app-shell theme-${model.ui.theme} ${model.ui.reducedMotion ? "reduced-motion" : ""}`;
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
                <button class="nav-button" type="button" data-view="${view}" aria-current="${model.session.view === view ? "page" : "false"}" aria-label="Open ${escapeHtml(label)} section">
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
          ${renderSettingsControl()}
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
            <span class="status-pill status-${status.state}">${escapeHtml(status.label)} <strong>${escapeHtml(status.state === "saving" ? "now" : status.state === "synced" ? relativeTime(model.backend.lastSavedAt) : "Supabase")}</strong></span>
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
              <button class="mobile-nav-button" type="button" data-view="${view}" aria-current="${model.session.view === view ? "page" : "false"}" aria-label="Open ${escapeHtml(label)} section">
                <span>${icon}</span>
                <strong>${label}</strong>
              </button>
            `
          )
          .join("")}
      </nav>
      ${renderToast()}
      ${renderDialog()}
      <span class="sr-only" aria-live="polite">${escapeHtml(model.ui.announcement)}</span>
    `;
  }

  function renderTableDisplayApp() {
    const player = currentPlayer();
    const pending = model.session.pendingResolution;
    const space = getSpace(pending?.spaceId ?? `S${String(player?.position ?? 0).padStart(2, "0")}`);
    const card = pending?.cardDeck && pending.cardId ? getCard(pending.cardDeck, pending.cardId) : null;
    const status = sessionStatus();
    appRoot.className = `table-display-shell theme-contrast ${model.ui.reducedMotion ? "reduced-motion" : ""}`;
    appRoot.innerHTML = `
      <main class="table-display" aria-live="polite">
        <header class="display-header">
          <div>
            <p class="eyeline">Give And Take Table Display</p>
            <h1>${escapeHtml(player?.name ?? "Set up players")}</h1>
          </div>
          <div class="display-code">
            <span>${escapeHtml(model.session.code)}</span>
            <strong>${escapeHtml(status.label)}</strong>
          </div>
        </header>
        <section class="display-grid">
          <article class="display-main">
            <span class="display-step">${escapeHtml(model.session.phase)}</span>
            <h2>${escapeHtml(space?.id ?? "S00")} ${escapeHtml(space?.label ?? "Student Start")}</h2>
            <p>${escapeHtml(physicalActionForSpace(space))}</p>
            ${pending ? `<p class="display-next">${escapeHtml(nextPhysicalStepText(pending))}</p>` : `<p class="display-next">Next: roll the physical D6 and enter the result.</p>`}
          </article>
          <article class="display-side">
            <div><span>Turn</span><strong>${escapeHtml(currentTurnLabel())}</strong></div>
            <div><span>Position</span><strong>S${String(player?.position ?? 0).padStart(2, "0")}</strong></div>
            <div><span>Cash</span><strong>${money(player?.cash ?? 0)}</strong></div>
            <div><span>Evidence</span><strong>R${player?.riskEvidence ?? 0} E${player?.ethicsPosition ?? 0} F${player?.reflectionEvidence ?? 0}</strong></div>
          </article>
        </section>
        ${card ? renderDisplayCard(pending.cardDeck, card) : ""}
        ${renderDisplayPriceChanges(pending)}
        ${canEditSession() ? `<button class="button-secondary display-exit" type="button" data-action="set-companion-mode" data-mode="host">Exit display</button>` : ""}
      </main>
      ${renderToast()}
      ${renderDialog()}
    `;
  }

  function renderPlayerAssistApp() {
    const player = assistPlayer();
    const pending = model.session.pendingResolution;
    const isCurrent = player?.id === currentPlayer()?.id;
    const space = getSpace(pending?.spaceId && isCurrent ? pending.spaceId : `S${String(player?.position ?? 0).padStart(2, "0")}`);
    appRoot.className = `player-assist-shell theme-${model.ui.theme} ${model.ui.reducedMotion ? "reduced-motion" : ""}`;
    appRoot.innerHTML = `
      <main class="player-assist">
        <header class="assist-header">
          <div>
            <p class="eyeline">Player Assist Mode</p>
            <h1>${escapeHtml(player?.name ?? "Player")}</h1>
            <p>${escapeHtml(model.session.code)} - ${escapeHtml(model.backend.clientRole === "player" ? "Joined player view" : "Host preview")}</p>
          </div>
          <div class="btn-row">
            ${canEditSession() ? `${renderAssistPlayerPicker()}<button class="button-secondary" type="button" data-action="set-companion-mode" data-mode="host">Exit assist</button>` : ""}
            <button class="button-ghost" type="button" data-action="logout">Leave table</button>
          </div>
        </header>
        ${!player ? `<section class="panel"><div class="empty-state">Ask the host to add your name during setup.</div></section>` : `
          <section class="assist-grid">
            <article class="assist-card primary">
              <p class="eyeline">Current instruction</p>
              <h2>${escapeHtml(space?.id ?? "S00")} ${escapeHtml(space?.label ?? "Student Start")}</h2>
              <p class="large-readable">${escapeHtml(isCurrent ? physicalActionForSpace(space) : "Watch the current turn. Your pawn and player board stay physical.")}</p>
              <div class="btn-row">${speakButton(spaceInstruction(space), "Read instruction")}</div>
            </article>
            <article class="assist-card">
              <p class="eyeline">Your board state</p>
              <div class="metric-grid">
                <div class="metric-tile"><span>Space</span><strong>S${String(player.position).padStart(2, "0")}</strong></div>
                <div class="metric-tile"><span>Cash</span><strong>${money(player.cash)}</strong></div>
                <div class="metric-tile"><span>Value</span><strong>${money(portfolioValue(player))}</strong></div>
                <div class="metric-tile"><span>Turns</span><strong>${player.turnsTaken}/${model.game.turnLimit}</strong></div>
              </div>
              <div class="evidence-strip">
                <span>Risk <strong>${player.riskEvidence}</strong></span>
                <span>Ethics <strong>${player.ethicsPosition}</strong></span>
                <span>Reflection <strong>${player.reflectionEvidence}</strong></span>
              </div>
            </article>
            <article class="assist-card">
              <p class="eyeline">Holdings</p>
              ${renderHoldings(player)}
            </article>
            <article class="assist-card">
              <p class="eyeline">Latest note</p>
              <p>${escapeHtml(player.decisions[0]?.note ?? "No evidence note recorded yet.")}</p>
            </article>
          </section>
        `}
      </main>
      ${renderToast()}
      ${renderDialog()}
    `;
  }

  function renderAssistPlayerPicker() {
    return `
      <label class="assist-picker">Preview player
        <select class="select" data-assist-player>
          ${model.session.players
            .map((player) => `<option value="${player.id}" ${assistPlayer()?.id === player.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`)
            .join("")}
        </select>
      </label>
    `;
  }

  function nextPhysicalStepText(pending = model.session.pendingResolution) {
    if (!pending) return "Next: roll the physical D6 and enter the result.";
    if (!pending.physicalPawnConfirmed) return "Next: confirm the pawn is physically on the expected landing space.";
    if (pending.cardDeck && !pending.cardId) return `Next: draw a printed ${deckLabel(pending.cardDeck)} card and enter its ID.`;
    if (!pending.completed) return "Next: resolve the shown space or printed card choice.";
    if (!model.ui.turnNoteDraft.trim()) return "Next: select a quick evidence note or type a short note.";
    const missing = missingPhysicalChecks();
    if (missing.length) return `Next: finish checklist item - ${physicalChecklistLabels[missing[0]]}.`;
    return "Next: end the turn and pass play to the next player.";
  }

  function renderDisplayCard(deckKey, card) {
    return `
      <section class="display-card">
        <p class="eyeline">${escapeHtml(deckLabel(deckKey))} card</p>
        <h2>${escapeHtml(card.id)} ${escapeHtml(card.title)}</h2>
        <p>${escapeHtml(cardExplanation(deckKey, card))}</p>
      </section>
    `;
  }

  function renderDisplayPriceChanges(pending = model.session.pendingResolution) {
    const effects = pending?.appliedEffects ?? model.session.marketHistory[0]?.appliedEffects ?? {};
    if (!Object.keys(effects).length) return "";
    return `
      <section class="display-price-strip" aria-label="Price changes">
        ${Object.entries(effects)
          .map(([assetId, delta]) => {
            const asset = assetMeta(assetId);
            const before = pending?.priceBefore?.[assetId] ?? (Number(model.session.prices[assetId] ?? 0) - Number(delta));
            const after = pending?.priceAfter?.[assetId] ?? model.session.prices[assetId];
            return `<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}"><strong>${escapeHtml(asset.icon)} ${escapeHtml(asset.name)}</strong> ${before} -> ${after} (${signed(delta)})</span>`;
          })
          .join("")}
      </section>
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
          ${renderSetupChecklist()}
        </section>
      </div>
    `;
  }

  function renderSetupChecklist() {
    const items = [
      "Shuffle Investment, Market/Life, Ethics, Action, and Reflection decks.",
      "Put pawns on S00 Student Start.",
      "Keep the D6 and price tracker near the host.",
      "Share the GT code with players.",
      "Confirm physical player boards and pencils are ready."
    ];
    const complete = items.filter((_, index) => model.ui.setupChecklist[`setup-${index}`]).length;
    return `
          <details class="rules-accordion setup-checklist" ${complete < items.length ? "open" : ""}>
            <summary>Physical setup checklist</summary>
            <div class="setup-checklist-meter" aria-label="${complete} of ${items.length} setup items complete">
              <strong>${complete}/${items.length}</strong>
              <span>${complete === items.length ? "Physical table ready" : "Check the table before starting"}</span>
            </div>
            <div class="checklist">
              ${items
                .map((item, index) => {
                  const key = `setup-${index}`;
                  const checked = Boolean(model.ui.setupChecklist[key]);
                  return `<label class="${checked ? "checked" : ""}"><input type="checkbox" data-setup-check="${key}" ${checked ? "checked" : ""} /> <span>${index + 1}. ${escapeHtml(item)}</span></label>`;
                })
                .join("")}
            </div>
          </details>
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
          <input type="hidden" id="playerProfile${index}" data-draft="profile" data-index="${index}" value="${escapeHtml(profile.id)}" />
          <button class="profile-select-button" type="button" data-action="open-profile-picker" data-index="${index}" ${hostDisabledAttr(model.session.started)} aria-label="Change Starter Profile for Player ${index + 1}">
            <span>${escapeHtml(profile.id)}</span>
            <strong>${escapeHtml(profile.title)}</strong>
            <small>Change profile</small>
          </button>
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
      <section class="physical-play-board">
        ${hostOnlyNotice()}
        <div class="physical-mode-banner">
          <div>
            <p class="eyeline">Physical Play Mode</p>
            <h2>Run the printed board. Use the app to check, explain, and record.</h2>
            <p>The physical board, real D6, printed cards, player boards, and host tracker remain the gameplay objects.</p>
          </div>
          <span class="status-pill">Mode <strong>${escapeHtml(physicalModeLabels[effectiveCompanionMode()] ?? "Physical Play")}</strong></span>
        </div>
        ${renderPhaseStepper()}
        <div class="physical-layout">
          <main class="physical-primary">
            ${renderPhysicalTurnPanel()}
            ${renderPhysicalResolutionPanel()}
            ${renderPhysicalEvidencePanel()}
          </main>
          <aside class="physical-side">
            ${renderCardLookupPanel()}
            ${renderSpaceLookupPanel()}
            ${renderDecks()}
            ${renderPriceTracker()}
          </aside>
        </div>
      </section>
    `;
  }

  function renderPhysicalTurnPanel() {
    const player = currentPlayer();
    const pending = model.session.pendingResolution;
    const canRoll = Boolean(player && !pending && !model.session.gameOver && !player.finished && player.turnsTaken < model.game.turnLimit);
    const canUndoRoll = Boolean(model.ui.undoRollSession && pending && !pending.completed && canEditSession());
    const fromSpaceId = pending?.fromSpaceId ?? `S${String(player?.position ?? 0).padStart(2, "0")}`;
    const expectedSpaceId = pending?.spaceId ?? fromSpaceId;
    const selectedDie = physicalDieDraft();
    const canSubmitRoll = Boolean(canRoll && selectedDie);
    return `
      <article class="physical-turn-card" data-phase-section="Roll">
        <div class="panel-header">
          <div>
            <p class="eyeline">Step 1 - physical die and pawn</p>
            <h2>${escapeHtml(player?.name ?? "No player")}</h2>
            <p>${escapeHtml(player?.profileTitle ?? "Start setup first")} - currently on S${String(player?.position ?? 0).padStart(2, "0")}</p>
          </div>
          <span class="player-token large" style="--token:${cssVar(player?.tokenColor ?? playerTokens[0])}">${escapeHtml(player?.id ?? "P")}</span>
        </div>
        <div class="physical-step-list" aria-label="Physical turn steps">
          <span class="${!pending ? "active" : "done"}">1 Roll physical D6</span>
          <span class="${pending && !pending.physicalPawnConfirmed ? "active" : pending?.physicalPawnConfirmed ? "done" : ""}">2 Move pawn</span>
          <span class="${pending?.cardDeck && !pending.cardId ? "active" : pending?.cardId ? "done" : ""}">3 Draw/enter card</span>
          <span class="${pending?.completed ? "done" : pending ? "active" : ""}">4 Resolve</span>
          <span class="${pending?.completed ? "active" : ""}">5 Evidence + checklist</span>
        </div>
        <div class="metric-grid player-metrics">
          <div class="metric-tile"><span>Turn</span><strong>${escapeHtml(currentTurnLabel())}</strong></div>
          <div class="metric-tile"><span>Cash</span><strong>${money(player?.cash ?? 0)}</strong></div>
          <div class="metric-tile"><span>Value</span><strong>${money(player ? portfolioValue(player) : 0)}</strong></div>
          <div class="metric-tile"><span>Evidence</span><strong>R${player?.riskEvidence ?? 0} E${player?.ethicsPosition ?? 0} F${player?.reflectionEvidence ?? 0}</strong></div>
        </div>
        <div class="physical-roll-panel">
          <div class="field">
            <label for="physicalDie">Enter the physical D6 result</label>
            <input class="input die-input" id="physicalDie" type="number" min="1" max="6" value="${escapeHtml(selectedDie)}" inputmode="numeric" aria-label="Enter physical six-sided die result" ${hostDisabledAttr(!canRoll)} />
          </div>
          <div class="quick-rolls" aria-label="Quick physical die entries">
            ${[1, 2, 3, 4, 5, 6].map((roll) => `<button class="mini-button tap-target ${Number(selectedDie) === roll && !pending ? "selected" : ""}" type="button" data-action="manual-roll" data-roll="${roll}" aria-pressed="${Number(selectedDie) === roll && !pending}" aria-label="Select physical die result ${roll}" ${hostDisabledAttr(!canRoll)}>${roll}</button>`).join("")}
          </div>
          <div class="selected-die-readout" aria-live="polite">
            <span>Selected D6</span>
            <strong>${selectedDie || "-"}</strong>
          </div>
          <button class="button" type="button" data-action="submit-physical-roll" ${hostDisabledAttr(!canSubmitRoll)}>Confirm move</button>
          <button class="button-secondary" type="button" data-action="clear-physical-roll" ${hostDisabledAttr(!canRoll || !model.ui.pendingPhysicalDie)}>Clear</button>
          <button class="button-secondary" type="button" data-action="cancel-roll" ${canUndoRoll ? "" : "disabled"}>Undo roll</button>
        </div>
        ${
          pending
            ? `
              <div class="move-confirm">
                <strong>Physical move check</strong>
                <span>From ${escapeHtml(fromSpaceId)} + D6 ${escapeHtml(pending.die)} = expected ${escapeHtml(expectedSpaceId)}</span>
                <button class="button" type="button" data-action="confirm-pawn-space" ${hostDisabledAttr(pending.physicalPawnConfirmed)}>${pending.physicalPawnConfirmed ? "Pawn confirmed" : "Confirm pawn is on " + escapeHtml(expectedSpaceId)}</button>
              </div>
            `
            : `<p class="notice">Roll the real die first, move the physical pawn, then enter the result here.</p>`
        }
        <span class="sr-only" aria-live="polite">${escapeHtml(model.ui.announcement || (pending ? `Expected landing space ${expectedSpaceId}.` : selectedDie ? `Physical die ${selectedDie} selected.` : "Waiting for physical die result."))}</span>
      </article>
    `;
  }

  function renderPhysicalResolutionPanel() {
    const pending = model.session.pendingResolution;
    if (model.session.gameOver) {
      return `
        <article class="physical-resolution-card completed" data-phase-section="Resolve">
          <p class="eyeline">Final review</p>
          <h2>Game is ready for scoring.</h2>
          <p>Use the printed boards and host tracker to double-check evidence before final scoring.</p>
          <button class="button" type="button" data-view="scoring">Open scoring</button>
        </article>
      `;
    }
    if (!pending) {
      return `
        <article class="physical-resolution-card" data-phase-section="Resolve">
          <p class="eyeline">Step 2 - landed space</p>
          <h2>Waiting for the physical roll.</h2>
          <p>After the host enters the die result, this panel will show the expected landing space and the printed-board action.</p>
        </article>
      `;
    }
    const space = getSpace(pending.spaceId);
    const card = pending.cardDeck && pending.cardId ? getCard(pending.cardDeck, pending.cardId) : null;
    return `
      <article class="physical-resolution-card ${pending.completed ? "completed" : ""}" data-phase-section="Resolve">
        ${renderSpaceDetailPanel(space.id, true)}
        ${pending.cardDeck ? renderPendingPhysicalCardPrompt(pending, card) : ""}
        ${card ? renderLargeCard(pending.cardDeck, card, pending.deckConflict ? [pending.deckConflict] : []) : ""}
        ${renderResolutionControls(pending, space)}
        ${renderPhysicalChangeAudit(pending)}
        ${pending.result.length ? `<ul class="effect-list">${pending.result.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </article>
    `;
  }

  function renderPendingPhysicalCardPrompt(pending, card) {
    if (card) {
      return `<p class="notice">${escapeHtml(discardInstruction(pending.cardDeck, card.id))}</p>`;
    }
    return `
      <section class="card-sync-panel">
        <div>
          <p class="eyeline">Step 3 - printed card</p>
          <h3>Draw from the ${escapeHtml(deckLabel(pending.cardDeck))} deck.</h3>
          <p>Enter the card ID printed on the physical card. The app will warn if it does not match the synced deck state.</p>
          ${pending.expectedCardId ? `<p class="notice">App expects the next ${escapeHtml(deckLabel(pending.cardDeck))} card to be ${escapeHtml(pending.expectedCardId)}.</p>` : ""}
        </div>
        <div class="physical-card-entry">
          <label class="sr-only" for="physicalCardId">Printed card ID, for example ${escapeHtml(pending.expectedCardId ?? "M08")}</label>
          <input class="input code-input" id="physicalCardId" value="${escapeHtml(model.ui.cardLookupId)}" aria-label="Enter printed card ID, for example ${escapeHtml(pending.expectedCardId ?? "M08")}" />
          <button class="button" type="button" data-action="use-card-for-turn" ${hostDisabledAttr()}>Use card for this turn</button>
          <button class="button-secondary" type="button" data-action="use-next-card" ${hostDisabledAttr()}>Use next synced card</button>
        </div>
      </section>
    `;
  }

  function renderPhysicalChangeAudit(pending) {
    if (!pending) return "";
    const rows = [];
    if (pending.priceBefore && pending.priceAfter) {
      Object.entries(pending.appliedEffects ?? {}).forEach(([assetId, delta]) => {
        const asset = assetMeta(assetId);
        rows.push(`<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}"><strong>${escapeHtml(asset.icon)} ${escapeHtml(asset.name)}</strong> ${pending.priceBefore[assetId]} -> ${pending.priceAfter[assetId]} (${signed(delta)})</span>`);
      });
    }
    if (pending.cashBefore !== null && pending.cashAfter !== null) {
      rows.push(`<span class="asset-chip"><strong>Cash</strong>${money(pending.cashBefore)} -> ${money(pending.cashAfter)}</span>`);
    }
    if (!rows.length) return "";
    return `
      <section class="change-audit">
        <p class="eyeline">Before / after check</p>
        <div class="btn-row">${rows.join("")}</div>
      </section>
    `;
  }

  function renderPhysicalEvidencePanel() {
    const pending = model.session.pendingResolution;
    const noteReady = Boolean(pending?.completed && model.ui.turnNoteDraft.trim());
    const missingChecks = missingPhysicalChecks();
    return `
      <section class="turn-log-card physical-evidence-card" data-phase-section="Log">
        <div class="field">
          <label for="turnNote">Step 4 - evidence note</label>
          <p class="notice">Select a chip for routine turns. Type only when the decision needs more context.</p>
          <div class="note-chip-row">
            ${evidenceNoteOptions(pending)
              .map((note) => `<button class="note-chip tap-target" type="button" data-action="use-evidence-note" data-note="${escapeHtml(note)}" ${pending?.completed && canEditSession() ? "" : "disabled"}>${escapeHtml(note)}</button>`)
              .join("")}
          </div>
          <textarea class="textarea" id="turnNote" data-turn-note="true" ${pending?.completed && canEditSession() ? "" : "disabled"}>${escapeHtml(model.ui.turnNoteDraft)}</textarea>
        </div>
        ${renderPhysicalChecklist(pending)}
        <div class="sticky-turn-actions">
          <span>${pending?.completed ? noteReady && !missingChecks.length ? "Ready to end turn." : nextPhysicalStepText(pending) : "Resolve the space before ending the turn."}</span>
          <button class="button" type="button" data-action="end-turn" ${hostDisabledAttr(!noteReady || missingChecks.length)}>End turn</button>
        </div>
      </section>
    `;
  }

  function evidenceNoteOptions(pending) {
    const primary = pending ? evidenceNotes[pending.type] ?? "Recorded the printed-space result." : "Recorded the physical turn.";
    return [...new Set([primary, ...commonEvidenceNotes])].slice(0, 8);
  }

  function renderPhysicalChecklist(pending) {
    const checks = model.session.physicalChecks ?? defaultPhysicalChecks();
    const required = new Set(requiredPhysicalChecks(pending));
    return `
      <section class="physical-checklist" aria-label="Per-turn physical checklist">
        <div class="section-head">
          <div>
            <p class="eyeline">Step 5 - host mistake check</p>
            <h3>Physical checklist before End Turn</h3>
          </div>
        </div>
        ${Object.entries(physicalChecklistLabels)
          .map(([key, label]) => {
            const applicable = required.has(key);
            const checked = !applicable || Boolean(checks[key]);
            return `
              <label class="${checked ? "checked" : ""} ${!applicable ? "not-applicable" : ""}">
                <input type="checkbox" data-physical-check="${key}" ${checked ? "checked" : ""} ${!applicable || !pending?.completed || !canEditSession() ? "disabled" : ""} />
                <span>${escapeHtml(label)}${!applicable ? " - not needed this turn" : ""}</span>
              </label>
            `;
          })
          .join("")}
      </section>
    `;
  }

  function renderCardLookupPanel() {
    const pending = model.session.pendingResolution;
    return `
      <article class="lookup-card">
        <div class="section-head">
          <div>
            <p class="eyeline">Printed card lookup</p>
            <h2>Enter card ID</h2>
          </div>
        </div>
        <p>Use IDs printed on cards: M08, I17, A12, E04, R03.</p>
        <div class="physical-card-entry">
          <label class="sr-only" for="cardLookupId">Printed card ID lookup, for example M08</label>
          <input class="input code-input" id="cardLookupId" value="${escapeHtml(model.ui.cardLookupId)}" aria-label="Printed card ID lookup, for example M08" />
          <button class="button-secondary" type="button" data-action="preview-card-id">Show card</button>
          <button class="button" type="button" data-action="use-card-for-turn" ${hostDisabledAttr(!pending?.cardDeck)}>Use for turn</button>
        </div>
      </article>
    `;
  }

  function renderSpaceLookupPanel() {
    const selected = getSpace(model.ui.selectedBoardSpaceId) ?? getSpace("S00");
    return `
      <article class="lookup-card">
        <div class="section-head">
          <div>
            <p class="eyeline">Board space lookup</p>
            <h2>S00-S43 help</h2>
          </div>
          <button class="mini-button" type="button" data-action="expand-board">Board image</button>
        </div>
        <div class="physical-card-entry">
          <label class="sr-only" for="boardLookupId">Board space lookup, for example S14</label>
          <input class="input code-input" id="boardLookupId" value="${escapeHtml(model.ui.boardLookupId)}" aria-label="Board space lookup, for example S14" />
          <button class="button-secondary" type="button" data-action="lookup-space-id">Show space</button>
        </div>
        ${renderSpaceDetailPanel(selected.id, true)}
      </article>
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
    const canUndoRoll = Boolean(model.ui.undoRollSession && model.session.pendingResolution && !model.session.pendingResolution.completed && canEditSession());
    const space = getSpace(`S${String(player?.position ?? 0).padStart(2, "0")}`);
    const selectedDie = physicalDieDraft();
    const canSubmitRoll = Boolean(canRoll && selectedDie);
    return `
      <article class="current-player-card" data-phase-section="Roll">
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
                  <input class="input die-input" id="physicalDie" type="number" min="1" max="6" value="${escapeHtml(selectedDie)}" aria-label="Enter physical six-sided die result" ${hostDisabledAttr(!canRoll)} />
                  <button class="button" type="button" data-action="submit-physical-roll" ${hostDisabledAttr(!canSubmitRoll)}>Confirm move</button>
                  <button class="button-secondary" type="button" data-action="clear-physical-roll" ${hostDisabledAttr(!canRoll || !model.ui.pendingPhysicalDie)}>Clear</button>
                </div>
                <div class="quick-rolls" aria-label="Quick physical die entries">
                  ${[1, 2, 3, 4, 5, 6].map((roll) => `<button class="mini-button ${Number(selectedDie) === roll && !model.session.pendingResolution ? "selected" : ""}" type="button" data-action="manual-roll" data-roll="${roll}" aria-pressed="${Number(selectedDie) === roll && !model.session.pendingResolution}" aria-label="Select physical die result ${roll}" ${hostDisabledAttr(!canRoll)}>${roll}</button>`).join("")}
                </div>
              `
              : `<button class="die-button" type="button" data-action="roll-die" aria-label="Roll digital six-sided die. Current result ${model.session.die ?? "none"}" ${hostDisabledAttr(!canRoll)}>${model.session.die ?? "D6"}</button>`
          }
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="cancel-roll" ${canUndoRoll ? "" : "disabled"}>Undo roll</button>
            <span class="sr-only" aria-live="polite">${escapeHtml(model.ui.announcement || (selectedDie ? `Physical die ${selectedDie} selected.` : model.session.die ? `Die result ${model.session.die}.` : "No die result yet."))}</span>
          </div>
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
            <h2>Interactive S00-S43 board</h2>
          </div>
          <button class="mini-button" type="button" data-action="expand-board">Board image</button>
        </div>
        ${renderInteractiveBoard(occupied, "compact")}
      </article>
    `;
  }

  function renderInteractiveBoard(occupied = new Map(), mode = "compact") {
    const zoom = mode === "modal" ? clamp(model.ui.boardZoom, 0.75, 2.2) : 1;
    const selectedSpaceId = model.ui.selectedBoardSpaceId ?? `S${String(currentPlayer()?.position ?? 0).padStart(2, "0")}`;
    return `
      <div class="board-map-shell ${mode === "modal" ? "modal-board-map" : ""}" aria-label="Interactive board spaces">
        <div class="board-map-tools">
          <span class="table-label">Tap, focus, or hover spaces for details</span>
          ${
            mode === "modal"
              ? `
                <div class="btn-row">
                  <button class="mini-button" type="button" data-action="board-zoom" data-zoom="-0.2" aria-label="Zoom board out">-</button>
                  <span class="status-pill">Zoom <strong>${Math.round(zoom * 100)}%</strong></span>
                  <button class="mini-button" type="button" data-action="board-zoom" data-zoom="0.2" aria-label="Zoom board in">+</button>
                </div>
              `
              : ""
          }
        </div>
        <div class="board-map-scroll">
          <div class="board-map-stage" style="--board-zoom:${zoom}">
            <img src="${BOARD_IMAGE_URL}" alt="Give And Take board with QR code and S00-S43 path" />
            ${boardSpaceBoxes()
              .map((box) => {
                const [spaceId] = box;
                const space = getSpace(spaceId);
                const index = Number(spaceId.slice(1));
                const players = occupied.get(index) ?? [];
                const meta = spaceMeta(space?.type);
                const isActive = currentPlayer()?.position === index;
                const isSelected = selectedSpaceId === spaceId;
                return `
                  <button
                    class="board-space-hotspot tone-${meta.tone} ${isActive ? "active" : ""} ${isSelected ? "selected" : ""}"
                    style="${boardBoxStyle(box)}"
                    type="button"
                    data-action="${mode === "modal" ? "select-board-space" : "space-info"}"
                    data-space-id="${spaceId}"
                    aria-label="${escapeHtml(boardSpaceDescription(space))}"
                    title="${escapeHtml(boardSpaceDescription(space))}">
                    <span class="path-id">${spaceId}</span>
                    <span class="path-icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
                    <span class="board-tooltip" role="tooltip">${escapeHtml(boardSpaceDescription(space))}</span>
                    <span class="pawn-markers">${players.map((playerId) => `<span class="pawn-marker" title="${playerId}"></span>`).join("")}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
        ${mode === "compact" ? renderReadableMiniMap(occupied) : ""}
      </div>
    `;
  }

  function renderReadableMiniMap(occupied = new Map()) {
    return `
      <div class="readable-mini-map" role="list" aria-label="Readable board mini-map S00 to S43">
        ${model.game.boardSpaces
          .map((space) => {
            const index = Number(space.id.slice(1));
            const players = occupied.get(index) ?? [];
            const meta = spaceMeta(space.type);
            const active = currentPlayer()?.position === index;
            return `
              <button
                class="mini-map-space tone-${meta.tone} ${active ? "active" : ""}"
                type="button"
                data-action="space-info"
                data-space-id="${space.id}"
                role="listitem"
                title="${escapeHtml(boardSpaceDescription(space))}"
                aria-label="${escapeHtml(boardSpaceDescription(space))}">
                <strong>${escapeHtml(space.id)}</strong>
                <span>${escapeHtml(meta.icon)}</span>
                <small>${escapeHtml(space.type)}</small>
                ${players.length ? `<em>${players.map(escapeHtml).join(", ")}</em>` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderResolutionPanel() {
    const pending = model.session.pendingResolution;
    if (model.session.gameOver) {
      return `
        <article class="resolution-card completed" data-phase-section="Resolve">
          <p class="eyeline">Scoring</p>
          <h2>Game is ready for final scoring.</h2>
          <p>All active players reached S43 or hit the 12-turn limit.</p>
          <button class="button" type="button" data-view="scoring">Open scoring</button>
        </article>
      `;
    }
    if (!pending) {
      return `
        <article class="resolution-card" data-phase-section="Resolve">
          <p class="eyeline">Resolve space</p>
          <h2>Ready to roll.</h2>
          <p>Roll one D6 or enter the physical die result. Movement is capped at S43.</p>
        </article>
      `;
    }
    const space = getSpace(pending.spaceId);
    const meta = spaceMeta(space.type);
    return `
      <article class="resolution-card ${pending.completed ? "completed" : ""} tone-${meta.tone}" data-phase-section="Resolve">
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
    if (pending.cardDeck && !pending.cardId) {
      return `<p class="notice warning">Enter the printed ${escapeHtml(deckLabel(pending.cardDeck))} card ID before resolving this space.</p>`;
    }
    if (space.type === "Invest") {
      const card = getCard("investments", pending.cardId);
      if (!card) return `<p class="notice warning">Investment card ID is missing or invalid.</p>`;
      return `
        <div class="btn-row">
          <button class="button" type="button" data-action="buy-investment" data-card-id="${escapeHtml(card?.id)}" ${hostDisabledAttr()}>Buy unit</button>
          <button class="button-secondary" type="button" data-action="pass-investment" data-card-id="${escapeHtml(card?.id)}" ${hostDisabledAttr()}>Pass</button>
        </div>
      `;
    }
    if (space.type === "Ethics Crossroad") {
      if (!getCard("ethics", pending.cardId)) return `<p class="notice warning">Ethics card ID is missing or invalid.</p>`;
      return `
        <div class="btn-row">
          <button class="button-secondary" type="button" data-action="choose-ethics" data-choice="profit" ${hostDisabledAttr()}>Profit option</button>
          <button class="button" type="button" data-action="choose-ethics" data-choice="responsible" ${hostDisabledAttr()}>Responsible option</button>
        </div>
      `;
    }
    if (space.type === "Research/Action") {
      const card = getCard("actions", pending.cardId);
      if (!card) return `<p class="notice warning">Action card ID is missing or invalid.</p>`;
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
      if (!getCard("reflection", pending.cardId)) return `<p class="notice warning">Reflection card ID is missing or invalid.</p>`;
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
    const noteReady = Boolean(pending?.completed && model.ui.turnNoteDraft.trim());
    return `
      <section class="turn-log-card" data-phase-section="Log">
        <div class="field">
          <label for="turnNote">Required decision, finance term, or evidence note</label>
          <p class="notice">Use a suggested note or write your own. The note is saved in the evidence export.</p>
          ${
            suggested
              ? `<div class="note-chip-row"><button class="note-chip" type="button" data-action="use-evidence-note" data-note="${escapeHtml(suggested)}" ${pending?.completed && canEditSession() ? "" : "disabled"}>${escapeHtml(suggested)}</button></div>`
              : ""
          }
          <textarea class="textarea" id="turnNote" data-turn-note="true" ${pending?.completed && canEditSession() ? "" : "disabled"}>${escapeHtml(model.ui.turnNoteDraft)}</textarea>
        </div>
        <div class="sticky-turn-actions">
          <span>${pending?.completed ? noteReady ? "Ready to end turn." : "Add or select one note to end the turn." : "Resolve the space before ending the turn."}</span>
          <button class="button" type="button" data-action="end-turn" ${hostDisabledAttr(!noteReady)}>End turn</button>
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
                  <div class="asset-name"><span>${escapeHtml(meta.icon)}</span><strong>${escapeHtml(asset.name)}</strong><small>Risk ${asset.risk} - ${escapeHtml(meta.label)} - ${escapeHtml(meta.pattern)} pattern</small></div>
                  <div class="bar asset-bar" role="progressbar" aria-label="${escapeHtml(asset.name)} current index ${index}, start ${start}, total change ${signed(delta)}, last event ${signed(lastDelta)}" aria-valuenow="${index}" aria-valuemin="1" aria-valuemax="${Math.max(1, start + 12)}">
                    <span style="width:${width}%"></span>
                    <strong class="asset-bar-number">${index}</strong>
                  </div>
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
    return `
      <div class="holding-list">
        ${model.game.assets
          .map((baseAsset) => {
            const asset = assetMeta(baseAsset.id);
            const units = Number(player.holdings?.[baseAsset.id] ?? 0);
            const index = Number(model.session.prices[baseAsset.id] ?? baseAsset.startIndex ?? 0);
            const value = Number(units) * index * 1000;
            return `
              <span class="asset-chip holding-chip pattern-${asset.pattern} ${units ? "" : "empty-holding"}" style="--asset:${cssVar(asset.color)}" aria-label="${escapeHtml(asset.name)} ${units} units, index ${index}, value ${money(value)}">
                <strong>${escapeHtml(asset.icon)} ${escapeHtml(asset.name)}</strong>
                <small>${units} units / index ${index} / value ${money(value)}</small>
              </span>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderMarket() {
    const filtered = filteredMarketHistory();
    return `
      <div class="market-layout">
        <section class="panel stack">
          ${hostOnlyNotice()}
          ${renderLatestMarketEvent()}
          ${renderPriceTracker()}
        </section>
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyeline">Event timeline</p>
              <h2>Market/Life history</h2>
            </div>
          </div>
          <div class="market-filter-grid">
            <label>Sentiment
              <select class="select" data-market-filter="sentiment">
                ${["all", "Bull", "Bear", "Neutral"].map((value) => `<option value="${value}" ${model.ui.marketFilters.sentiment === value ? "selected" : ""}>${value === "all" ? "All" : value}</option>`).join("")}
              </select>
            </label>
            <label>Asset
              <select class="select" data-market-filter="asset">
                <option value="all">All assets</option>
                ${model.game.assets.map((asset) => `<option value="${asset.id}" ${model.ui.marketFilters.asset === asset.id ? "selected" : ""}>${escapeHtml(asset.name)}</option>`).join("")}
              </select>
            </label>
            <label>Bias watch
              <select class="select" data-market-filter="bias">
                <option value="all">All bias types</option>
                ${[...new Set(model.game.cards.events.map((event) => event.bias).filter(Boolean))]
                  .map((bias) => `<option value="${escapeHtml(bias)}" ${model.ui.marketFilters.bias === bias ? "selected" : ""}>${escapeHtml(bias)}</option>`)
                  .join("")}
              </select>
            </label>
          </div>
          <div class="stack">
            ${
              filtered.length
                ? filtered.map(renderMarketHistoryRow).join("")
                : `<div class="empty-state">No Market/Life events match the current filters.</div>`
            }
          </div>
          <section class="host-tools">
            <div>
              <p class="eyeline">Host tools</p>
              <h3>Manual reveal</h3>
              <p>Use this only when the board space or host flow calls for a Market/Life card.</p>
            </div>
            <button class="button-secondary" type="button" data-action="confirm-host-reveal" ${hostDisabledAttr(!model.session.started)}>Reveal Market/Life card</button>
          </section>
        </section>
      </div>
    `;
  }

  function renderLatestMarketEvent() {
    const item = model.session.marketHistory[0];
    if (!item) {
      return `
        <article class="latest-event-card">
          <p class="eyeline">Latest Market/Life card</p>
          <h2>No event revealed yet</h2>
          <p>The first Market/Life card will appear here with sentiment, bias watch, player, turn, and price effects.</p>
        </article>
      `;
    }
    return `
      <article class="latest-event-card sentiment-${escapeHtml(String(item.sentiment).toLowerCase())}">
        <div class="panel-header">
          <div>
            <p class="eyeline">Latest Market/Life card</p>
            <h2>${escapeHtml(item.id)} ${escapeHtml(item.title)}</h2>
            <p>Turn ${escapeHtml(item.turn ?? "Host")} - ${escapeHtml(item.playerName ?? "Host reveal")} - ${escapeHtml(item.source)}</p>
          </div>
          <span class="status-pill">${escapeHtml(item.sentiment)} <strong>${escapeHtml(item.bias)}</strong></span>
        </div>
        <p>${escapeHtml(marketEventExplanation(item))}</p>
        <div class="btn-row">${speakButton(`${item.id} ${item.title}. ${marketEventExplanation(item)}`, "Read event")}</div>
        ${renderMarketEffectChips(item)}
      </article>
    `;
  }

  function marketEventExplanation(item) {
    const effects = Object.entries(item.appliedEffects ?? item.priceEffects ?? {})
      .map(([assetId, delta]) => `${getAsset(assetId).name} ${signed(delta)}`)
      .join(", ");
    return `Sentiment is ${item.sentiment}; bias watch is ${item.bias}. Applied index changes: ${effects || "none"}.`;
  }

  function filteredMarketHistory() {
    return model.session.marketHistory.filter((item) => {
      const filters = model.ui.marketFilters;
      if (filters.sentiment !== "all" && item.sentiment !== filters.sentiment) return false;
      if (filters.asset !== "all" && !Object.prototype.hasOwnProperty.call(item.priceEffects ?? {}, filters.asset)) return false;
      if (filters.bias !== "all" && item.bias !== filters.bias) return false;
      return true;
    });
  }

  function renderMarketHistoryRow(item) {
    const eventKey = `${item.id}-${item.at}`;
    return `
      <details class="event-row" ${model.ui.selectedMarketEventId === eventKey ? "open" : ""}>
        <summary>
          <strong>${escapeHtml(item.id)} ${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.sentiment)} / ${escapeHtml(item.bias)} / Turn ${escapeHtml(item.turn ?? "Host")} / ${escapeHtml(item.playerName ?? "Host reveal")}</span>
        </summary>
        <dl class="event-detail-grid">
          <div><dt>Card ID</dt><dd>${escapeHtml(item.id)}</dd></div>
          <div><dt>Title</dt><dd>${escapeHtml(item.title)}</dd></div>
          <div><dt>Sentiment</dt><dd>${escapeHtml(item.sentiment)}</dd></div>
          <div><dt>Bias watch</dt><dd>${escapeHtml(item.bias)}</dd></div>
          <div><dt>Turn</dt><dd>${escapeHtml(item.turn ?? "Host reveal")}</dd></div>
          <div><dt>Player</dt><dd>${escapeHtml(item.playerName ?? "Host reveal")}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(item.source)}</dd></div>
          <div><dt>Time</dt><dd>${escapeHtml(new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</dd></div>
        </dl>
        <p>${escapeHtml(marketEventExplanation(item))}</p>
        ${renderMarketEffectChips(item)}
      </details>
    `;
  }

  function renderMarketEffectChips(item) {
    const entries = Object.entries(item.appliedEffects ?? item.priceEffects ?? {});
    if (!entries.length) {
      return `<div class="btn-row"><span class="asset-chip">No index changes</span></div>`;
    }
    return `
      <div class="btn-row market-effect-row" aria-label="Market price changes">
        ${entries
          .map(([assetId, delta]) => {
            const asset = assetMeta(assetId);
            const applied = Number(delta);
            const after = Number(item.prices?.[assetId] ?? model.session.prices[assetId] ?? 0);
            const before = after - applied;
            return `<span class="asset-chip pattern-${asset.pattern}" style="--asset:${cssVar(asset.color)}" aria-label="${escapeHtml(asset.name)} index ${before} to ${after}, change ${signed(applied)}"><strong>${escapeHtml(asset.icon)} ${escapeHtml(asset.name)}</strong> ${before} -> ${after} <em>${signed(applied)}</em></span>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderPlayers() {
    if (!model.session.players.length) {
      return `<section class="panel"><div class="empty-state">Start setup before editing player ledgers.</div></section>`;
    }
    const latestAdjustment = model.session.manualAdjustments[0];
    const undoTitle = latestAdjustment
      ? `Undo ${latestAdjustment.playerName} ${latestAdjustment.field} correction ${signed(latestAdjustment.delta)}`
      : "No correction available to undo";
    return `
      <section class="panel ledger-console">
        <div class="panel-header">
          <div>
            <p class="eyeline">Player ledger</p>
            <h2>Cash, holdings, and evidence</h2>
            <p>Manual edits are for corrections after checking the physical board, cards, or player boards.</p>
          </div>
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="toggle-ledger-edit" aria-pressed="${model.ui.ledgerEditMode}" ${hostDisabledAttr()}>${model.ui.ledgerEditMode ? "Exit edit mode" : "Edit ledger"}</button>
            <button class="mini-button" type="button" data-action="undo-adjustment" title="${escapeHtml(undoTitle)}" aria-label="${escapeHtml(undoTitle)}" ${hostDisabledAttr(!model.session.manualAdjustments.length)}>Undo latest</button>
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
          ${speakButton("Portfolio 25, diversification 20, risk management 15, ethics 20, reflection 20. Portfolio is normalized against the highest player value.", "Read scoring")}
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
                  <details class="score-details" open>
                    <summary>Calculation details</summary>
                    ${renderScoreDetails(score)}
                    ${speakButton(scoreExplanation(score), "Read score")}
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
      ["Portfolio", "PF", score.portfolioScore, Number(model.game.scoreWeights.portfolioValue ?? 25)],
      ["Diversify", "DV", score.diversificationScore, Number(model.game.scoreWeights.diversification ?? 20)],
      ["Risk", "RK", score.riskManagementScore, Number(model.game.scoreWeights.riskManagement ?? 15)],
      ["Ethics", "ET", score.ethicsScore, Number(model.game.scoreWeights.ethics ?? 20)],
      ["Reflection", "RF", score.reflectionScore, Number(model.game.scoreWeights.reflection ?? 20)]
    ];
    return `
      <div class="score-bars" aria-label="Scoring category bars">
        ${rows
          .map(([label, icon, value, max]) => {
            const width = clamp((value / max) * 100, 0, 100);
            return `<div class="score-bar" aria-label="${label} score ${value} out of ${max}"><span class="score-icon" aria-hidden="true">${icon}</span><span class="score-label">${label}</span><div class="bar" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}" aria-label="${label} ${value} out of ${max}"><span style="width:${width}%"></span></div><strong>${value}/${max}</strong></div>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderScoreDetails(score) {
    const player = score.player;
    const startingProfile = model.game.cards.starterProfiles.find((profile) => profile.id === player.profileId);
    const holdingsValue = score.value - Number(player.cash || 0);
    const highestValue = Math.max(1, ...model.session.players.map((item) => portfolioValue(item)));
    return `
      <dl class="score-detail-grid">
        <div><dt>Starting cash</dt><dd>${money(startingProfile?.cash ?? 0)}</dd></div>
        <div><dt>Current cash</dt><dd>${money(player.cash)}</dd></div>
        <div><dt>Holdings value</dt><dd>${money(holdingsValue)}</dd></div>
        <div><dt>Current portfolio value</dt><dd>${money(score.value)}</dd></div>
        <div><dt>Unique asset categories</dt><dd>${uniqueHoldingCount(player)}</dd></div>
        <div><dt>Risk evidence</dt><dd>${player.riskEvidence}</dd></div>
        <div><dt>Ethics position</dt><dd>${player.ethicsPosition}</dd></div>
        <div><dt>Reflection evidence</dt><dd>${player.reflectionEvidence}</dd></div>
        <div><dt>Portfolio score</dt><dd>${score.portfolioScore}/25 = ${money(score.value)} / ${money(highestValue)} x 25</dd></div>
        <div><dt>Diversification score</dt><dd>${score.diversificationScore}/20 = ${uniqueHoldingCount(player)} categories x 4</dd></div>
        <div><dt>Risk score</dt><dd>${score.riskManagementScore}/15 = evidence, cash buffer, and diversification checks</dd></div>
        <div><dt>Ethics score</dt><dd>${score.ethicsScore}/20 = base 10 plus ethics position</dd></div>
        <div><dt>Reflection score</dt><dd>${score.reflectionScore}/20 = scored reflection evidence</dd></div>
      </dl>
    `;
  }

  function scoreExplanation(score) {
    return `${score.player.name} has ${score.total} out of 100. Portfolio ${score.portfolioScore} out of 25. Diversification ${score.diversificationScore} out of 20. Risk ${score.riskManagementScore} out of 15. Ethics ${score.ethicsScore} out of 20. Reflection ${score.reflectionScore} out of 20.`;
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
            <p>Export the session record for teacher review, player notes, evidence counters, holdings, and scoring.</p>
          </div>
          <div class="btn-row">
            <button class="button-secondary" type="button" data-action="refresh-export">Refresh JSON</button>
            <button class="button-secondary" type="button" data-action="copy-export">Copy JSON</button>
            <button class="button-secondary" type="button" data-action="download-csv">Download CSV</button>
            <button class="button-secondary" type="button" data-action="print-summary">Printable HTML/PDF</button>
            <button class="button" type="button" data-action="download-evidence">Download JSON</button>
          </div>
        </div>
        <section class="session-status status-${sessionStatus().state}" aria-label="Export save status">
          <div>
            <span class="label">${escapeHtml(saveModeLabel())}</span>
            <strong>${escapeHtml(sessionStatus().label)}</strong>
            <p>Last saved timestamp: ${escapeHtml(relativeTime(model.backend.lastSavedAt))}</p>
          </div>
        </section>
        <div class="export-summary-grid">
          ${Object.entries(summary)
            .map(([key, value]) => `<div class="metric-tile"><span>${escapeHtml(key.replace(/([A-Z])/g, " $1"))}</span><strong>${escapeHtml(value)}</strong></div>`)
            .join("")}
        </div>
        <div class="evidence-completeness">
          <div class="section-head">
            <div>
              <p class="eyeline">Before export</p>
              <h3>Evidence completeness check</h3>
            </div>
          </div>
          ${model.session.players
            .map((player) => {
              const missing = missingEvidence(player);
              return `
                <article class="${missing.length ? "warning" : ""}">
                  <strong>${missing.length ? "!" : "OK"} ${escapeHtml(player.name)}</strong>
                  <span>Notes ${player.decisions.length}</span>
                  <span>Risk ${player.riskEvidence}</span>
                  <span>Ethics ${player.ethicsPosition}</span>
                  <span>Reflection ${player.reflectionEvidence}</span>
                  <span>${missing.length ? escapeHtml(missing.join(", ")) : "Evidence complete"}</span>
                </article>
              `;
            })
            .join("")}
        </div>
        <details class="rules-accordion" open>
          <summary>Raw JSON preview</summary>
          <button class="mini-button" type="button" data-action="copy-export">Copy formatted JSON</button>
          <pre class="export-box" id="evidenceOutput">${escapeHtml(text)}</pre>
        </details>
      </section>
    `;
  }

  function renderRules() {
    const query = model.ui.rulesQuery.trim().toLowerCase();
    const rules = helpSections().filter((section) => !query || `${section.title} ${section.body}`.toLowerCase().includes(query));
    const glossary = glossaryTerms().filter((term) => !query || `${term.term} ${term.body} ${term.section}`.toLowerCase().includes(query));
    const hasResults = rules.length || glossary.length;
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
          ${!hasResults ? `<div class="empty-state">No results found.</div>` : ""}
          <div class="help-cross-links" aria-label="Help quick links">
            ${["Turn flow", "Scoring", "Deck lifecycle", "Market", "Risk management"].map((topic) => `<button class="mini-button" type="button" data-action="open-help-topic" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join("")}
          </div>
          <div class="diagram-grid" aria-label="Game diagrams">
            ${renderFlowDiagram("Turn flow", ["Roll", "Move", "Resolve", "Log", "End"])}
            ${renderFlowDiagram("Scoring formula", ["Portfolio 25", "Diversify 20", "Risk 15", "Ethics 20", "Reflect 20", "Total 100"])}
            ${renderFlowDiagram("Deck lifecycle", ["Draw", "Resolve", "Discard", "Reshuffle"])}
          </div>
          ${rules.map((section) => `<details class="rules-accordion" open id="help-${escapeHtml(section.slug)}"><summary>${highlightMatch(section.title, query)}</summary><p>${highlightMatch(section.body, query)}</p></details>`).join("")}
          <section class="glossary-panel">
            <div class="section-head">
              <div>
                <p class="eyeline">Glossary</p>
                <h2>A-Z finance terms</h2>
              </div>
            </div>
            <div class="az-index">${"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `<a href="#glossary-${letter}">${letter}</a>`).join("")}</div>
            ${renderGlossary(glossary, query)}
          </section>
        </section>
        <section class="panel stack">
          <div class="panel-header">
            <div>
              <p class="eyeline">Legends</p>
              <h2>Assets and quick cards</h2>
            </div>
          </div>
          <div class="asset-legend-grid">
            ${model.game.assets
              .map((asset) => {
                const meta = assetMeta(asset.id);
                return `<article class="asset-legend-card pattern-${meta.pattern}" style="--asset:${cssVar(asset.color)}"><strong>${escapeHtml(meta.icon)} ${escapeHtml(asset.name)}</strong><span>Risk ${asset.risk}</span><small>${escapeHtml(meta.label)}</small></article>`;
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

  function highlightMatch(text, query) {
    const escaped = escapeHtml(text);
    if (!query) {
      return escaped;
    }
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp(`(${safe})`, "ig"), "<mark>$1</mark>");
  }

  function renderFlowDiagram(title, steps) {
    const label = `${title}: ${steps.join(" to ")}`;
    return `
      <article class="flow-diagram" role="img" tabindex="0" aria-label="${escapeHtml(label)}">
        <strong>${escapeHtml(title)}</strong>
        <div>
          ${steps.map((step, index) => `<span>${escapeHtml(step)}</span>${index < steps.length - 1 ? "<b>-></b>" : ""}`).join("")}
        </div>
      </article>
    `;
  }

  function glossaryTerms() {
    return [
      { term: "Asset index", section: "Market", body: "The fictional price level used to value each asset category." },
      { term: "Bias watch", section: "Market", body: "The behaviour trap highlighted by a Market/Life card." },
      { term: "Choice Spaces", section: "Movement", body: "Board spaces where the player chooses between two trade-offs." },
      { term: "Diversification", section: "Scoring", body: "Holding multiple asset categories instead of relying on one category." },
      { term: "ESG", section: "Ethics", body: "Environmental, social, and governance factors used in responsible investing." },
      { term: "FOMO", section: "Market", body: "Fear of missing out; in the game it appears in hype-driven choices." },
      { term: "Liquidity", section: "Risk", body: "How easily cash or an asset can cover expenses without forced selling." },
      { term: "Market Pulse", section: "Market", body: "A board space that reveals a Market/Life card and updates shared indexes." },
      { term: "Risk management", section: "Scoring", body: "The score category for evidence, cash buffer, diversification, and avoiding unmanaged losses." },
      { term: "Risk-return", section: "Risk", body: "The trade-off between possible reward and possible loss." },
      { term: "Volatility", section: "Market", body: "How much an asset price can move up or down." }
    ].sort((a, b) => a.term.localeCompare(b.term));
  }

  function renderGlossary(terms, query) {
    if (!terms.length) {
      return `<div class="empty-state">No glossary terms match the search.</div>`;
    }
    const groups = new Map();
    terms.forEach((term) => {
      const letter = term.term[0].toUpperCase();
      groups.set(letter, [...(groups.get(letter) ?? []), term]);
    });
    return [...groups.entries()]
      .map(
        ([letter, items]) => `
          <section class="glossary-group" id="glossary-${letter}">
            <h3>${letter}</h3>
            ${items
              .map((term) => `<button class="glossary-term" type="button" data-action="open-help-topic" data-topic="${escapeHtml(term.section)}"><strong>${highlightMatch(term.term, query)}</strong><span>${highlightMatch(term.body, query)}</span></button>`)
              .join("")}
          </section>
        `
      )
      .join("");
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
      { title: "FAQ: physical deck mismatch", body: "If the entered card ID does not match the app-synced deck, check the printed draw pile and discard pile, then continue only after the host agrees which card was drawn." },
      { title: "FAQ: ending a turn", body: "End Turn is available after the space is resolved, one evidence note is selected or typed, and the physical checklist is complete." },
      { title: "Volatility", body: "How much an asset price can move up or down. High volatility can raise gains and losses." },
      { title: "Diversification", body: "Holding multiple asset categories instead of relying on one category." },
      { title: "Liquidity", body: "How easily cash or an asset can cover expenses without forced selling." },
      { title: "Risk-return", body: "The trade-off between possible reward and possible loss." },
      { title: "FOMO", body: "Fear of missing out. In the game, it appears in hype-driven market choices." },
      { title: "ESG", body: "Environmental, social, and governance factors that can affect ethical and financial decisions." },
      { title: "Troubleshooting", body: "If Supabase saving fails, retry from the status panel before continuing important table actions. The physical board and printed cards still explain the rules." }
    ].map((section) => ({ ...section, slug: section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
  }

  function renderToast() {
    return model.message ? `<div class="toast" role="status">${escapeHtml(model.message)}</div>` : "";
  }

  async function createGuestAuth(name) {
    if (!model.backend.online || !model.backend.client) {
      throw new Error("Supabase is not connected. Reload or retry the Supabase connection.");
    }
    return {
      mode: "guest",
      id: getClientId(),
      name,
      email: null
    };
  }

  async function createAccountAuth(name, email, password) {
    if (!model.backend.online || !model.backend.client) {
      throw new Error("Supabase is not connected. Account signup is unavailable.");
    }
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

  async function loginAccountAuth(email, password) {
    if (!model.backend.online || !model.backend.client) {
      throw new Error("Supabase is not connected. Account login is unavailable.");
    }
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
      setMessage(error.message ?? `Could not join ${code} through Supabase.`);
      render();
    }
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
        setSaveState("failed", error.message ?? "Supabase guest hosting failed.");
        setMessage(error.message ?? "Supabase guest hosting failed.");
        render();
        return;
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
      try {
        model.auth = await createAccountAuth(name, email, password);
        writeStore(STORAGE.auth, model.auth);
        beginFreshHostSession();
        return;
      } catch (error) {
        setMessage(error.message ?? "Supabase account creation is unavailable right now.");
        render();
        return;
      }
    }

    try {
      model.auth = await loginAccountAuth(email, password);
      writeStore(STORAGE.auth, model.auth);
      beginFreshHostSession();
      return;
    } catch (error) {
      setMessage(error.message ?? "Supabase login is unavailable or the credentials are incorrect.");
      render();
      return;
    }
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
      case "set-companion-mode":
        model.ui.companionMode = button.dataset.mode || "host";
        persistUi();
        render();
        break;
      case "toggle-reduced-motion":
        model.ui.reducedMotion = !model.ui.reducedMotion;
        persistUi();
        render();
        break;
      case "speak":
        speak(button.dataset.speak);
        break;
      case "set-dice-mode":
        model.ui.diceMode = button.dataset.mode || "digital";
        persistUi();
        render();
        if (model.ui.diceMode === "physical") {
          window.setTimeout(() => document.getElementById("physicalDie")?.focus(), 0);
        }
        break;
      case "board-zoom":
        model.ui.boardZoom = clamp(model.ui.boardZoom + Number(button.dataset.zoom ?? 0), 0.75, 2.2);
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
            body: "There may be unsaved Supabase changes. Leaving now exits the table view.",
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
        if (!window.confirm("Create a new Supabase table? Current table state will be replaced on this device.")) {
          break;
        }
        resetSession();
        break;
      case "copy-session-code":
        copySessionCode();
        break;
      case "open-profile-picker":
        if (!requireHostAction()) break;
        openDialog({
          type: "profile-picker",
          index: Number(button.dataset.index ?? 0)
        });
        break;
      case "start-session":
        if (!requireHostAction()) break;
        startSession();
        break;
      case "select-profile": {
        if (!requireHostAction()) break;
        const index = Number(button.dataset.index);
        const profileId = button.dataset.profileId;
        if (model.session.draft.players[index] && profileId) {
          model.session.draft.players[index].profileId = profileId;
          model.ui.dialog = null;
          saveSession();
          render();
        }
        break;
      }
      case "roll-die":
        if (!requireHostAction()) break;
        rollDie();
        break;
      case "cancel-roll":
        if (!requireHostAction()) break;
        cancelRoll();
        break;
      case "submit-physical-roll": {
        if (!requireHostAction()) break;
        const value = Number(model.ui.pendingPhysicalDie ?? document.getElementById("physicalDie")?.value);
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
        setPhysicalDieDraft(button.dataset.roll);
        render();
        window.setTimeout(() => document.getElementById("physicalDie")?.focus(), 0);
        break;
      case "clear-physical-roll":
        if (!requireHostAction()) break;
        clearPhysicalDieDraft();
        render();
        break;
      case "confirm-pawn-space":
        if (!requireHostAction()) break;
        if (model.session.pendingResolution) {
          model.session.pendingResolution.physicalPawnConfirmed = true;
          model.session.physicalChecks.pawnMoved = true;
          if (model.session.lastPhysicalMove) {
            model.session.lastPhysicalMove.confirmed = true;
          }
          saveSession();
          render();
        }
        break;
      case "use-card-for-turn": {
        if (!requireHostAction()) break;
        const value = document.getElementById("physicalCardId")?.value || document.getElementById("cardLookupId")?.value || model.ui.cardLookupId;
        model.ui.cardLookupId = normaliseCardId(value);
        applyPrintedCardId(value);
        break;
      }
      case "use-next-card":
        if (!requireHostAction()) break;
        useSyncedCardForPending();
        break;
      case "preview-card-id": {
        const value = document.getElementById("cardLookupId")?.value || document.getElementById("physicalCardId")?.value || model.ui.cardLookupId;
        const lookup = findCardByPrintedId(value);
        model.ui.cardLookupId = normaliseCardId(value);
        if (!lookup) {
          setMessage(`No printed card found for ${normaliseCardId(value)}.`);
          render();
          break;
        }
        openCardLookupDialog(lookup.deckKey, lookup.card, []);
        break;
      }
      case "lookup-space-id": {
        const value = normaliseSpaceId(document.getElementById("boardLookupId")?.value || model.ui.boardLookupId);
        if (!getSpace(value)) {
          setMessage(`No board space found for ${value}. Use S00-S43.`);
          render();
          break;
        }
        model.ui.boardLookupId = value;
        model.ui.selectedBoardSpaceId = value;
        render();
        break;
      }
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
        model.ui.turnNoteDraft = note;
        model.session.physicalChecks.evidenceNote = true;
        if (input) {
          input.value = note;
          input.focus();
        }
        render();
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
        model.ui.selectedBoardSpaceId = space?.id ?? "S00";
        openDialog({
          eyeline: space?.type ?? "Board space",
          title: `${space?.id ?? ""} ${space?.label ?? ""}`,
          body: `${meta.help} ${space?.effect ?? space?.choices?.join(" ") ?? ""}`.trim(),
          helpTopic: space?.type ?? "Movement"
        });
        break;
      }
      case "select-board-space": {
        const spaceId = button.dataset.spaceId ?? "S00";
        model.ui.selectedBoardSpaceId = spaceId;
        if (model.ui.dialog?.type === "board") {
          model.ui.dialog = { ...model.ui.dialog, selectedSpaceId: spaceId };
        }
        render();
        break;
      }
      case "dialog-help-topic": {
        const topic = button.dataset.topic ?? "";
        closeDialog();
        model.session.view = "rules";
        model.ui.rulesQuery = topic;
        saveSession();
        render();
        break;
      }
      case "open-help-topic": {
        const topic = String(button.dataset.topic ?? "").toLowerCase();
        const aliases = {
          "risk management": "scoring",
          "scoring formula": "scoring"
        };
        const target = aliases[topic] ?? topic;
        const section = helpSections().find((item) => item.title.toLowerCase().includes(target));
        if (section) {
          model.ui.rulesQuery = "";
          render();
          window.setTimeout(() => document.getElementById(`help-${section.slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        }
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
      case "download-csv":
        downloadCsv();
        break;
      case "print-summary":
        printSummary();
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
    if (event.target.matches("[data-market-filter]")) {
      model.ui.marketFilters[event.target.dataset.marketFilter] = event.target.value;
      render();
    }
    if (event.target.matches("[data-physical-check]")) {
      const key = event.target.dataset.physicalCheck;
      model.session.physicalChecks[key] = Boolean(event.target.checked);
      saveSession();
      render();
    }
    if (event.target.matches("[data-setup-check]")) {
      const key = event.target.dataset.setupCheck;
      model.ui.setupChecklist[key] = Boolean(event.target.checked);
      persistUi();
      render();
    }
    if (event.target.matches("[data-assist-player]")) {
      model.ui.selectedAssistPlayerId = event.target.value;
      persistUi();
      render();
    }
  }

  function handleInput(event) {
    if (event.target.matches('[data-draft="name"]')) {
      updateDraftFromInputs();
    }
    if (event.target.matches("[data-turn-note]")) {
      model.ui.turnNoteDraft = event.target.value;
      model.session.physicalChecks.evidenceNote = Boolean(event.target.value.trim());
      render();
      const note = document.getElementById("turnNote");
      note?.focus();
      note?.setSelectionRange(note.value.length, note.value.length);
    }
    if (event.target.id === "cardLookupId" || event.target.id === "physicalCardId") {
      model.ui.cardLookupId = normaliseCardId(event.target.value);
    }
    if (event.target.id === "physicalDie") {
      const value = Number(event.target.value);
      if (Number.isInteger(value) && value >= 1 && value <= 6) {
        setPhysicalDieDraft(value);
      } else {
        model.ui.pendingPhysicalDie = null;
        announce("Physical die entry cleared.");
      }
    }
    if (event.target.id === "boardLookupId") {
      model.ui.boardLookupId = normaliseSpaceId(event.target.value);
    }
    if (event.target.id === "joinCode") {
      const raw = String(event.target.value ?? "").toUpperCase().replace(/[^GT0-9]/g, "");
      const digits = raw.replace(/[^0-9]/g, "").slice(0, 4);
      event.target.value = digits ? `GT-${digits}` : "GT-";
      if (digits.length === 4) {
        event.target.setCustomValidity("");
      } else {
        event.target.setCustomValidity("Use a session code like GT-4827.");
      }
    }
    if (event.target.matches("[data-rules-search]")) {
      model.ui.rulesQuery = event.target.value;
      render();
      const search = document.getElementById("rulesSearch");
      search?.focus();
      search?.setSelectionRange(search.value.length, search.value.length);
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && model.ui.dialog) {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === "Enter" && event.target?.id === "physicalDie") {
      event.preventDefault();
      if (!requireHostAction()) return;
      const value = Number(model.ui.pendingPhysicalDie ?? event.target.value);
      if (!Number.isInteger(value) || value < 1 || value > 6) {
        setMessage("Enter a physical D6 result from 1 to 6.");
        render();
        return;
      }
      rollDie(value);
      return;
    }
    if (event.key === "Enter" && (event.target?.id === "physicalCardId" || event.target?.id === "cardLookupId")) {
      event.preventDefault();
      if (event.target.id === "physicalCardId" && model.session.pendingResolution) {
        if (!requireHostAction()) return;
        applyPrintedCardId(event.target.value);
      } else {
        const lookup = findCardByPrintedId(event.target.value);
        if (lookup) {
          openCardLookupDialog(lookup.deckKey, lookup.card, []);
        } else {
          setMessage(`No printed card found for ${normaliseCardId(event.target.value)}.`);
          render();
        }
      }
      return;
    }
    if (event.key === "Enter" && event.target?.id === "boardLookupId") {
      event.preventDefault();
      const value = normaliseSpaceId(event.target.value);
      if (getSpace(value)) {
        model.ui.boardLookupId = value;
        model.ui.selectedBoardSpaceId = value;
        render();
      } else {
        setMessage(`No board space found for ${value}. Use S00-S43.`);
        render();
      }
      return;
    }
    if (event.key !== "Tab" || !model.ui.dialog) {
      return;
    }
    const focusable = Array.from(appRoot.querySelectorAll("[data-dialog-card] button, [data-dialog-card] input, [data-dialog-card] textarea, [data-dialog-card] select, [data-dialog-card] summary, [data-dialog-card] [tabindex]:not([tabindex='-1'])"))
      .filter((item) => !item.disabled && item.offsetParent !== null);
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function afterRender() {
    if (!model.session) {
      return;
    }
    const phase = model.session.phase;
    if (phase && phase !== model.ui.lastPhase) {
      model.ui.lastPhase = phase;
      window.setTimeout(() => {
        const target = appRoot.querySelector(`[data-phase-section="${phase}"]`);
        target?.scrollIntoView({ behavior: model.ui.reducedMotion ? "auto" : "smooth", block: "start" });
      }, 0);
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
    appRoot.addEventListener("keydown", handleKeydown);

    try {
      model.game = await loadGame();
      model.indexes = buildIndexes(model.game);
      await probeBackend();
      model.auth = readStore(STORAGE.auth, null);
      if (!model.auth) {
        model.session = createSession();
        model.backend.clientRole = null;
      } else {
        model.session = ensureSessionShape(readStore(STORAGE.session, null) ?? createSession());
        restoreBackendState();
        if (!model.backend.clientRole && !model.backend.sessionId) {
          model.backend.clientRole = "host";
        }
        saveSession();
        startBackendPoller();
      }
    } catch (error) {
      model.configError = error;
    }
    render();
  }

  init();
})();
