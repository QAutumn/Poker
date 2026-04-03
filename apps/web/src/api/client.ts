import type { HandState, PlayerDecision, SessionMode } from "@poker/shared";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/poker-api";

export interface AdviceResponse {
  source: "cache" | "local" | "deepseek";
  text: string;
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

export const startSession = (mode: SessionMode) =>
  request<HandState>("/session/start", {
    method: "POST",
    body: JSON.stringify({ mode, heroName: "邱文杰大爷" }),
  });

export const sendAction = (sessionId: string, decision: PlayerDecision) =>
  request<HandState>("/session/action", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      type: decision.type,
      amount: decision.amount,
    }),
  });

export const fetchAdvice = (sessionId: string) =>
  request<AdviceResponse>("/coach/advice", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });

export const fetchHistory = () =>
  request<
    Array<{
      id: number;
      sessionId: string;
      handNumber: number;
      mode: string;
      board: string[];
      result: { description: string; pot: number } | null;
      actionLog: Array<{ actorName: string; action: string; amount: number; street: string }>;
      createdAt: string;
    }>
  >("/history");
