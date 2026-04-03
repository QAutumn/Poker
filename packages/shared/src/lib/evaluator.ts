import { parseCard } from "./cards";
import type { CardCode } from "./types";

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

export const describeEvaluatedHand = (hand: EvaluatedHand): string => {
  return `${HAND_NAMES[hand.category]} ${hand.ranks.join("-")}`;
};
