import { create } from "zustand";
import { calculateEquity } from "@poker/shared";
import type { CardCode, HandState, PlayerDecision, SessionMode } from "@poker/shared";

import { fetchAdvice, fetchCurrentSession, fetchHistory, sendAction, startNextHand, startSession } from "../api/client";

interface EquityLabState {
  hero: string;
  villain: string;
  board: string;
  result?: {
    winRate: number;
    tieRate: number;
    lossRate: number;
    iterations: number;
  };
  error?: string;
}

interface PokerStore {
  mode: SessionMode;
  botCount: number;
  session?: HandState;
  loading: boolean;
  actionPending: boolean;
  advicePending: boolean;
  advice?: string;
  adviceSource?: string;
  error?: string;
  history: Array<{
    id: number;
    sessionId: string;
    handNumber: number;
    mode: string;
    board: string[];
    result: HandState["result"] | null;
    actionLog: Array<{ actorName: string; action: string; amount: number; street: string }>;
    createdAt: string;
  }>;
  equityLab: EquityLabState;
  boot: () => Promise<void>;
  restart: (mode: SessionMode) => Promise<void>;
  nextHand: () => Promise<void>;
  setBotCount: (botCount: number) => void;
  act: (decision: PlayerDecision) => Promise<void>;
  askAdvice: () => Promise<void>;
  updateLab: (patch: Partial<EquityLabState>) => void;
  computeLab: () => void;
}

const splitCards = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const asCardTuple = (value: string): [CardCode, CardCode] => {
  const cards = splitCards(value);
  if (cards.length !== 2) throw new Error("need exactly two cards");
  return cards as [CardCode, CardCode];
};

const asBoardCards = (value: string) => splitCards(value) as CardCode[];
const STORAGE_MODE_KEY = "quantart-poker-mode";
const STORAGE_BOT_KEY = "quantart-poker-bot-count";

const readMode = (): SessionMode => {
  if (typeof window === "undefined") return "practice";
  const saved = window.localStorage.getItem(STORAGE_MODE_KEY);
  return saved === "tournament" ? "tournament" : "practice";
};

const readBotCount = () => {
  if (typeof window === "undefined") return 1;
  const saved = Number(window.localStorage.getItem(STORAGE_BOT_KEY) ?? 1);
  if (!Number.isFinite(saved)) return 1;
  return Math.min(5, Math.max(1, Math.round(saved)));
};

const persistMode = (mode: SessionMode) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_MODE_KEY, mode);
};

const persistBotCount = (botCount: number) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_BOT_KEY, String(Math.min(5, Math.max(1, Math.round(botCount)))));
};

export const usePokerStore = create<PokerStore>((set, get) => ({
  mode: readMode(),
  botCount: readBotCount(),
  loading: true,
  actionPending: false,
  advicePending: false,
  history: [],
  equityLab: {
    hero: "As Kh",
    villain: "Qd Qc",
    board: "Jh Ts 2c",
  },
  boot: async () => {
    set({ loading: true, error: undefined });
    try {
      const mode = get().mode;
      const botCount = get().botCount;
      const [existing, history] = await Promise.all([fetchCurrentSession(mode), fetchHistory()]);
      const session = existing ?? (await startSession(mode, botCount));
      persistMode(session.mode);
      persistBotCount(Math.max(1, session.players.filter((player) => !player.isHero).length));
      set({
        session,
        history,
        mode: session.mode,
        botCount: Math.max(1, session.players.filter((player) => !player.isHero).length),
        loading: false,
        advice: undefined,
        adviceSource: undefined,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "boot failed",
      });
    }
  },
  restart: async (mode) => {
    const botCount = get().botCount;
    set({ loading: true, mode, advice: undefined, adviceSource: undefined, error: undefined });
    try {
      const session = await startSession(mode, botCount);
      const history = await fetchHistory();
      persistMode(mode);
      persistBotCount(botCount);
      set({ session, history, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "restart failed",
      });
    }
  },
  nextHand: async () => {
    const session = get().session;
    if (!session) return;
    set({ loading: true, advice: undefined, adviceSource: undefined, error: undefined });
    try {
      const nextSession = await startNextHand(session.sessionId);
      const history = await fetchHistory();
      persistMode(nextSession.mode);
      persistBotCount(Math.max(1, nextSession.players.filter((player) => !player.isHero).length));
      set({
        session: nextSession,
        history,
        loading: false,
        botCount: Math.max(1, nextSession.players.filter((player) => !player.isHero).length),
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "next hand failed",
      });
    }
  },
  setBotCount: (botCount) => {
    const normalized = Math.min(5, Math.max(1, Math.round(botCount)));
    persistBotCount(normalized);
    set({ botCount: normalized });
  },
  act: async (decision) => {
    const session = get().session;
    if (!session) return;
    set({ actionPending: true, error: undefined, advice: undefined, adviceSource: undefined });
    try {
      const nextSession = await sendAction(session.sessionId, decision);
      const history = nextSession.result ? await fetchHistory() : get().history;
      set({ session: nextSession, history, actionPending: false });
    } catch (error) {
      set({
        actionPending: false,
        error: error instanceof Error ? error.message : "action failed",
      });
    }
  },
  askAdvice: async () => {
    const session = get().session;
    if (!session) return;
    set({ advicePending: true, error: undefined });
    try {
      const advice = await fetchAdvice(session.sessionId);
      set({ advice: advice.text, adviceSource: advice.source, advicePending: false });
    } catch (error) {
      set({
        advicePending: false,
        error: error instanceof Error ? error.message : "advice failed",
      });
    }
  },
  updateLab: (patch) => {
    set((state) => ({
      equityLab: {
        ...state.equityLab,
        ...patch,
      },
    }));
  },
  computeLab: () => {
    const { hero, villain, board } = get().equityLab;
    try {
      const result = calculateEquity(
        asCardTuple(hero),
        asCardTuple(villain),
        asBoardCards(board),
        900,
      );
      set((state) => ({
        equityLab: {
          ...state.equityLab,
          result,
          error: undefined,
        },
      }));
    } catch {
      set((state) => ({
        equityLab: {
          ...state.equityLab,
          error: "请按 As Kh 这种格式输入两张手牌和最多五张公共牌。",
        },
      }));
    }
  },
}));
