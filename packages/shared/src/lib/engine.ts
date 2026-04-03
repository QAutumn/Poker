import { buildDeck, drawCards, parseCard, shuffleDeck } from "./cards";
import { calculateMultiwayEquity, summarizeBoardTexture } from "./equity";
import { compareHands, describeEvaluatedHand, evaluateSevenCards } from "./evaluator";
import type {
  ActionLog,
  ActionType,
  AllowedAction,
  BotStrategyMode,
  CardCode,
  HandResult,
  HandState,
  PlayerDecision,
  PlayerProfile,
  PlayerState,
  SessionOptions,
  TournamentMeta,
} from "./types";

const STARTING_STACK = 200;
const MAX_BOTS = 5;
const PROFILE_POOL: PlayerProfile[] = ["aggressive", "balanced", "careful"];
const BOT_NAME_POOL = [
  "North Rail",
  "Delta Shark",
  "Luna Ace",
  "Mika River",
  "Stone Pot",
  "Velvet Stack",
  "Ivy Bluff",
  "Copper Tell",
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const nextId = () => Math.random().toString(36).slice(2, 10);
const clonePlayers = (players: PlayerState[]) => players.map((player) => ({ ...player, cards: [...player.cards] }));
const totalPot = (state: HandState) => state.pot + state.players.reduce((sum, player) => sum + player.bet, 0);

const getHero = (state: HandState) => state.players.find((player) => player.isHero)!;
const getBots = (state: HandState) => state.players.filter((player) => !player.isHero);
const getActivePlayers = (state: HandState) => state.players.filter((player) => !player.folded);
const getActiveBots = (state: HandState) => state.players.filter((player) => !player.isHero && !player.folded);
const amountToCall = (state: HandState, player: PlayerState) => Math.max(0, state.currentBet - player.bet);
const getBotStrategyMode = (state: HandState): BotStrategyMode => (getBots(state).length === 1 ? "hu-gto" : "multiway-heuristic");

const nextActiveIndex = (state: HandState, startIndex: number): number => {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (startIndex + offset) % state.players.length;
    const player = state.players[index]!;
    if (!player.folded && !player.allIn) return index;
  }
  return startIndex;
};

const resolveBlindPositions = (state: HandState, buttonIndex: number) => {
  if (state.players.length === 2) {
    const smallBlindIndex = buttonIndex;
    const bigBlindIndex = nextActiveIndex(state, buttonIndex);
    const preflopActorIndex = buttonIndex;
    return { smallBlindIndex, bigBlindIndex, preflopActorIndex };
  }

  const smallBlindIndex = nextActiveIndex(state, buttonIndex);
  const bigBlindIndex = nextActiveIndex(state, smallBlindIndex);
  const preflopActorIndex = nextActiveIndex(state, bigBlindIndex);
  return { smallBlindIndex, bigBlindIndex, preflopActorIndex };
};

const resetBetsForStreet = (state: HandState) => {
  state.players = state.players.map((player) => ({ ...player, bet: 0, acted: false }));
  state.currentBet = 0;
  state.minRaiseTo = state.tournament?.bigBlind ?? 4;
};

const postBlind = (player: PlayerState, blind: number) => {
  const amount = Math.min(player.stack, blind);
  player.stack -= amount;
  player.bet += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
};

const normalizeBotCount = (count: number | undefined) => clamp(Math.round(count ?? 1), 1, MAX_BOTS);

const shuffled = <T>(items: T[], seed: number) => shuffleDeck([...items] as T[] as CardCode[], seed) as T[];

const createRandomProfiles = (botCount: number): PlayerProfile[] => {
  const profiles = Array.from({ length: botCount }, (_, index) => PROFILE_POOL[(Date.now() + index * 7) % PROFILE_POOL.length]!);
  for (let index = profiles.length - 1; index > 0; index -= 1) {
    const target = (Date.now() + index * 13) % (index + 1);
    [profiles[index], profiles[target]] = [profiles[target]!, profiles[index]!];
  }

  if (botCount > 1 && new Set(profiles).size === 1) {
    profiles[profiles.length - 1] = PROFILE_POOL[(PROFILE_POOL.indexOf(profiles[0]!) + 1) % PROFILE_POOL.length]!;
  }

  return profiles;
};

const scoreStartingHand = (cards: CardCode[]): number => {
  const left = parseCard(cards[0]!);
  const right = parseCard(cards[1]!);
  const pair = left.value === right.value;
  const suited = left.suit === right.suit;
  const gap = Math.abs(left.value - right.value);
  return left.value + right.value + (pair ? 12 : 0) + (suited ? 2 : 0) + Math.max(0, 5 - gap);
};

const detectDrawProfile = (cards: CardCode[], board: CardCode[]) => {
  if (board.length < 3) return { flushDraw: false, openEnded: false, gutshot: false };

  const parsed = [...cards, ...board].map(parseCard);
  const suitCounts = new Map<string, number>();
  parsed.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1));
  const flushDraw = [...suitCounts.values()].some((count) => count >= 4);

  const values = [...new Set(parsed.map((card) => card.value))].sort((left, right) => left - right);
  if (values.includes(14)) values.unshift(1);

  let openEnded = false;
  let gutshot = false;
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const hits = window.filter((value) => values.includes(value));
    if (hits.length === 4) {
      const missing = window.find((value) => !values.includes(value));
      if (missing === start || missing === start + 4) openEnded = true;
      else gutshot = true;
    }
  }

  return { flushDraw, openEnded, gutshot };
};

const isPocketPair = (cards: CardCode[]) => cards.length === 2 && parseCard(cards[0]!).value === parseCard(cards[1]!).value;
const boardValues = (board: CardCode[]) => board.map((card) => parseCard(card).value);
const profileMixShift = (profile: PlayerProfile) =>
  profile === "aggressive" ? 0.12 : profile === "careful" ? -0.12 : 0;
const mixByProfile = (base: number, profile: PlayerProfile) => clamp01(base + profileMixShift(profile));
const chooseWeightedDecision = (choices: Array<{ weight: number; decision: PlayerDecision }>, fallback: PlayerDecision) => {
  const validChoices = choices.filter((choice) => choice.weight > 0);
  if (validChoices.length === 0) return fallback;

  const totalWeight = validChoices.reduce((sum, choice) => sum + choice.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const choice of validChoices) {
    cursor -= choice.weight;
    if (cursor <= 0) return choice.decision;
  }

  return validChoices.at(-1)?.decision ?? fallback;
};
const fitTargetAmount = (action: AllowedAction | undefined, target: number | undefined) => {
  if (!action) return undefined;
  const min = action.min ?? action.amount ?? 0;
  const max = action.max ?? action.amount ?? min;
  return clamp(Math.round(target ?? action.amount ?? min), min, max);
};
const withActionAmount = (
  action: AllowedAction | undefined,
  fallbackType: ActionType,
  target: number | undefined,
  note: string,
): PlayerDecision => {
  const amount = fitTargetAmount(action, target);
  return amount === undefined
    ? { type: action?.type ?? fallbackType, note }
    : { type: action?.type ?? fallbackType, amount, note };
};
const fallbackDecisionFor = (legalActions: AllowedAction[]): PlayerDecision =>
  legalActions.some((action) => action.type === "check") ? { type: "check" } : { type: "fold" };
const botEquityShare = (state: HandState) => clamp01(state.equity.lossRate + state.equity.tieRate * 0.5);
const boardIsDry = (texture: string) => texture.includes("偏干燥");
const boardIsWet = (texture: string) => texture.includes("偏连张") || texture.includes("偏同花面") || texture.includes("同花面");

const hasTopPair = (cards: CardCode[], board: CardCode[]) => {
  if (board.length === 0) return false;
  const topBoardValue = Math.max(...boardValues(board));
  return cards.some((card) => parseCard(card).value === topBoardValue);
};

const hasOverpair = (cards: CardCode[], board: CardCode[]) => {
  if (board.length === 0 || !isPocketPair(cards)) return false;
  return parseCard(cards[0]!).value > Math.max(...boardValues(board));
};

const describePlayerRead = (player: PlayerState, board: CardCode[]) => {
  const texture = summarizeBoardTexture(board);
  const preflopScore = scoreStartingHand(player.cards);
  if (board.length === 0) {
    if (preflopScore >= 36) return "顶端强牌 / 偏 3bet 继续";
    if (preflopScore >= 28) return "中高张范围 / 可继续施压";
    if (preflopScore >= 22) return "同花连张与口袋对子";
    return "边缘防守范围";
  }

  const madeCategory = evaluateSevenCards([...player.cards, ...board]).category;
  const draws = detectDrawProfile(player.cards, board);
  if (madeCategory >= 5) return `${texture} / 强价值`;
  if (madeCategory >= 2 || hasOverpair(player.cards, board) || hasTopPair(player.cards, board)) return `${texture} / 一对以上`;
  if (draws.flushDraw || draws.openEnded) return `${texture} / 听牌半诈唬`;
  return `${texture} / 空气或弱摊牌`;
};

const describeTablePressure = (state: HandState) => {
  const activeBots = getActiveBots(state);
  if (activeBots.length === 0) return "桌上没有活跃电脑";

  const focus =
    state.players[state.currentPlayerIndex]?.isHero
      ? activeBots[0]!
      : (state.players[state.currentPlayerIndex] ?? activeBots[0])!;

  const strategyPrefix = state.botStrategyMode === "hu-gto" ? "HU 近似 GTO" : `${activeBots.length} 个电脑在局`;
  return `${strategyPrefix} · ${focus.name} ${focus.profile} · ${describePlayerRead(focus, state.board)}`;
};

const updateDerivedState = (state: HandState) => {
  const hero = getHero(state);
  const opponents = getActiveBots(state).map((player) => player.cards);
  state.botStrategyMode = getBotStrategyMode(state);
  state.equity = calculateMultiwayEquity(hero.cards, opponents, state.board);
  state.villainRangeHint = describeTablePressure(state);
};

const generateAllowedActionsFor = (state: HandState, playerIndex = state.currentPlayerIndex): AllowedAction[] => {
  const player = state.players[playerIndex]!;
  if (state.street === "showdown" || player.folded || player.allIn) return [];

  const callAmount = amountToCall(state, player);
  const max = player.stack + player.bet;
  const potBased = Math.max(totalPot(state), 1);
  const options: AllowedAction[] = [];

  if (callAmount > 0) {
    options.push({ type: "fold", label: "弃牌" });
    options.push({ type: "call", label: `跟注 ${callAmount}`, amount: callAmount });
    if (max > state.currentBet) {
      const raiseTarget = Math.min(max, Math.max(state.minRaiseTo, state.currentBet + Math.round(potBased * 0.66)));
      options.push({
        type: "raise",
        label: `加注到 ${raiseTarget}`,
        min: state.minRaiseTo,
        max,
        amount: raiseTarget,
      });
    }
  } else {
    options.push({ type: "check", label: "过牌" });
    if (player.stack > 0) {
      if (state.currentBet === 0) {
        const betAmount = Math.min(max, Math.max(2, Math.round(potBased * 0.66)));
        options.push({
          type: "bet",
          label: `下注 ${betAmount}`,
          min: 2,
          max,
          amount: betAmount,
        });
      } else if (max > state.currentBet) {
        const raiseTarget = Math.min(max, Math.max(state.minRaiseTo, state.currentBet + Math.round(potBased * 0.66)));
        options.push({
          type: "raise",
          label: `加注到 ${raiseTarget}`,
          min: state.minRaiseTo,
          max,
          amount: raiseTarget,
        });
      }
    }
  }

  if (player.stack > 0 && !options.some((option) => option.type === "all-in")) {
    options.push({
      type: "all-in",
      label: `全下 ${max}`,
      amount: max,
      min: max,
      max,
    });
  }

  return options;
};

const generateAllowedActions = (state: HandState) => {
  const player = state.players[state.currentPlayerIndex]!;
  if (!player.isHero) return [];
  return generateAllowedActionsFor(state, state.currentPlayerIndex);
};

const logAction = (state: HandState, actor: PlayerState, action: ActionType, amount: number, note?: string) => {
  const entry: ActionLog = {
    street: state.street,
    actorId: actor.id,
    actorName: actor.name,
    action,
    amount,
    potAfter: totalPot(state),
    ...(note ? { note } : {}),
  };
  state.actionLog.push(entry);
};

const collectPotAndAward = (
  state: HandState,
  winnerIds: string[],
  reason: HandResult["reason"],
  description: string,
  foldedByIds?: string[],
): HandResult => {
  const pending = state.players.reduce((sum, player) => sum + player.bet, 0);
  const pot = state.pot + pending;
  const share = Math.floor(pot / winnerIds.length);
  const remainder = pot - share * winnerIds.length;

  state.players = state.players.map((player) => {
    const winnerIndex = winnerIds.indexOf(player.id);
    const gain = winnerIndex >= 0 ? share + (winnerIndex === 0 ? remainder : 0) : 0;
    return { ...player, stack: player.stack + gain, bet: 0 };
  });

  return {
    reason,
    winnerIds,
    description,
    board: [...state.board],
    pot,
    ...(foldedByIds && foldedByIds.length > 0 ? { foldedByIds } : {}),
  };
};

const buildFoldWinDescription = (state: HandState, winner: PlayerState) => {
  const foldedOpponents = state.players.filter((player) => player.id !== winner.id && player.folded);
  if (foldedOpponents.length === 1) {
    return `${foldedOpponents[0]!.name} 弃牌，${winner.name} 赢下底池`;
  }

  if (foldedOpponents.length > 1) {
    return `其余玩家弃牌，${winner.name} 赢下底池`;
  }

  return `${winner.name} 赢下底池`;
};

const resolveOnlyOnePlayerLeft = (state: HandState) => {
  const winner = getActivePlayers(state)[0];
  if (!winner) return;
  state.street = "showdown";
  const foldedByIds = state.players.filter((player) => player.id !== winner.id && player.folded).map((player) => player.id);
  state.result = collectPotAndAward(state, [winner.id], "fold", buildFoldWinDescription(state, winner), foldedByIds);
  state.nextActions = [];
};

const resolveShowdown = (state: HandState) => {
  const contenders = getActivePlayers(state);
  const evaluated = contenders.map((player) => ({
    player,
    hand: evaluateSevenCards([...player.cards, ...state.board]),
  }));

  let best = evaluated[0]!;
  let winners = [best];
  for (const current of evaluated.slice(1)) {
    const comparison = compareHands(current.hand, best.hand);
    if (comparison > 0) {
      best = current;
      winners = [current];
    } else if (comparison === 0) {
      winners.push(current);
    }
  }

  const winnerIds = winners.map((entry) => entry.player.id);
  const description =
    winners.length === 1
      ? `${winners[0]!.player.name} ${describeEvaluatedHand(winners[0]!.hand)}`
      : `平分底池，最佳牌型 ${describeEvaluatedHand(winners[0]!.hand)}`;

  state.result = collectPotAndAward(state, winnerIds, "showdown", description);
  state.nextActions = [];
};

const advanceStreet = (state: HandState) => {
  state.pot += state.players.reduce((sum, player) => sum + player.bet, 0);
  resetBetsForStreet(state);

  if (state.street === "preflop") {
    const [flop, deck] = drawCards(state.deck, 3);
    state.board = flop;
    state.deck = deck;
    state.street = "flop";
  } else if (state.street === "flop") {
    const [turn, deck] = drawCards(state.deck, 1);
    state.board = [...state.board, ...turn];
    state.deck = deck;
    state.street = "turn";
  } else if (state.street === "turn") {
    const [river, deck] = drawCards(state.deck, 1);
    state.board = [...state.board, ...river];
    state.deck = deck;
    state.street = "river";
  } else {
    state.street = "showdown";
    resolveShowdown(state);
    return;
  }

  state.currentPlayerIndex = nextActiveIndex(state, state.buttonIndex);
  updateDerivedState(state);
};

const canAdvanceRound = (state: HandState) => {
  const active = getActivePlayers(state);
  if (active.length <= 1) return true;
  return active.every((player) => player.allIn || (player.acted && player.bet === state.currentBet));
};

const normalizeDecision = (state: HandState, playerId: string, decision: PlayerDecision): PlayerDecision => {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  const legalActions = generateAllowedActionsFor(state, playerIndex);
  const matched = legalActions.find((action) => action.type === decision.type) ?? legalActions[0];
  if (!matched) return { type: "fold" };

  if (matched.type === "bet" || matched.type === "raise" || matched.type === "all-in") {
    const min = matched.min ?? matched.amount ?? 0;
    const max = matched.max ?? matched.amount ?? min;
    return {
      type: matched.type,
      amount: clamp(Math.round(decision.amount ?? matched.amount ?? min), min, max),
      ...(decision.note ? { note: decision.note } : {}),
    };
  }

  return {
    type: matched.type,
    ...(matched.amount !== undefined ? { amount: matched.amount } : {}),
    ...(decision.note ? { note: decision.note } : {}),
  };
};

const maybeUpdateTournament = (state: HandState) => {
  if (!state.tournament) return;

  state.tournament = {
    ...state.tournament,
    handsUntilLevelUp: Math.max(0, state.tournament.handsUntilLevelUp - 1),
    opponents: getBots(state).map((entry) => ({
      id: entry.id,
      name: entry.name,
      stack: entry.stack,
      eliminated: entry.stack <= 0,
    })),
  };

  if (state.tournament.handsUntilLevelUp === 0) {
    state.tournament = {
      ...state.tournament,
      level: state.tournament.level + 1,
      smallBlind: state.tournament.smallBlind + 1,
      bigBlind: state.tournament.bigBlind + 2,
      handsUntilLevelUp: 5,
    };
  }
};

const settleHand = (state: HandState) => {
  maybeUpdateTournament(state);
  state.nextActions = [];
};

const applyDecision = (state: HandState, playerId: string, decision: PlayerDecision) => {
  const normalizedDecision = normalizeDecision(state, playerId, decision);
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  const player = state.players[playerIndex]!;
  const toCall = amountToCall(state, player);

  if (normalizedDecision.type === "fold") {
    player.folded = true;
    player.acted = true;
    logAction(state, player, "fold", 0, normalizedDecision.note);
    if (getActivePlayers(state).length === 1) {
      resolveOnlyOnePlayerLeft(state);
      settleHand(state);
      return;
    }
  } else if (normalizedDecision.type === "check") {
    player.acted = true;
    logAction(state, player, "check", 0, normalizedDecision.note);
  } else if (normalizedDecision.type === "call") {
    const amount = Math.min(player.stack, toCall);
    player.stack -= amount;
    player.bet += amount;
    player.acted = true;
    if (player.stack === 0) player.allIn = true;
    logAction(state, player, "call", amount, normalizedDecision.note);
  } else {
    const previousBet = state.currentBet;
    const target =
      normalizedDecision.type === "all-in"
        ? player.bet + player.stack
        : Math.max(normalizedDecision.amount ?? state.minRaiseTo, normalizedDecision.type === "bet" ? 2 : state.minRaiseTo);
    const invest = Math.min(player.stack, target - player.bet);
    player.stack -= invest;
    player.bet += invest;
    player.acted = true;
    player.allIn = player.stack === 0;
    state.currentBet = Math.max(state.currentBet, player.bet);
    const raiseSize = Math.max(player.bet - previousBet, 2);
    state.minRaiseTo = state.currentBet + raiseSize;
    state.players = state.players.map((entry) =>
      entry.id === player.id ? player : { ...entry, acted: entry.folded || entry.allIn },
    );
    logAction(state, player, normalizedDecision.type, invest, normalizedDecision.note);
  }

  updateDerivedState(state);

  if (state.street !== "showdown") {
    if (canAdvanceRound(state)) {
      advanceStreet(state);
      if (state.result) {
        settleHand(state);
      }
    } else {
      state.currentPlayerIndex = nextActiveIndex(state, playerIndex);
    }
  }

  state.nextActions = generateAllowedActions(state);
};

const heuristicBotDecision = (state: HandState, botId: string): PlayerDecision => {
  const bot = state.players.find((player) => player.id === botId)!;
  const legalActions = generateAllowedActionsFor(state, state.players.findIndex((player) => player.id === botId));
  const toCall = amountToCall(state, bot);
  const handScore = scoreStartingHand(bot.cards);
  const pressure = totalPot(state);
  const potOdds = toCall > 0 ? toCall / Math.max(pressure + toCall, 1) : 0;
  const betAction = legalActions.find((action) => action.type === "bet");
  const raiseAction = legalActions.find((action) => action.type === "raise");
  const allInAction = legalActions.find((action) => action.type === "all-in");
  const pressureAction = raiseAction ?? betAction;
  const profileBias = bot.profile === "aggressive" ? 0.05 : bot.profile === "careful" ? -0.05 : 0;

  const fitSize = (action: AllowedAction, target: number) => {
    const min = action.min ?? action.amount ?? 0;
    const max = action.max ?? action.amount ?? min;
    return clamp(Math.round(target), min, max);
  };

  if (state.street === "preflop") {
    if (toCall > 0) {
      if (handScore >= 36 && raiseAction) return { type: "raise", amount: fitSize(raiseAction, state.currentBet + pressure * 0.8) };
      if (handScore >= 28) return { type: "call" };
      if (handScore >= 22 && potOdds <= 0.2 + profileBias) return { type: "call" };
      return legalActions.some((action) => action.type === "fold") ? { type: "fold" } : { type: "check" };
    }

    if (pressureAction && (handScore >= 30 || (handScore >= 25 && bot.profile === "aggressive"))) {
      return { type: pressureAction.type, amount: fitSize(pressureAction, pressure * 0.55) };
    }
    return { type: "check" };
  }

  const madeCategory = evaluateSevenCards([...bot.cards, ...state.board]).category;
  const draws = detectDrawProfile(bot.cards, state.board);
  const strongDraw = draws.flushDraw || draws.openEnded;
  const comboDraw = draws.flushDraw && (draws.openEnded || draws.gutshot);
  const topPair = hasTopPair(bot.cards, state.board);
  const overpair = hasOverpair(bot.cards, state.board);

  if (toCall > 0) {
    if ((madeCategory >= 6 || (madeCategory >= 5 && allInAction && pressure > STARTING_STACK / 2)) && allInAction) {
      return { type: "all-in", amount: allInAction.amount! };
    }
    if (madeCategory >= 4 && raiseAction) {
      return { type: "raise", amount: fitSize(raiseAction, state.currentBet + pressure * 0.8) };
    }
    if (madeCategory >= 2 || topPair || overpair) {
      if (raiseAction && bot.profile === "aggressive" && potOdds < 0.22) {
        return { type: "raise", amount: fitSize(raiseAction, state.currentBet + pressure * 0.6) };
      }
      return { type: "call" };
    }
    if ((strongDraw || comboDraw) && potOdds <= 0.28 + profileBias) {
      return bot.profile === "aggressive" && raiseAction && comboDraw
        ? { type: "raise", amount: fitSize(raiseAction, state.currentBet + pressure * 0.5) }
        : { type: "call" };
    }
    return legalActions.some((action) => action.type === "fold") ? { type: "fold" } : { type: "check" };
  }

  if (allInAction && madeCategory >= 6 && pressure > STARTING_STACK / 2) return { type: "all-in", amount: allInAction.amount! };
  if (betAction && madeCategory >= 4) return { type: "bet", amount: fitSize(betAction, pressure * 0.8) };
  if (betAction && (madeCategory >= 2 || topPair || overpair)) return { type: "bet", amount: fitSize(betAction, pressure * 0.55) };
  if (betAction && strongDraw) return { type: "bet", amount: fitSize(betAction, pressure * 0.48) };
  if (betAction && bot.profile !== "careful" && summarizeBoardTexture(state.board).includes("偏干燥")) {
    return { type: "bet", amount: fitSize(betAction, pressure * 0.34) };
  }
  return { type: "check" };
};

const huGtoBotDecision = (state: HandState, botId: string): PlayerDecision => {
  const botIndex = state.players.findIndex((player) => player.id === botId);
  const bot = state.players[botIndex]!;
  const legalActions = generateAllowedActionsFor(state, botIndex);
  const fallbackDecision = fallbackDecisionFor(legalActions);
  const toCall = amountToCall(state, bot);
  const pressure = totalPot(state);
  const handScore = scoreStartingHand(bot.cards);
  const texture = summarizeBoardTexture(state.board);
  const hasButton = state.buttonIndex === botIndex;
  const potOdds = toCall > 0 ? toCall / Math.max(pressure + toCall, 1) : 0;
  const betAction = legalActions.find((action) => action.type === "bet");
  const raiseAction = legalActions.find((action) => action.type === "raise");
  const allInAction = legalActions.find((action) => action.type === "all-in");
  const pressureAction = raiseAction ?? betAction;

  if (state.street === "preflop") {
    const openTarget = raiseAction ? state.currentBet * (hasButton ? 2.4 : 2.8) : pressure * 0.55;
    const threeBetTarget = state.currentBet + Math.max(pressure * 0.75, state.currentBet * 1.2);

    if (toCall > 0) {
      if (handScore >= 36) {
        return chooseWeightedDecision(
          [
            {
              weight: raiseAction ? mixByProfile(0.76, bot.profile) : 0,
              decision: withActionAmount(raiseAction, "call", threeBetTarget, "hu-gto premium aggression"),
            },
            { weight: 1, decision: { type: "call", note: "hu-gto premium continue" } },
          ],
          fallbackDecision,
        );
      }

      if (handScore >= 30) {
        return chooseWeightedDecision(
          [
            {
              weight: raiseAction ? mixByProfile(0.38, bot.profile) : 0,
              decision: withActionAmount(raiseAction, "call", threeBetTarget * 0.92, "hu-gto strong mixed raise"),
            },
            { weight: mixByProfile(0.68, bot.profile), decision: { type: "call", note: "hu-gto strong defend" } },
            { weight: 0.18, decision: { type: "fold", note: "hu-gto strong low-frequency fold" } },
          ],
          fallbackDecision,
        );
      }

      if (handScore >= 25 && potOdds <= (hasButton ? 0.28 : 0.34) + profileMixShift(bot.profile) * 0.35) {
        return chooseWeightedDecision(
          [
            {
              weight: raiseAction ? mixByProfile(hasButton ? 0.12 : 0.18, bot.profile) : 0,
              decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.55, "hu-gto mixed defend raise"),
            },
            { weight: mixByProfile(0.72, bot.profile), decision: { type: "call", note: "hu-gto mixed defend call" } },
            { weight: 0.24, decision: { type: "fold", note: "hu-gto mixed defend fold" } },
          ],
          fallbackDecision,
        );
      }

      if (handScore >= 21 && potOdds <= (hasButton ? 0.18 : 0.24) + profileMixShift(bot.profile) * 0.25) {
        return chooseWeightedDecision(
          [
            { weight: mixByProfile(0.42, bot.profile), decision: { type: "call", note: "hu-gto fringe defend" } },
            { weight: 0.58, decision: { type: "fold", note: "hu-gto fringe release" } },
          ],
          fallbackDecision,
        );
      }

      return legalActions.some((action) => action.type === "fold")
        ? { type: "fold", note: "hu-gto preflop fold" }
        : { type: "check", note: "hu-gto forced check" };
    }

    if (!pressureAction) return { type: "check", note: "hu-gto no open size" };

    if (handScore >= 36) {
      return withActionAmount(pressureAction, pressureAction.type, openTarget * 1.08, "hu-gto premium open");
    }
    if (handScore >= 30) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.84, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget, "hu-gto strong open") },
          { weight: 0.16, decision: { type: "check", note: "hu-gto strong trap check" } },
        ],
        fallbackDecision,
      );
    }
    if (handScore >= 24) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(hasButton ? 0.62 : 0.44, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget * 0.96, "hu-gto mixed open") },
          { weight: 1, decision: { type: "check", note: "hu-gto mixed check" } },
        ],
        fallbackDecision,
      );
    }
    if (handScore >= 20) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(hasButton ? 0.22 : 0.12, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget * 0.88, "hu-gto low-frequency stab") },
          { weight: 1, decision: { type: "check", note: "hu-gto low-frequency pass" } },
        ],
        fallbackDecision,
      );
    }

    return { type: "check", note: "hu-gto check back" };
  }

  const madeCategory = evaluateSevenCards([...bot.cards, ...state.board]).category;
  const draws = detectDrawProfile(bot.cards, state.board);
  const strongDraw = draws.flushDraw || draws.openEnded;
  const comboDraw = draws.flushDraw && (draws.openEnded || draws.gutshot);
  const topPair = hasTopPair(bot.cards, state.board);
  const overpair = hasOverpair(bot.cards, state.board);
  const equityShare = botEquityShare(state);
  const strongValue = madeCategory >= 5 || equityShare >= 0.8;
  const valueHand = strongValue || madeCategory >= 3 || equityShare >= 0.63 || overpair;
  const bluffCatcher = valueHand || madeCategory >= 2 || topPair || equityShare >= 0.48;
  const semiBluff = comboDraw || (strongDraw && equityShare >= 0.34);

  if (toCall > 0) {
    if (strongValue && allInAction && equityShare >= 0.86 && pressure >= STARTING_STACK * 0.45) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.32, bot.profile), decision: { type: "all-in", amount: allInAction.amount!, note: "hu-gto value jam" } },
          {
            weight: raiseAction ? mixByProfile(0.52, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.8, "hu-gto value raise"),
          },
          { weight: 1, decision: { type: "call", note: "hu-gto trap call" } },
        ],
        fallbackDecision,
      );
    }

    if (valueHand) {
      return chooseWeightedDecision(
        [
          {
            weight: raiseAction ? mixByProfile(boardIsWet(texture) ? 0.26 : 0.18, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * (boardIsWet(texture) ? 0.72 : 0.55), "hu-gto mixed value raise"),
          },
          { weight: 1, decision: { type: "call", note: "hu-gto bluff-catch continue" } },
        ],
        fallbackDecision,
      );
    }

    if (semiBluff && potOdds <= equityShare + 0.08) {
      return chooseWeightedDecision(
        [
          {
            weight: raiseAction ? mixByProfile(comboDraw ? 0.28 : 0.14, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.58, "hu-gto semi-bluff raise"),
          },
          { weight: 1, decision: { type: "call", note: "hu-gto draw continue" } },
        ],
        fallbackDecision,
      );
    }

    if (bluffCatcher && potOdds <= equityShare * 0.92 + 0.07) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.58, bot.profile), decision: { type: "call", note: "hu-gto bluff-catch call" } },
          { weight: 0.42, decision: { type: "fold", note: "hu-gto bluff-catch fold mix" } },
        ],
        fallbackDecision,
      );
    }

    return legalActions.some((action) => action.type === "fold")
      ? { type: "fold", note: "hu-gto postflop fold" }
      : { type: "check", note: "hu-gto postflop check" };
  }

  if (!pressureAction) return { type: "check", note: "hu-gto no c-bet lane" };

  if (strongValue) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(0.82, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.9 : pressure * 0.82, "hu-gto value bet"),
        },
        { weight: 0.18, decision: { type: "check", note: "hu-gto slowplay mix" } },
      ],
      fallbackDecision,
    );
  }

  if (valueHand) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(boardIsWet(texture) ? 0.66 : 0.54, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.62 : pressure * 0.58, "hu-gto thin value"),
        },
        { weight: 1, decision: { type: "check", note: "hu-gto medium showdown check" } },
      ],
      fallbackDecision,
    );
  }

  if (semiBluff) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(comboDraw ? 0.58 : 0.42, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.54 : pressure * 0.46, "hu-gto semi-bluff stab"),
        },
        { weight: 1, decision: { type: "check", note: "hu-gto draw check" } },
      ],
      fallbackDecision,
    );
  }

  if (boardIsDry(texture)) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(0.26, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.4 : pressure * 0.32, "hu-gto range stab"),
        },
        { weight: 1, decision: { type: "check", note: "hu-gto check back air" } },
      ],
      fallbackDecision,
    );
  }

  return { type: "check", note: "hu-gto give up" };
};

const botDecision = (state: HandState, botId: string): PlayerDecision =>
  getBotStrategyMode(state) === "hu-gto" ? huGtoBotDecision(state, botId) : heuristicBotDecision(state, botId);

const autoplayUntilHero = (state: HandState) => {
  while (state.street !== "showdown") {
    const player = state.players[state.currentPlayerIndex]!;
    if (player.isHero) break;
    applyDecision(state, player.id, botDecision(state, player.id));
  }
  state.nextActions = generateAllowedActions(state);
};

const buildTournament = (bots: PlayerState[]): TournamentMeta => ({
  level: 1,
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  handsUntilLevelUp: 5,
  opponents: bots.map((entry) => ({
    id: entry.id,
    name: entry.name,
    stack: entry.stack,
    eliminated: false,
  })),
});

export const createHandState = (options: SessionOptions): HandState => {
  const botCount = normalizeBotCount(options.botCount);
  const shuffledDeck = shuffleDeck(buildDeck(), Date.now() / 1000);
  const [heroCards, afterHero] = drawCards(shuffledDeck, 2);
  const profiles = createRandomProfiles(botCount);

  let deck = afterHero;
  const bots: PlayerState[] = [];
  for (let index = 0; index < botCount; index += 1) {
    const [cards, nextDeck] = drawCards(deck, 2);
    deck = nextDeck;
    bots.push({
      id: `bot-${index + 1}`,
      name: BOT_NAME_POOL[index] ?? `Bot ${index + 1}`,
      stack: STARTING_STACK,
      bet: 0,
      cards,
      folded: false,
      allIn: false,
      acted: false,
      isHero: false,
      profile: profiles[index]!,
    });
  }

  const players: PlayerState[] = [
    {
      id: "hero",
      name: options.heroName ?? "Hero",
      stack: STARTING_STACK,
      bet: 0,
      cards: heroCards,
      folded: false,
      allIn: false,
      acted: false,
      isHero: true,
      profile: "balanced",
    },
    ...bots,
  ];

  const tournament = options.mode === "tournament" ? buildTournament(bots) : undefined;
  const buttonIndex = Math.floor(Math.random() * players.length);
  const positions = resolveBlindPositions({ players } as HandState, buttonIndex);
  const smallBlind = tournament?.smallBlind ?? 1;
  const bigBlind = tournament?.bigBlind ?? 2;

  postBlind(players[positions.smallBlindIndex]!, smallBlind);
  postBlind(players[positions.bigBlindIndex]!, bigBlind);

  const state: HandState = {
    sessionId: nextId(),
    handNumber: 1,
    mode: options.mode,
    botStrategyMode: botCount === 1 ? "hu-gto" : "multiway-heuristic",
    street: "preflop",
    heroId: "hero",
    buttonIndex,
    currentPlayerIndex: positions.preflopActorIndex,
    currentBet: bigBlind,
    minRaiseTo: bigBlind * 2,
    pot: 0,
    board: [],
    deck,
    players,
    actionLog: [],
    nextActions: [],
    villainRangeHint: "牌桌读取中",
    equity: {
      winRate: 0,
      tieRate: 0,
      lossRate: 0,
      iterations: 0,
    },
    ...(tournament ? { tournament } : {}),
  };

  updateDerivedState(state);
  autoplayUntilHero(state);
  state.nextActions = generateAllowedActions(state);
  return state;
};

export const createNextHandState = (previous: HandState): HandState => {
  const { result: _previousResult, tournament: _previousTournament, ...previousBase } = previous;
  const players = clonePlayers(previous.players).map((player) => ({
    ...player,
    stack: player.stack > 0 ? player.stack : STARTING_STACK,
    bet: 0,
    cards: [] as CardCode[],
    folded: false,
    allIn: false,
    acted: false,
  }));

  const shuffledDeck = shuffleDeck(buildDeck(), Date.now() / 1000);
  let deck = shuffledDeck;
  for (let index = 0; index < players.length; index += 1) {
    const [cards, nextDeck] = drawCards(deck, 2);
    deck = nextDeck;
    players[index] = {
      ...players[index]!,
      cards,
    };
  }

  const tournament = previous.tournament
    ? {
        ...previous.tournament,
        opponents: players
          .filter((player) => !player.isHero)
          .map((player) => ({
            id: player.id,
            name: player.name,
            stack: player.stack,
            eliminated: player.stack <= 0,
          })),
      }
    : undefined;

  const buttonIndex = nextActiveIndex({ ...previous, players } as HandState, previous.buttonIndex);
  const positions = resolveBlindPositions({ ...previous, players } as HandState, buttonIndex);
  const smallBlind = tournament?.smallBlind ?? 1;
  const bigBlind = tournament?.bigBlind ?? 2;

  postBlind(players[positions.smallBlindIndex]!, smallBlind);
  postBlind(players[positions.bigBlindIndex]!, bigBlind);

  const state: HandState = {
    ...previousBase,
    handNumber: previous.handNumber + 1,
    street: "preflop",
    buttonIndex,
    currentPlayerIndex: positions.preflopActorIndex,
    currentBet: bigBlind,
    minRaiseTo: bigBlind * 2,
    pot: 0,
    board: [],
    deck,
    players,
    actionLog: [],
    nextActions: [],
    ...(tournament ? { tournament } : {}),
  };

  updateDerivedState(state);
  autoplayUntilHero(state);
  state.nextActions = generateAllowedActions(state);
  return state;
};

export const advanceHandState = (state: HandState, decision: PlayerDecision): HandState => {
  const snapshot: HandState = {
    ...state,
    board: [...state.board],
    deck: [...state.deck],
    players: clonePlayers(state.players),
    actionLog: [...state.actionLog],
    nextActions: [...state.nextActions],
    equity: { ...state.equity },
    ...(state.tournament
      ? { tournament: { ...state.tournament, opponents: state.tournament.opponents.map((entry) => ({ ...entry })) } }
      : {}),
    ...(state.result
      ? { result: { ...state.result, board: [...state.result.board], winnerIds: [...state.result.winnerIds] } }
      : {}),
  };

  applyDecision(snapshot, snapshot.heroId, decision);
  autoplayUntilHero(snapshot);

  if (snapshot.street === "showdown") {
    snapshot.nextActions = [];
  }

  return snapshot;
};
