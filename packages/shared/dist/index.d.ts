type Suit = "s" | "h" | "d" | "c";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
type CardCode = `${Rank}${Suit}`;
type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
type SessionMode = "practice" | "tournament";
type BotStrategyMode = "hu-gto" | "multiway-heuristic";
type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";
type PlayerProfile = "balanced" | "aggressive" | "careful";
interface PlayerState {
    id: string;
    name: string;
    stack: number;
    bet: number;
    cards: CardCode[];
    folded: boolean;
    allIn: boolean;
    acted: boolean;
    isHero: boolean;
    profile: PlayerProfile;
}
interface TournamentMeta {
    level: number;
    smallBlind: number;
    bigBlind: number;
    ante: number;
    handsUntilLevelUp: number;
    opponents: Array<{
        id: string;
        name: string;
        stack: number;
        eliminated: boolean;
    }>;
}
interface ActionLog {
    street: Street;
    actorId: string;
    actorName: string;
    action: ActionType;
    amount: number;
    potAfter: number;
    note?: string;
}
interface AllowedAction {
    type: ActionType;
    min?: number;
    max?: number;
    amount?: number;
    label: string;
}
interface HandResult {
    reason: "fold" | "showdown";
    winnerIds: string[];
    description: string;
    board: CardCode[];
    pot: number;
    foldedByIds?: string[];
}
interface EquityBreakdown {
    winRate: number;
    tieRate: number;
    lossRate: number;
    iterations: number;
}
interface HandState {
    sessionId: string;
    handNumber: number;
    mode: SessionMode;
    botStrategyMode: BotStrategyMode;
    street: Street;
    heroId: string;
    buttonIndex: number;
    currentPlayerIndex: number;
    currentBet: number;
    minRaiseTo: number;
    pot: number;
    board: CardCode[];
    deck: CardCode[];
    players: PlayerState[];
    actionLog: ActionLog[];
    result?: HandResult;
    nextActions: AllowedAction[];
    villainRangeHint: string;
    equity: EquityBreakdown;
    tournament?: TournamentMeta;
}
interface SessionOptions {
    mode: SessionMode;
    heroName?: string;
    botCount?: number;
}
interface PlayerDecision {
    type: ActionType;
    amount?: number;
    note?: string;
}

declare const RANKS: Rank[];
declare const SUITS: Suit[];
declare const rankValue: (rank: Rank) => number;
declare const buildDeck: () => CardCode[];
declare const shuffleDeck: (deck: CardCode[], seed?: number) => CardCode[];
declare const drawCards: (deck: CardCode[], count: number) => [CardCode[], CardCode[]];
declare const parseCard: (card: CardCode) => {
    rank: Rank;
    suit: Suit;
    value: number;
};

interface EvaluatedHand {
    category: number;
    ranks: number[];
}
declare const compareHands: (left: EvaluatedHand, right: EvaluatedHand) => number;
declare const evaluateSevenCards: (cards: CardCode[]) => EvaluatedHand;
declare const describeEvaluatedHand: (hand: EvaluatedHand) => string;

declare const createHandState: (options: SessionOptions) => HandState;
declare const createNextHandState: (previous: HandState) => HandState;
declare const advanceHandState: (state: HandState, decision: PlayerDecision) => HandState;

declare const calculateEquity: (hero: CardCode[], villain: CardCode[], board: CardCode[], iterations?: number) => EquityBreakdown;
declare const calculateMultiwayEquity: (hero: CardCode[], opponents: CardCode[][], board: CardCode[], iterations?: number) => EquityBreakdown;
declare const summarizeBoardTexture: (board: CardCode[]) => string;
declare const describeShowdown: (cards: CardCode[]) => string;

export { type ActionLog, type ActionType, type AllowedAction, type BotStrategyMode, type CardCode, type EquityBreakdown, type EvaluatedHand, type HandResult, type HandState, type PlayerDecision, type PlayerProfile, type PlayerState, RANKS, type Rank, SUITS, type SessionMode, type SessionOptions, type Street, type Suit, type TournamentMeta, advanceHandState, buildDeck, calculateEquity, calculateMultiwayEquity, compareHands, createHandState, createNextHandState, describeEvaluatedHand, describeShowdown, drawCards, evaluateSevenCards, parseCard, rankValue, shuffleDeck, summarizeBoardTexture };
