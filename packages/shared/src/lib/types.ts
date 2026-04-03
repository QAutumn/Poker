export type Suit = "s" | "h" | "d" | "c";

export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";

export type CardCode = `${Rank}${Suit}`;

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type SessionMode = "practice" | "tournament";
export type BotStrategyMode = "hu-gto" | "multiway-heuristic";

export type ActionType =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "all-in";

export type PlayerProfile = "balanced" | "aggressive" | "careful";

export interface PlayerState {
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

export interface TournamentMeta {
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

export interface ActionLog {
  street: Street;
  actorId: string;
  actorName: string;
  action: ActionType;
  amount: number;
  potAfter: number;
  note?: string;
}

export interface AllowedAction {
  type: ActionType;
  min?: number;
  max?: number;
  amount?: number;
  label: string;
}

export interface HandResult {
  reason: "fold" | "showdown";
  winnerIds: string[];
  description: string;
  board: CardCode[];
  pot: number;
  foldedByIds?: string[];
}

export interface EquityBreakdown {
  winRate: number;
  tieRate: number;
  lossRate: number;
  iterations: number;
}

export interface HandState {
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

export interface SessionOptions {
  mode: SessionMode;
  heroName?: string;
  botCount?: number;
}

export interface PlayerDecision {
  type: ActionType;
  amount?: number;
  note?: string;
}
