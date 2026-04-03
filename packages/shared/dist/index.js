// src/lib/cards.ts
var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
var SUITS = ["s", "h", "d", "c"];
var rankValue = (rank) => RANKS.indexOf(rank) + 2;
var buildDeck = () => SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
var shuffleDeck = (deck, seed = Math.random()) => {
  const values = [...deck];
  let random = Math.abs(Math.sin(seed)) * 1e4;
  for (let index = values.length - 1; index > 0; index -= 1) {
    random = (random * 9301 + 49297) % 233280;
    const swapIndex = Math.floor(random / 233280 * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
};
var drawCards = (deck, count) => {
  return [deck.slice(0, count), deck.slice(count)];
};
var parseCard = (card) => ({
  rank: card[0],
  suit: card[1],
  value: rankValue(card[0])
});

// src/lib/evaluator.ts
var HAND_NAMES = [
  "\u9AD8\u724C",
  "\u4E00\u5BF9",
  "\u4E24\u5BF9",
  "\u4E09\u6761",
  "\u987A\u5B50",
  "\u540C\u82B1",
  "\u846B\u82A6",
  "\u56DB\u6761",
  "\u540C\u82B1\u987A"
];
var isStraight = (values) => {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  let run = 1;
  for (let index = 0; index < unique.length - 1; index += 1) {
    if (unique[index] - unique[index + 1] === 1) {
      run += 1;
      if (run >= 5) return unique[index - 3];
    } else {
      run = 1;
    }
  }
  return void 0;
};
var evaluateFiveCards = (cards) => {
  const parsed = cards.map(parseCard);
  const values = parsed.map((card) => card.value).sort((a, b) => b - a);
  const counts = /* @__PURE__ */ new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const flush = new Set(parsed.map((card) => card.suit)).size === 1;
  const straightHigh = isStraight(values);
  if (flush && straightHigh) return { category: 8, ranks: [straightHigh] };
  if (groups[0]?.[1] === 4) return { category: 7, ranks: [groups[0][0], groups[1][0]] };
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return { category: 6, ranks: [groups[0][0], groups[1][0]] };
  if (flush) return { category: 5, ranks: values };
  if (straightHigh) return { category: 4, ranks: [straightHigh] };
  if (groups[0]?.[1] === 3) return { category: 3, ranks: [groups[0][0], ...groups.slice(1).map((group) => group[0])] };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    const pairs = groups.filter((group) => group[1] === 2).map((group) => group[0]);
    const kicker = groups.find((group) => group[1] === 1)[0];
    return { category: 2, ranks: [...pairs, kicker] };
  }
  if (groups[0]?.[1] === 2) return { category: 1, ranks: [groups[0][0], ...groups.slice(1).map((group) => group[0])] };
  return { category: 0, ranks: values };
};
var compareHands = (left, right) => {
  if (left.category !== right.category) return left.category > right.category ? 1 : -1;
  const length = Math.max(left.ranks.length, right.ranks.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left.ranks[index] ?? 0;
    const rightValue = right.ranks[index] ?? 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
};
var evaluateSevenCards = (cards) => {
  let best = evaluateFiveCards(cards.slice(0, 5));
  for (let first = 0; first < cards.length - 4; first += 1) {
    for (let second = first + 1; second < cards.length - 3; second += 1) {
      for (let third = second + 1; third < cards.length - 2; third += 1) {
        for (let fourth = third + 1; fourth < cards.length - 1; fourth += 1) {
          for (let fifth = fourth + 1; fifth < cards.length; fifth += 1) {
            const current = evaluateFiveCards([
              cards[first],
              cards[second],
              cards[third],
              cards[fourth],
              cards[fifth]
            ]);
            if (compareHands(current, best) > 0) best = current;
          }
        }
      }
    }
  }
  return best;
};
var describeEvaluatedHand = (hand) => {
  return `${HAND_NAMES[hand.category]} ${hand.ranks.join("-")}`;
};

// src/lib/equity.ts
var takeRandomAvailable = (excluded, count, seed) => {
  const deck = shuffleDeck(
    buildDeck().filter((card) => !excluded.has(card)),
    seed
  );
  return deck.slice(0, count);
};
var calculateEquity = (hero, villain, board, iterations = 600) => {
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (let index = 0; index < iterations; index += 1) {
    const used = /* @__PURE__ */ new Set([...hero, ...villain, ...board]);
    const rest = takeRandomAvailable(used, 5 - board.length, index + 1);
    const completeBoard = [...board, ...rest];
    const heroValue = evaluateSevenCards([...hero, ...completeBoard]);
    const villainValue = evaluateSevenCards([...villain, ...completeBoard]);
    const result = compareHands(heroValue, villainValue);
    if (result > 0) wins += 1;
    else if (result < 0) losses += 1;
    else ties += 1;
  }
  return {
    winRate: wins / iterations,
    tieRate: ties / iterations,
    lossRate: losses / iterations,
    iterations
  };
};
var calculateMultiwayEquity = (hero, opponents, board, iterations = 500) => {
  if (opponents.length === 0) {
    return {
      winRate: 1,
      tieRate: 0,
      lossRate: 0,
      iterations: 1
    };
  }
  let wins = 0;
  let ties = 0;
  let losses = 0;
  for (let index = 0; index < iterations; index += 1) {
    const used = /* @__PURE__ */ new Set([...hero, ...opponents.flat(), ...board]);
    const rest = takeRandomAvailable(used, 5 - board.length, index + 1);
    const completeBoard = [...board, ...rest];
    const heroValue = evaluateSevenCards([...hero, ...completeBoard]);
    const opponentValues = opponents.map((cards) => evaluateSevenCards([...cards, ...completeBoard]));
    let comparison = 1;
    let tieCount = 0;
    for (const opponentValue of opponentValues) {
      const result = compareHands(heroValue, opponentValue);
      if (result < 0) {
        comparison = -1;
        break;
      }
      if (result === 0) tieCount += 1;
    }
    if (comparison < 0) losses += 1;
    else if (tieCount > 0) ties += 1;
    else wins += 1;
  }
  return {
    winRate: wins / iterations,
    tieRate: ties / iterations,
    lossRate: losses / iterations,
    iterations
  };
};
var summarizeBoardTexture = (board) => {
  if (board.length === 0) return "\u672A\u77E5\u7FFB\u524D";
  const parsed = board.map(parseCard);
  const suits = new Set(parsed.map((card) => card.suit));
  const values = parsed.map((card) => card.value).sort((a, b) => a - b);
  const connected = values.at(-1) - values[0] <= 4;
  const paired = new Set(values).size !== values.length;
  return [
    suits.size === 1 ? "\u540C\u82B1\u9762" : suits.size === 2 ? "\u504F\u540C\u82B1\u9762" : "\u5F69\u8679\u9762",
    paired ? "\u6709\u5BF9\u5B50" : "\u65E0\u5BF9\u5B50",
    connected ? "\u504F\u8FDE\u5F20" : "\u504F\u5E72\u71E5"
  ].join(" / ");
};
var describeShowdown = (cards) => describeEvaluatedHand(evaluateSevenCards(cards));

// src/lib/engine.ts
var STARTING_STACK = 200;
var MAX_BOTS = 5;
var PROFILE_POOL = ["aggressive", "balanced", "careful"];
var BOT_NAME_POOL = [
  "North Rail",
  "Delta Shark",
  "Luna Ace",
  "Mika River",
  "Stone Pot",
  "Velvet Stack",
  "Ivy Bluff",
  "Copper Tell"
];
var clamp = (value, min, max) => Math.min(max, Math.max(min, value));
var clamp01 = (value) => clamp(value, 0, 1);
var nextId = () => Math.random().toString(36).slice(2, 10);
var clonePlayers = (players) => players.map((player) => ({ ...player, cards: [...player.cards] }));
var totalPot = (state) => state.pot + state.players.reduce((sum, player) => sum + player.bet, 0);
var getHero = (state) => state.players.find((player) => player.isHero);
var getBots = (state) => state.players.filter((player) => !player.isHero);
var getActivePlayers = (state) => state.players.filter((player) => !player.folded);
var getActiveBots = (state) => state.players.filter((player) => !player.isHero && !player.folded);
var amountToCall = (state, player) => Math.max(0, state.currentBet - player.bet);
var getBotStrategyMode = (state) => getBots(state).length === 1 ? "hu-gto" : "multiway-heuristic";
var nextActiveIndex = (state, startIndex) => {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (startIndex + offset) % state.players.length;
    const player = state.players[index];
    if (!player.folded && !player.allIn) return index;
  }
  return startIndex;
};
var resolveBlindPositions = (state, buttonIndex) => {
  if (state.players.length === 2) {
    const smallBlindIndex2 = buttonIndex;
    const bigBlindIndex2 = nextActiveIndex(state, buttonIndex);
    const preflopActorIndex2 = buttonIndex;
    return { smallBlindIndex: smallBlindIndex2, bigBlindIndex: bigBlindIndex2, preflopActorIndex: preflopActorIndex2 };
  }
  const smallBlindIndex = nextActiveIndex(state, buttonIndex);
  const bigBlindIndex = nextActiveIndex(state, smallBlindIndex);
  const preflopActorIndex = nextActiveIndex(state, bigBlindIndex);
  return { smallBlindIndex, bigBlindIndex, preflopActorIndex };
};
var resetBetsForStreet = (state) => {
  state.players = state.players.map((player) => ({ ...player, bet: 0, acted: false }));
  state.currentBet = 0;
  state.minRaiseTo = state.tournament?.bigBlind ?? 4;
};
var postBlind = (player, blind) => {
  const amount = Math.min(player.stack, blind);
  player.stack -= amount;
  player.bet += amount;
  if (player.stack === 0) player.allIn = true;
  return amount;
};
var normalizeBotCount = (count) => clamp(Math.round(count ?? 1), 1, MAX_BOTS);
var createRandomProfiles = (botCount) => {
  const profiles = Array.from({ length: botCount }, (_, index) => PROFILE_POOL[(Date.now() + index * 7) % PROFILE_POOL.length]);
  for (let index = profiles.length - 1; index > 0; index -= 1) {
    const target = (Date.now() + index * 13) % (index + 1);
    [profiles[index], profiles[target]] = [profiles[target], profiles[index]];
  }
  if (botCount > 1 && new Set(profiles).size === 1) {
    profiles[profiles.length - 1] = PROFILE_POOL[(PROFILE_POOL.indexOf(profiles[0]) + 1) % PROFILE_POOL.length];
  }
  return profiles;
};
var scoreStartingHand = (cards) => {
  const left = parseCard(cards[0]);
  const right = parseCard(cards[1]);
  const pair = left.value === right.value;
  const suited = left.suit === right.suit;
  const gap = Math.abs(left.value - right.value);
  return left.value + right.value + (pair ? 12 : 0) + (suited ? 2 : 0) + Math.max(0, 5 - gap);
};
var detectDrawProfile = (cards, board) => {
  if (board.length < 3) return { flushDraw: false, openEnded: false, gutshot: false };
  const parsed = [...cards, ...board].map(parseCard);
  const suitCounts = /* @__PURE__ */ new Map();
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
var isPocketPair = (cards) => cards.length === 2 && parseCard(cards[0]).value === parseCard(cards[1]).value;
var boardValues = (board) => board.map((card) => parseCard(card).value);
var profileMixShift = (profile) => profile === "aggressive" ? 0.12 : profile === "careful" ? -0.12 : 0;
var mixByProfile = (base, profile) => clamp01(base + profileMixShift(profile));
var chooseWeightedDecision = (choices, fallback) => {
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
var fitTargetAmount = (action, target) => {
  if (!action) return void 0;
  const min = action.min ?? action.amount ?? 0;
  const max = action.max ?? action.amount ?? min;
  return clamp(Math.round(target ?? action.amount ?? min), min, max);
};
var withActionAmount = (action, fallbackType, target, note) => {
  const amount = fitTargetAmount(action, target);
  return amount === void 0 ? { type: action?.type ?? fallbackType, note } : { type: action?.type ?? fallbackType, amount, note };
};
var fallbackDecisionFor = (legalActions) => legalActions.some((action) => action.type === "check") ? { type: "check" } : { type: "fold" };
var botEquityShare = (state) => clamp01(state.equity.lossRate + state.equity.tieRate * 0.5);
var boardIsDry = (texture) => texture.includes("\u504F\u5E72\u71E5");
var boardIsWet = (texture) => texture.includes("\u504F\u8FDE\u5F20") || texture.includes("\u504F\u540C\u82B1\u9762") || texture.includes("\u540C\u82B1\u9762");
var hasTopPair = (cards, board) => {
  if (board.length === 0) return false;
  const topBoardValue = Math.max(...boardValues(board));
  return cards.some((card) => parseCard(card).value === topBoardValue);
};
var hasOverpair = (cards, board) => {
  if (board.length === 0 || !isPocketPair(cards)) return false;
  return parseCard(cards[0]).value > Math.max(...boardValues(board));
};
var describePlayerRead = (player, board) => {
  const texture = summarizeBoardTexture(board);
  const preflopScore = scoreStartingHand(player.cards);
  if (board.length === 0) {
    if (preflopScore >= 36) return "\u9876\u7AEF\u5F3A\u724C / \u504F 3bet \u7EE7\u7EED";
    if (preflopScore >= 28) return "\u4E2D\u9AD8\u5F20\u8303\u56F4 / \u53EF\u7EE7\u7EED\u65BD\u538B";
    if (preflopScore >= 22) return "\u540C\u82B1\u8FDE\u5F20\u4E0E\u53E3\u888B\u5BF9\u5B50";
    return "\u8FB9\u7F18\u9632\u5B88\u8303\u56F4";
  }
  const madeCategory = evaluateSevenCards([...player.cards, ...board]).category;
  const draws = detectDrawProfile(player.cards, board);
  if (madeCategory >= 5) return `${texture} / \u5F3A\u4EF7\u503C`;
  if (madeCategory >= 2 || hasOverpair(player.cards, board) || hasTopPair(player.cards, board)) return `${texture} / \u4E00\u5BF9\u4EE5\u4E0A`;
  if (draws.flushDraw || draws.openEnded) return `${texture} / \u542C\u724C\u534A\u8BC8\u552C`;
  return `${texture} / \u7A7A\u6C14\u6216\u5F31\u644A\u724C`;
};
var describeTablePressure = (state) => {
  const activeBots = getActiveBots(state);
  if (activeBots.length === 0) return "\u684C\u4E0A\u6CA1\u6709\u6D3B\u8DC3\u7535\u8111";
  const focus = state.players[state.currentPlayerIndex]?.isHero ? activeBots[0] : state.players[state.currentPlayerIndex] ?? activeBots[0];
  const strategyPrefix = state.botStrategyMode === "hu-gto" ? "HU \u8FD1\u4F3C GTO" : `${activeBots.length} \u4E2A\u7535\u8111\u5728\u5C40`;
  return `${strategyPrefix} \xB7 ${focus.name} ${focus.profile} \xB7 ${describePlayerRead(focus, state.board)}`;
};
var updateDerivedState = (state) => {
  const hero = getHero(state);
  const opponents = getActiveBots(state).map((player) => player.cards);
  state.botStrategyMode = getBotStrategyMode(state);
  state.equity = calculateMultiwayEquity(hero.cards, opponents, state.board);
  state.villainRangeHint = describeTablePressure(state);
};
var generateAllowedActionsFor = (state, playerIndex = state.currentPlayerIndex) => {
  const player = state.players[playerIndex];
  if (state.street === "showdown" || player.folded || player.allIn) return [];
  const callAmount = amountToCall(state, player);
  const max = player.stack + player.bet;
  const potBased = Math.max(totalPot(state), 1);
  const options = [];
  if (callAmount > 0) {
    options.push({ type: "fold", label: "\u5F03\u724C" });
    options.push({ type: "call", label: `\u8DDF\u6CE8 ${callAmount}`, amount: callAmount });
    if (max > state.currentBet) {
      const raiseTarget = Math.min(max, Math.max(state.minRaiseTo, state.currentBet + Math.round(potBased * 0.66)));
      options.push({
        type: "raise",
        label: `\u52A0\u6CE8\u5230 ${raiseTarget}`,
        min: state.minRaiseTo,
        max,
        amount: raiseTarget
      });
    }
  } else {
    options.push({ type: "check", label: "\u8FC7\u724C" });
    if (player.stack > 0) {
      if (state.currentBet === 0) {
        const betAmount = Math.min(max, Math.max(2, Math.round(potBased * 0.66)));
        options.push({
          type: "bet",
          label: `\u4E0B\u6CE8 ${betAmount}`,
          min: 2,
          max,
          amount: betAmount
        });
      } else if (max > state.currentBet) {
        const raiseTarget = Math.min(max, Math.max(state.minRaiseTo, state.currentBet + Math.round(potBased * 0.66)));
        options.push({
          type: "raise",
          label: `\u52A0\u6CE8\u5230 ${raiseTarget}`,
          min: state.minRaiseTo,
          max,
          amount: raiseTarget
        });
      }
    }
  }
  if (player.stack > 0 && !options.some((option) => option.type === "all-in")) {
    options.push({
      type: "all-in",
      label: `\u5168\u4E0B ${max}`,
      amount: max,
      min: max,
      max
    });
  }
  return options;
};
var generateAllowedActions = (state) => {
  const player = state.players[state.currentPlayerIndex];
  if (!player.isHero) return [];
  return generateAllowedActionsFor(state, state.currentPlayerIndex);
};
var logAction = (state, actor, action, amount, note) => {
  const entry = {
    street: state.street,
    actorId: actor.id,
    actorName: actor.name,
    action,
    amount,
    potAfter: totalPot(state),
    ...note ? { note } : {}
  };
  state.actionLog.push(entry);
};
var collectPotAndAward = (state, winnerIds, reason, description, foldedByIds) => {
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
    ...foldedByIds && foldedByIds.length > 0 ? { foldedByIds } : {}
  };
};
var buildFoldWinDescription = (state, winner) => {
  const foldedOpponents = state.players.filter((player) => player.id !== winner.id && player.folded);
  if (foldedOpponents.length === 1) {
    return `${foldedOpponents[0].name} \u5F03\u724C\uFF0C${winner.name} \u8D62\u4E0B\u5E95\u6C60`;
  }
  if (foldedOpponents.length > 1) {
    return `\u5176\u4F59\u73A9\u5BB6\u5F03\u724C\uFF0C${winner.name} \u8D62\u4E0B\u5E95\u6C60`;
  }
  return `${winner.name} \u8D62\u4E0B\u5E95\u6C60`;
};
var resolveOnlyOnePlayerLeft = (state) => {
  const winner = getActivePlayers(state)[0];
  if (!winner) return;
  state.street = "showdown";
  const foldedByIds = state.players.filter((player) => player.id !== winner.id && player.folded).map((player) => player.id);
  state.result = collectPotAndAward(state, [winner.id], "fold", buildFoldWinDescription(state, winner), foldedByIds);
  state.nextActions = [];
};
var resolveShowdown = (state) => {
  const contenders = getActivePlayers(state);
  const evaluated = contenders.map((player) => ({
    player,
    hand: evaluateSevenCards([...player.cards, ...state.board])
  }));
  let best = evaluated[0];
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
  const description = winners.length === 1 ? `${winners[0].player.name} ${describeEvaluatedHand(winners[0].hand)}` : `\u5E73\u5206\u5E95\u6C60\uFF0C\u6700\u4F73\u724C\u578B ${describeEvaluatedHand(winners[0].hand)}`;
  state.result = collectPotAndAward(state, winnerIds, "showdown", description);
  state.nextActions = [];
};
var advanceStreet = (state) => {
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
var canAdvanceRound = (state) => {
  const active = getActivePlayers(state);
  if (active.length <= 1) return true;
  return active.every((player) => player.allIn || player.acted && player.bet === state.currentBet);
};
var normalizeDecision = (state, playerId, decision) => {
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
      ...decision.note ? { note: decision.note } : {}
    };
  }
  return {
    type: matched.type,
    ...matched.amount !== void 0 ? { amount: matched.amount } : {},
    ...decision.note ? { note: decision.note } : {}
  };
};
var maybeUpdateTournament = (state) => {
  if (!state.tournament) return;
  state.tournament = {
    ...state.tournament,
    handsUntilLevelUp: Math.max(0, state.tournament.handsUntilLevelUp - 1),
    opponents: getBots(state).map((entry) => ({
      id: entry.id,
      name: entry.name,
      stack: entry.stack,
      eliminated: entry.stack <= 0
    }))
  };
  if (state.tournament.handsUntilLevelUp === 0) {
    state.tournament = {
      ...state.tournament,
      level: state.tournament.level + 1,
      smallBlind: state.tournament.smallBlind + 1,
      bigBlind: state.tournament.bigBlind + 2,
      handsUntilLevelUp: 5
    };
  }
};
var settleHand = (state) => {
  maybeUpdateTournament(state);
  state.nextActions = [];
};
var applyDecision = (state, playerId, decision) => {
  const normalizedDecision = normalizeDecision(state, playerId, decision);
  const playerIndex = state.players.findIndex((player2) => player2.id === playerId);
  const player = state.players[playerIndex];
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
    const target = normalizedDecision.type === "all-in" ? player.bet + player.stack : Math.max(normalizedDecision.amount ?? state.minRaiseTo, normalizedDecision.type === "bet" ? 2 : state.minRaiseTo);
    const invest = Math.min(player.stack, target - player.bet);
    player.stack -= invest;
    player.bet += invest;
    player.acted = true;
    player.allIn = player.stack === 0;
    state.currentBet = Math.max(state.currentBet, player.bet);
    const raiseSize = Math.max(player.bet - previousBet, 2);
    state.minRaiseTo = state.currentBet + raiseSize;
    state.players = state.players.map(
      (entry) => entry.id === player.id ? player : { ...entry, acted: entry.folded || entry.allIn }
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
var heuristicBotDecision = (state, botId) => {
  const bot = state.players.find((player) => player.id === botId);
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
  const fitSize = (action, target) => {
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
    if (pressureAction && (handScore >= 30 || handScore >= 25 && bot.profile === "aggressive")) {
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
    if ((madeCategory >= 6 || madeCategory >= 5 && allInAction && pressure > STARTING_STACK / 2) && allInAction) {
      return { type: "all-in", amount: allInAction.amount };
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
      return bot.profile === "aggressive" && raiseAction && comboDraw ? { type: "raise", amount: fitSize(raiseAction, state.currentBet + pressure * 0.5) } : { type: "call" };
    }
    return legalActions.some((action) => action.type === "fold") ? { type: "fold" } : { type: "check" };
  }
  if (allInAction && madeCategory >= 6 && pressure > STARTING_STACK / 2) return { type: "all-in", amount: allInAction.amount };
  if (betAction && madeCategory >= 4) return { type: "bet", amount: fitSize(betAction, pressure * 0.8) };
  if (betAction && (madeCategory >= 2 || topPair || overpair)) return { type: "bet", amount: fitSize(betAction, pressure * 0.55) };
  if (betAction && strongDraw) return { type: "bet", amount: fitSize(betAction, pressure * 0.48) };
  if (betAction && bot.profile !== "careful" && summarizeBoardTexture(state.board).includes("\u504F\u5E72\u71E5")) {
    return { type: "bet", amount: fitSize(betAction, pressure * 0.34) };
  }
  return { type: "check" };
};
var huGtoBotDecision = (state, botId) => {
  const botIndex = state.players.findIndex((player) => player.id === botId);
  const bot = state.players[botIndex];
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
              decision: withActionAmount(raiseAction, "call", threeBetTarget, "hu-gto premium aggression")
            },
            { weight: 1, decision: { type: "call", note: "hu-gto premium continue" } }
          ],
          fallbackDecision
        );
      }
      if (handScore >= 30) {
        return chooseWeightedDecision(
          [
            {
              weight: raiseAction ? mixByProfile(0.38, bot.profile) : 0,
              decision: withActionAmount(raiseAction, "call", threeBetTarget * 0.92, "hu-gto strong mixed raise")
            },
            { weight: mixByProfile(0.68, bot.profile), decision: { type: "call", note: "hu-gto strong defend" } },
            { weight: 0.18, decision: { type: "fold", note: "hu-gto strong low-frequency fold" } }
          ],
          fallbackDecision
        );
      }
      if (handScore >= 25 && potOdds <= (hasButton ? 0.28 : 0.34) + profileMixShift(bot.profile) * 0.35) {
        return chooseWeightedDecision(
          [
            {
              weight: raiseAction ? mixByProfile(hasButton ? 0.12 : 0.18, bot.profile) : 0,
              decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.55, "hu-gto mixed defend raise")
            },
            { weight: mixByProfile(0.72, bot.profile), decision: { type: "call", note: "hu-gto mixed defend call" } },
            { weight: 0.24, decision: { type: "fold", note: "hu-gto mixed defend fold" } }
          ],
          fallbackDecision
        );
      }
      if (handScore >= 21 && potOdds <= (hasButton ? 0.18 : 0.24) + profileMixShift(bot.profile) * 0.25) {
        return chooseWeightedDecision(
          [
            { weight: mixByProfile(0.42, bot.profile), decision: { type: "call", note: "hu-gto fringe defend" } },
            { weight: 0.58, decision: { type: "fold", note: "hu-gto fringe release" } }
          ],
          fallbackDecision
        );
      }
      return legalActions.some((action) => action.type === "fold") ? { type: "fold", note: "hu-gto preflop fold" } : { type: "check", note: "hu-gto forced check" };
    }
    if (!pressureAction) return { type: "check", note: "hu-gto no open size" };
    if (handScore >= 36) {
      return withActionAmount(pressureAction, pressureAction.type, openTarget * 1.08, "hu-gto premium open");
    }
    if (handScore >= 30) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.84, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget, "hu-gto strong open") },
          { weight: 0.16, decision: { type: "check", note: "hu-gto strong trap check" } }
        ],
        fallbackDecision
      );
    }
    if (handScore >= 24) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(hasButton ? 0.62 : 0.44, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget * 0.96, "hu-gto mixed open") },
          { weight: 1, decision: { type: "check", note: "hu-gto mixed check" } }
        ],
        fallbackDecision
      );
    }
    if (handScore >= 20) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(hasButton ? 0.22 : 0.12, bot.profile), decision: withActionAmount(pressureAction, pressureAction.type, openTarget * 0.88, "hu-gto low-frequency stab") },
          { weight: 1, decision: { type: "check", note: "hu-gto low-frequency pass" } }
        ],
        fallbackDecision
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
  const semiBluff = comboDraw || strongDraw && equityShare >= 0.34;
  if (toCall > 0) {
    if (strongValue && allInAction && equityShare >= 0.86 && pressure >= STARTING_STACK * 0.45) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.32, bot.profile), decision: { type: "all-in", amount: allInAction.amount, note: "hu-gto value jam" } },
          {
            weight: raiseAction ? mixByProfile(0.52, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.8, "hu-gto value raise")
          },
          { weight: 1, decision: { type: "call", note: "hu-gto trap call" } }
        ],
        fallbackDecision
      );
    }
    if (valueHand) {
      return chooseWeightedDecision(
        [
          {
            weight: raiseAction ? mixByProfile(boardIsWet(texture) ? 0.26 : 0.18, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * (boardIsWet(texture) ? 0.72 : 0.55), "hu-gto mixed value raise")
          },
          { weight: 1, decision: { type: "call", note: "hu-gto bluff-catch continue" } }
        ],
        fallbackDecision
      );
    }
    if (semiBluff && potOdds <= equityShare + 0.08) {
      return chooseWeightedDecision(
        [
          {
            weight: raiseAction ? mixByProfile(comboDraw ? 0.28 : 0.14, bot.profile) : 0,
            decision: withActionAmount(raiseAction, "call", state.currentBet + pressure * 0.58, "hu-gto semi-bluff raise")
          },
          { weight: 1, decision: { type: "call", note: "hu-gto draw continue" } }
        ],
        fallbackDecision
      );
    }
    if (bluffCatcher && potOdds <= equityShare * 0.92 + 0.07) {
      return chooseWeightedDecision(
        [
          { weight: mixByProfile(0.58, bot.profile), decision: { type: "call", note: "hu-gto bluff-catch call" } },
          { weight: 0.42, decision: { type: "fold", note: "hu-gto bluff-catch fold mix" } }
        ],
        fallbackDecision
      );
    }
    return legalActions.some((action) => action.type === "fold") ? { type: "fold", note: "hu-gto postflop fold" } : { type: "check", note: "hu-gto postflop check" };
  }
  if (!pressureAction) return { type: "check", note: "hu-gto no c-bet lane" };
  if (strongValue) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(0.82, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.9 : pressure * 0.82, "hu-gto value bet")
        },
        { weight: 0.18, decision: { type: "check", note: "hu-gto slowplay mix" } }
      ],
      fallbackDecision
    );
  }
  if (valueHand) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(boardIsWet(texture) ? 0.66 : 0.54, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.62 : pressure * 0.58, "hu-gto thin value")
        },
        { weight: 1, decision: { type: "check", note: "hu-gto medium showdown check" } }
      ],
      fallbackDecision
    );
  }
  if (semiBluff) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(comboDraw ? 0.58 : 0.42, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.54 : pressure * 0.46, "hu-gto semi-bluff stab")
        },
        { weight: 1, decision: { type: "check", note: "hu-gto draw check" } }
      ],
      fallbackDecision
    );
  }
  if (boardIsDry(texture)) {
    return chooseWeightedDecision(
      [
        {
          weight: mixByProfile(0.26, bot.profile),
          decision: withActionAmount(pressureAction, pressureAction.type, pressureAction.type === "raise" ? state.currentBet + pressure * 0.4 : pressure * 0.32, "hu-gto range stab")
        },
        { weight: 1, decision: { type: "check", note: "hu-gto check back air" } }
      ],
      fallbackDecision
    );
  }
  return { type: "check", note: "hu-gto give up" };
};
var botDecision = (state, botId) => getBotStrategyMode(state) === "hu-gto" ? huGtoBotDecision(state, botId) : heuristicBotDecision(state, botId);
var autoplayUntilHero = (state) => {
  while (state.street !== "showdown") {
    const player = state.players[state.currentPlayerIndex];
    if (player.isHero) break;
    applyDecision(state, player.id, botDecision(state, player.id));
  }
  state.nextActions = generateAllowedActions(state);
};
var buildTournament = (bots) => ({
  level: 1,
  smallBlind: 1,
  bigBlind: 2,
  ante: 0,
  handsUntilLevelUp: 5,
  opponents: bots.map((entry) => ({
    id: entry.id,
    name: entry.name,
    stack: entry.stack,
    eliminated: false
  }))
});
var createHandState = (options) => {
  const botCount = normalizeBotCount(options.botCount);
  const shuffledDeck = shuffleDeck(buildDeck(), Date.now() / 1e3);
  const [heroCards, afterHero] = drawCards(shuffledDeck, 2);
  const profiles = createRandomProfiles(botCount);
  let deck = afterHero;
  const bots = [];
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
      profile: profiles[index]
    });
  }
  const players = [
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
      profile: "balanced"
    },
    ...bots
  ];
  const tournament = options.mode === "tournament" ? buildTournament(bots) : void 0;
  const buttonIndex = Math.floor(Math.random() * players.length);
  const positions = resolveBlindPositions({ players }, buttonIndex);
  const smallBlind = tournament?.smallBlind ?? 1;
  const bigBlind = tournament?.bigBlind ?? 2;
  postBlind(players[positions.smallBlindIndex], smallBlind);
  postBlind(players[positions.bigBlindIndex], bigBlind);
  const state = {
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
    villainRangeHint: "\u724C\u684C\u8BFB\u53D6\u4E2D",
    equity: {
      winRate: 0,
      tieRate: 0,
      lossRate: 0,
      iterations: 0
    },
    ...tournament ? { tournament } : {}
  };
  updateDerivedState(state);
  autoplayUntilHero(state);
  state.nextActions = generateAllowedActions(state);
  return state;
};
var createNextHandState = (previous) => {
  const { result: _previousResult, tournament: _previousTournament, ...previousBase } = previous;
  const players = clonePlayers(previous.players).map((player) => ({
    ...player,
    stack: player.stack > 0 ? player.stack : STARTING_STACK,
    bet: 0,
    cards: [],
    folded: false,
    allIn: false,
    acted: false
  }));
  const shuffledDeck = shuffleDeck(buildDeck(), Date.now() / 1e3);
  let deck = shuffledDeck;
  for (let index = 0; index < players.length; index += 1) {
    const [cards, nextDeck] = drawCards(deck, 2);
    deck = nextDeck;
    players[index] = {
      ...players[index],
      cards
    };
  }
  const tournament = previous.tournament ? {
    ...previous.tournament,
    opponents: players.filter((player) => !player.isHero).map((player) => ({
      id: player.id,
      name: player.name,
      stack: player.stack,
      eliminated: player.stack <= 0
    }))
  } : void 0;
  const buttonIndex = nextActiveIndex({ ...previous, players }, previous.buttonIndex);
  const positions = resolveBlindPositions({ ...previous, players }, buttonIndex);
  const smallBlind = tournament?.smallBlind ?? 1;
  const bigBlind = tournament?.bigBlind ?? 2;
  postBlind(players[positions.smallBlindIndex], smallBlind);
  postBlind(players[positions.bigBlindIndex], bigBlind);
  const state = {
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
    ...tournament ? { tournament } : {}
  };
  updateDerivedState(state);
  autoplayUntilHero(state);
  state.nextActions = generateAllowedActions(state);
  return state;
};
var advanceHandState = (state, decision) => {
  const snapshot = {
    ...state,
    board: [...state.board],
    deck: [...state.deck],
    players: clonePlayers(state.players),
    actionLog: [...state.actionLog],
    nextActions: [...state.nextActions],
    equity: { ...state.equity },
    ...state.tournament ? { tournament: { ...state.tournament, opponents: state.tournament.opponents.map((entry) => ({ ...entry })) } } : {},
    ...state.result ? { result: { ...state.result, board: [...state.result.board], winnerIds: [...state.result.winnerIds] } } : {}
  };
  applyDecision(snapshot, snapshot.heroId, decision);
  autoplayUntilHero(snapshot);
  if (snapshot.street === "showdown") {
    snapshot.nextActions = [];
  }
  return snapshot;
};
export {
  RANKS,
  SUITS,
  advanceHandState,
  buildDeck,
  calculateEquity,
  calculateMultiwayEquity,
  compareHands,
  createHandState,
  createNextHandState,
  describeEvaluatedHand,
  describeShowdown,
  drawCards,
  evaluateSevenCards,
  parseCard,
  rankValue,
  shuffleDeck,
  summarizeBoardTexture
};
