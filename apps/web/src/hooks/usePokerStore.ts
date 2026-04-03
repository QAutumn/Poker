import { create } from "zustand";
import { calculateEquity } from "@poker/shared";
import type { HandState, PlayerDecision, SessionMode } from "@poker/shared";

import { fetchAdvice, fetchHistory, sendAction, startSession } from "../api/client";

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
    result: { description: string; pot: number } | null;
    actionLog: Array<{ actorName: string; action: string; amount: number; street: string }>;
    createdAt: string;
  }>;
  equityLab: EquityLabState;
  boot: () => Promise<void>;
  restart: (mode: SessionMode) => Promise<void>;
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

export const usePokerStore = create<PokerStore>((set, get) => ({
  mode: "practice",
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
      const [session, history] = await Promise.all([startSession("practice"), fetchHistory()]);
      set({
        session,
        history,
        mode: "practice",
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
    set({ loading: true, mode, advice: undefined, adviceSource: undefined, error: undefined });
    try {
      const session = await startSession(mode);
      const history = await fetchHistory();
      set({ session, history, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "restart failed",
      });
    }
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
        splitCards(hero) as [string, string],
        splitCards(villain) as [string, string],
        splitCards(board) as string[],
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
