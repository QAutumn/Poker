import { advanceHandState, createHandState } from "@poker/shared";
import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { loadRecentHistory, loadSession, saveSession } from "../db/store";
import { getCoachingAdvice } from "../services/coach";

const startSchema = z.object({
  mode: z.enum(["practice", "tournament"]),
  heroName: z.string().optional(),
});

const actionSchema = z.object({
  sessionId: z.string(),
  type: z.enum(["fold", "check", "call", "bet", "raise", "all-in"]),
  amount: z.number().optional(),
});

const equitySchema = z.object({
  hero: z.array(z.string()).length(2),
  villain: z.array(z.string()).length(2),
  board: z.array(z.string()).max(5),
});

export const registerSessionRoutes = async (app: FastifyInstance) => {
  app.post("/session/start", async (request) => {
    const input = startSchema.parse(request.body);
    const state = createHandState(input);
    saveSession(state);
    return state;
  });

  app.post("/session/action", async (request, reply) => {
    const input = actionSchema.parse(request.body);
    const session = loadSession(input.sessionId);
    if (!session) {
      return reply.code(404).send({ message: "session not found" });
    }

    const nextState = advanceHandState(session, {
      type: input.type,
      amount: input.amount,
    });
    saveSession(nextState);
    return nextState;
  });

  app.post("/coach/advice", async (request, reply) => {
    const body = z.object({ sessionId: z.string() }).parse(request.body);
    const session = loadSession(body.sessionId);
    if (!session) {
      return reply.code(404).send({ message: "session not found" });
    }

    return getCoachingAdvice(session);
  });

  app.get("/history", async () => {
    return loadRecentHistory().map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      handNumber: row.hand_number,
      mode: row.mode,
      board: JSON.parse(row.board),
      result: row.result_json ? JSON.parse(row.result_json) : null,
      actionLog: JSON.parse(row.action_log_json),
      createdAt: row.created_at,
    }));
  });
};
