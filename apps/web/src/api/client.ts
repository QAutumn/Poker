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
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch {
      const text = await response.text();
      if (text) message = text;
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
};

export const startSession = (mode: SessionMode, botCount = 1) =>
  request<HandState>("/session/start", {
    method: "POST",
    body: JSON.stringify({ mode, heroName: "邱文杰大爷", botCount }),
  });

export const fetchCurrentSession = (mode: SessionMode) =>
  request<HandState | null>(`/session/current?mode=${mode}`);

export const startNextHand = (sessionId: string) =>
  request<HandState>("/session/next-hand", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
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
      result: HandState["result"] | null;
      actionLog: Array<{ actorName: string; action: string; amount: number; street: string }>;
      createdAt: string;
    }>
  >("/history");
