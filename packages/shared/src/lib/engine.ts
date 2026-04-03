import { buildDeck, drawCards, parseCard, rankValue, shuffleDeck } from "./cards";
import { calculateEquity } from "./equity";
import type {
  ActionLog,
  ActionType,
  AllowedAction,
  CardCode,
  HandResult,
  HandState,
  PlayerDecision,
  PlayerState,
  SessionMode,
  SessionOptions,
  Street,
  TournamentMeta,
} from "./types";

const HAND_NAMES = [
  "高牌",
  "一对",
  "两对",
  "三条",
  "顺子",
  "同花",
  "葫芦",
  "四条",
  "同花顺",
] as const;

export interface EvaluatedHand {
  category: number;
  ranks: number[];
}

const STREET_SEQUENCE: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
const STARTING_STACK = 200;

const nextId = () => Math.random().toString(36).slice(2, 10);

const clonePlayers = (players: PlayerState[]) => players.map((player) => ({ ...player, cards: [...player.cards] }));

const resetBetsForStreet = (state: HandState) => {
  state.players = state.players.map((player) => ({ ...player, bet: 0, acted: false }));
  state.currentBet = 0;
  state.minRaiseTo = state.tournament?.bigBlind ?? 4;
};

const getHero = (state: HandState) => state.players.find((player) => player.isHero)!;
const getVillain = (state: HandState) => state.players.find((player) => !player.isHero)!;

const activePlayers = (state: HandState) => state.players.filter((player) => !player.folded);

const amountToCall = (state: HandState, player: PlayerState) => Math.max(0, state.currentBet - player.bet);

const postBlind = (player: PlayerState, blind: number) => {
  const amount = Math.min(player.stack, blind);
  player.stack -= amount;
  player.bet += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
};

const generateAllowedActions = (state: HandState): AllowedAction[] => {
  const player = state.players[state.currentPlayerIndex]!;
  if (!player.isHero || state.street === "showdown" || player.folded || player.allIn) {
    return [];
  }

  const callAmount = amountToCall(state, player);
  const max = player.stack + player.bet;
  const potBased = Math.max(state.pot + state.players.reduce((sum, entry) => sum + entry.bet, 0), 1);
  const options: AllowedAction[] = [];

  if (callAmount > 0) {
    options.push({ type: "fold", label: "弃牌" });
    options.push({
      type: "call",
      label: `跟注 ${callAmount}`,
      amount: callAmount,
    });
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
      const betAmount = Math.min(max, Math.max(2, Math.round(potBased * 0.66)));
      options.push({
        type: "bet",
        label: `下注 ${betAmount}`,
        min: 2,
        max,
        amount: betAmount,
      });
    }
  }

  if (!options.some((option) => option.type === "all-in") && player.stack > 0) {
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

const updateEquity = (state: HandState) => {
  const hero = getHero(state);
  const villain = getVillain(state);
  state.equity = calculateEquity(hero.cards, villain.cards, state.board);
};

const logAction = (state: HandState, actor: PlayerState, action: ActionType, amount: number, note?: string) => {
  const invested = state.players.reduce((sum, player) => sum + player.bet, 0);
  const entry: ActionLog = {
    street: state.street,
    actorId: actor.id,
    actorName: actor.name,
    action,
    amount,
    potAfter: state.pot + invested,
    note,
  };
  state.actionLog.push(entry);
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

  state.currentPlayerIndex = state.buttonIndex;
  updateEquity(state);
};

const collectPotAndAward = (state: HandState, winnerIds: string[], description: string): HandResult => {
  const pending = state.players.reduce((sum, player) => sum + player.bet, 0);
  const totalPot = state.pot + pending;
  const share = Math.floor(totalPot / winnerIds.length);
  const remainder = totalPot - share * winnerIds.length;

  state.players = state.players.map((player, index) => {
    const winnerIndex = winnerIds.indexOf(player.id);
    const gain = winnerIndex >= 0 ? share + (winnerIndex === 0 ? remainder : 0) : 0;
    return { ...player, stack: player.stack + gain, bet: 0 };
  });

  return {
    winnerIds,
    description,
    board: [...state.board],
    pot: totalPot,
  };
};

const resolveFold = (state: HandState, foldedId: string) => {
  const winner = state.players.find((player) => player.id !== foldedId)!;
  state.street = "showdown";
  state.result = collectPotAndAward(state, [winner.id], `${winner.name} 通过弃牌赢下底池`);
  state.nextActions = [];
};

const maybeUpdateTournament = (state: HandState) => {
  if (!state.tournament) return;

  const hero = getHero(state);
  const villain = getVillain(state);
  const opponents = state.tournament.opponents.map((entry) =>
    entry.id === villain.id ? { ...entry, stack: villain.stack, eliminated: villain.stack <= 0 } : entry,
  );
  const activeOpponents = opponents.filter((entry) => !entry.eliminated);
  const handCount = state.handNumber;

  state.tournament = {
    ...state.tournament,
    opponents,
    handsUntilLevelUp: Math.max(0, state.tournament.handsUntilLevelUp - 1),
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

  if (hero.stack <= 0 || activeOpponents.length === 0) {
    return;
  }

  if (handCount % 2 === 0) {
    state.tournament = {
      ...state.tournament,
      opponents: state.tournament.opponents.map((entry) =>
        entry.eliminated
          ? entry
          : {
              ...entry,
              stack: Math.max(0, entry.stack + (Math.random() > 0.5 ? 4 : -4)),
              eliminated: entry.stack <= 0,
            },
      ),
    };
  }
};

const settleHand = (state: HandState) => {
  maybeUpdateTournament(state);
  state.nextActions = [];
};

export const describeEvaluatedHand = (hand: EvaluatedHand): string => {
  return `${HAND_NAMES[hand.category]} ${hand.ranks.join("-")}`;
};

const isStraight = (values: number[]): number | undefined => {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);

  let run = 1;
  for (let index = 0; index < unique.length - 1; index += 1) {
    if (unique[index]! - unique[index + 1]! === 1) {
      run += 1;
      if (run >= 5) return unique[index - 3]!;
    } else {
      run = 1;
    }
  }

  return undefined;
};

const evaluateFiveCards = (cards: CardCode[]): EvaluatedHand => {
  const parsed = cards.map(parseCard);
  const values = parsed.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map<number, number>();

  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = new Set(parsed.map((card) => card.suit)).size === 1;
  const straightHigh = isStraight(values);

  if (flush && straightHigh) return { category: 8, ranks: [straightHigh] };
  if (groups[0]?.[1] === 4) return { category: 7, ranks: [groups[0][0], groups[1]![0]] };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { category: 6, ranks: [groups[0][0], groups[1][0]] };
  if (flush) return { category: 5, ranks: values };
  if (straightHigh) return { category: 4, ranks: [straightHigh] };
  if (groups[0]?.[1] === 3) return { category: 3, ranks: [groups[0][0], ...groups.slice(1).map((group) => group[0])] };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]);
    const kicker = groups.find((group) => group[1] === 1)![0];
    return { category: 2, ranks: [...pairs, kicker] };
  }
  if (groups[0]?.[1] === 2) return { category: 1, ranks: [groups[0][0], ...groups.slice(1).map((group) => group[0])] };
  return { category: 0, ranks: values };
};

export const compareHands = (left: EvaluatedHand, right: EvaluatedHand): number => {
  if (left.category !== right.category) return left.category > right.category ? 1 : -1;
  const length = Math.max(left.ranks.length, right.ranks.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = left.ranks[index] ?? 0;
    const rightValue = right.ranks[index] ?? 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }

  return 0;
};

export const evaluateSevenCards = (cards: CardCode[]): EvaluatedHand => {
  let best = evaluateFiveCards(cards.slice(0, 5));

  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            const current = evaluateFiveCards([
              cards[first]!,
              cards[second]!,
              cards[third]!,
              cards[fourth]!,
              cards[fifth]!,
            ]);

            if (compareHands(current, best) > 0) best = current;
          }
        }
      }
    }
  }

  return best;
};

const resolveShowdown = (state: HandState) => {
  const [hero, villain] = clonePlayers(state.players);
  const heroEval = evaluateSevenCards([...hero.cards, ...state.board]);
  const villainEval = evaluateSevenCards([...villain.cards, ...state.board]);
  const winner = compareHands(heroEval, villainEval);

  if (winner > 0) {
    state.result = collectPotAndAward(state, [hero.id], `${hero.name} ${describeEvaluatedHand(heroEval)}`);
  } else if (winner < 0) {
    state.result = collectPotAndAward(state, [villain.id], `${villain.name} ${describeEvaluatedHand(villainEval)}`);
  } else {
    state.result = collectPotAndAward(state, [hero.id, villain.id], `平分底池，双方都是 ${describeEvaluatedHand(heroEval)}`);
  }

  settleHand(state);
};

const canAdvanceRound = (state: HandState) => {
  const active = activePlayers(state);
  if (active.length === 1) return true;
  return active.every((player) => player.allIn || (player.acted && player.bet === state.currentBet));
};

const nextActiveIndex = (state: HandState, startIndex: number): number => {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (startIndex + offset) % state.players.length;
    const player = state.players[index]!;
    if (!player.folded && !player.allIn) return index;
  }
  return startIndex;
};

const applyDecision = (state: HandState, playerId: string, decision: PlayerDecision) => {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  const player = state.players[playerIndex]!;
  const toCall = amountToCall(state, player);

  if (decision.type === "fold") {
    player.folded = true;
    player.acted = true;
    logAction(state, player, "fold", 0);
    resolveFold(state, player.id);
    return;
  }

  if (decision.type === "check") {
    player.acted = true;
    logAction(state, player, "check", 0);
  } else if (decision.type === "call") {
    const amount = Math.min(player.stack, toCall);
    player.stack -= amount;
    player.bet += amount;
    player.acted = true;
    if (player.stack === 0) player.allIn = true;
    logAction(state, player, "call", amount);
  } else {
    const target =
      decision.type === "all-in"
        ? player.bet + player.stack
        : Math.max(decision.amount ?? state.minRaiseTo, decision.type === "bet" ? 2 : state.minRaiseTo);
    const invest = Math.min(player.stack, target - player.bet);
    player.stack -= invest;
    player.bet += invest;
    player.acted = true;
    player.allIn = player.stack === 0;
    state.currentBet = Math.max(state.currentBet, player.bet);
    state.minRaiseTo = Math.max(state.currentBet + (state.currentBet - (state.players.find((entry) => entry.id !== player.id)?.bet ?? 0)), state.currentBet + 2);
    state.players = state.players.map((entry) =>
      entry.id === player.id ? player : { ...entry, acted: entry.folded || entry.allIn },
    );
    logAction(state, player, decision.type, invest);
  }

  updateEquity(state);

  if (state.street !== "showdown") {
    if (activePlayers(state).some((entry) => !entry.folded) && canAdvanceRound(state)) {
      advanceStreet(state);
    } else {
      state.currentPlayerIndex = nextActiveIndex(state, playerIndex);
    }
  }

  state.nextActions = generateAllowedActions(state);
};

const scoreStartingHand = (cards: CardCode[]): number => {
  const [left, right] = cards.map(parseCard);
  const pair = left.value === right.value;
  const suited = left.suit === right.suit;
  const gap = Math.abs(left.value - right.value);
  return left.value + right.value + (pair ? 12 : 0) + (suited ? 2 : 0) + Math.max(0, 5 - gap);
};

const villainDecision = (state: HandState): PlayerDecision => {
  const villain = getVillain(state);
  const hero = getHero(state);
  const toCall = amountToCall(state, villain);
  const showdownStrength = evaluateSevenCards(
    state.street === "preflop" ? [...villain.cards, "2c", "3d", "4h", "5s", "6c"] : [...villain.cards, ...state.board],
  ).category;
  const handScore = scoreStartingHand(villain.cards);
  const pressure = state.pot + state.players.reduce((sum, player) => sum + player.bet, 0);
  const equityBias = showdownStrength + handScore / 10 + (hero.stack < villain.stack ? 0.5 : 0);

  if (toCall > 0) {
    if (equityBias < 2.6 && toCall > pressure * 0.45) return { type: "fold" };
    if (equityBias > 4.7 && villain.stack + villain.bet > state.currentBet + 8) {
      return { type: "raise", amount: Math.min(villain.stack + villain.bet, state.currentBet + Math.max(8, Math.round(pressure * 0.75))) };
    }
    return { type: "call" };
  }

  if (equityBias > 4.2 && villain.stack > 0) {
    return { type: "bet", amount: Math.min(villain.stack + villain.bet, Math.max(6, Math.round(pressure * 0.6))) };
  }

  return { type: "check" };
};

const autoplayUntilHero = (state: HandState) => {
  while (state.street !== "showdown") {
    const player = state.players[state.currentPlayerIndex]!;
    if (player.isHero) break;
    applyDecision(state, player.id, villainDecision(state));
  }
  state.nextActions = generateAllowedActions(state);
};

const buildTournament = (): TournamentMeta => ({
  level: 1,
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  handsUntilLevelUp: 5,
  opponents: [
    { id: "villain", name: "North Rail", stack: STARTING_STACK, eliminated: false },
    { id: "bot-2", name: "Delta Shark", stack: STARTING_STACK, eliminated: false },
    { id: "bot-3", name: "Luna Ace", stack: STARTING_STACK, eliminated: false },
    { id: "bot-4", name: "Mika River", stack: STARTING_STACK, eliminated: false },
    { id: "bot-5", name: "Stone Pot", stack: STARTING_STACK, eliminated: false },
  ],
});

export const createHandState = (options: SessionOptions): HandState => {
  const deck = shuffleDeck(buildDeck(), Date.now() / 1000);
  const [heroCards, afterHero] = drawCards(deck, 2);
  const [villainCards, remainingDeck] = drawCards(afterHero, 2);
  const mode: SessionMode = options.mode;
  const tournament = mode === "tournament" ? buildTournament() : undefined;
  const smallBlind = tournament?.smallBlind ?? 1;
  const bigBlind = tournament?.bigBlind ?? 2;

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
    {
      id: "villain",
      name: "North Rail",
      stack: STARTING_STACK,
      bet: 0,
      cards: villainCards,
      folded: false,
      allIn: false,
      acted: false,
      isHero: false,
      profile: "aggressive",
    },
  ];

  postBlind(players[0]!, smallBlind);
  postBlind(players[1]!, bigBlind);

  const state: HandState = {
    sessionId: nextId(),
    handNumber: 1,
    mode,
    street: "preflop",
    heroId: "hero",
    buttonIndex: 0,
    currentPlayerIndex: 0,
    currentBet: bigBlind,
    minRaiseTo: bigBlind * 2,
    pot: 0,
    board: [],
    deck: remainingDeck,
    players,
    actionLog: [],
    nextActions: [],
    villainRangeHint: mode === "tournament" ? "15-22BB 压力范围" : "宽范围持续下注",
    equity: {
      winRate: 0,
      tieRate: 0,
      lossRate: 0,
      iterations: 0,
    },
    tournament,
  };

  updateEquity(state);
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
    tournament: state.tournament ? { ...state.tournament, opponents: state.tournament.opponents.map((entry) => ({ ...entry })) } : undefined,
    result: state.result ? { ...state.result, board: [...state.result.board], winnerIds: [...state.result.winnerIds] } : undefined,
  };

  applyDecision(snapshot, snapshot.heroId, decision);
  autoplayUntilHero(snapshot);

  if (snapshot.street === "showdown") {
    snapshot.nextActions = [];
  }

  return snapshot;
};
