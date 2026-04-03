import { buildDeck, parseCard, shuffleDeck } from "./cards";
import { compareHands, describeEvaluatedHand, evaluateSevenCards } from "./evaluator";
import type { CardCode, EquityBreakdown } from "./types";

const takeRandomAvailable = (excluded: Set<CardCode>, count: number, seed: number): CardCode[] => {
  const deck = shuffleDeck(
    buildDeck().filter((card) => !excluded.has(card)),
    seed,
  );
  return deck.slice(0, count);
};

export const calculateEquity = (
  hero: CardCode[],
  villain: CardCode[],
  board: CardCode[],
  iterations = 600,
): EquityBreakdown => {
  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let index = 0; index < iterations; index += 1) {
    const used = new Set<CardCode>([...hero, ...villain, ...board]);
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
    iterations,
  };
};

export const calculateMultiwayEquity = (
  hero: CardCode[],
  opponents: CardCode[][],
  board: CardCode[],
  iterations = 500,
): EquityBreakdown => {
  if (opponents.length === 0) {
    return {
      winRate: 1,
      tieRate: 0,
      lossRate: 0,
      iterations: 1,
    };
  }

  let wins = 0;
  let ties = 0;
  let losses = 0;

  for (let index = 0; index < iterations; index += 1) {
    const used = new Set<CardCode>([...hero, ...opponents.flat(), ...board]);
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
    iterations,
  };
};

export const summarizeBoardTexture = (board: CardCode[]): string => {
  if (board.length === 0) return "未知翻前";
  const parsed = board.map(parseCard);
  const suits = new Set(parsed.map((card) => card.suit));
  const values = parsed.map((card) => card.value).sort((a, b) => a - b);
  const connected = values.at(-1)! - values[0]! <= 4;
  const paired = new Set(values).size !== values.length;

  return [
    suits.size === 1 ? "同花面" : suits.size === 2 ? "偏同花面" : "彩虹面",
    paired ? "有对子" : "无对子",
    connected ? "偏连张" : "偏干燥",
  ].join(" / ");
};

export const describeShowdown = (cards: CardCode[]): string => describeEvaluatedHand(evaluateSevenCards(cards));
