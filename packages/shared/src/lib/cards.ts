import type { CardCode, Rank, Suit } from "./types";

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS: Suit[] = ["s", "h", "d", "c"];

export const rankValue = (rank: Rank): number => RANKS.indexOf(rank) + 2;

export const buildDeck = (): CardCode[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}` as CardCode));

export const shuffleDeck = (deck: CardCode[], seed = Math.random()): CardCode[] => {
  const values = [...deck];
  let random = Math.abs(Math.sin(seed)) * 10000;

  for (let index = values.length - 1; index > 0; index -= 1) {
    random = (random * 9301 + 49297) % 233280;
    const swapIndex = Math.floor((random / 233280) * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }

  return values;
};

export const drawCards = (deck: CardCode[], count: number): [CardCode[], CardCode[]] => {
  return [deck.slice(0, count), deck.slice(count)];
};

export const parseCard = (card: CardCode) => ({
  rank: card[0] as Rank,
  suit: card[1] as Suit,
  value: rankValue(card[0] as Rank),
});
