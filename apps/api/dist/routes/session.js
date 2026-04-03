import { advanceHandState, createHandState, createNextHandState } from "@poker/shared";
import { z } from "zod";
import { loadLatestSession, loadRecentHistory, loadSession, saveSession } from "../db/store.js";
import { getCoachingAdvice } from "../services/coach.js";
const startSchema = z.object({
    mode: z.enum(["practice", "tournament"]),
    heroName: z.string().optional(),
    botCount: z.number().int().min(1).max(5).optional(),
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
const normalizeResult = (result) => {
    if (!result)
        return result;
    if (result.reason && !result.description.includes("通过弃牌赢下底池"))
        return result;
    const foldMatch = result.description.match(/^(.*) 通过弃牌赢下底池$/);
    return {
        ...result,
        reason: result.reason ?? (result.description.includes("弃牌") ? "fold" : "showdown"),
        ...(foldMatch ? { description: `其余玩家弃牌，${foldMatch[1]} 赢下底池` } : {}),
    };
};
export const registerSessionRoutes = async (app) => {
    app.get("/session/current", async (request) => {
        const query = z.object({ mode: z.enum(["practice", "tournament"]).optional() }).parse(request.query);
        return loadLatestSession(query.mode) ?? null;
    });
    app.post("/session/start", async (request) => {
        const input = startSchema.parse(request.body);
        const state = createHandState({
            mode: input.mode,
            ...(input.heroName ? { heroName: input.heroName } : {}),
            ...(input.botCount !== undefined ? { botCount: input.botCount } : {}),
        });
        saveSession(state);
        return state;
    });
    app.post("/session/action", async (request, reply) => {
        const input = actionSchema.parse(request.body);
        const session = loadSession(input.sessionId);
        if (!session) {
            return reply.code(404).send({ message: "session not found" });
        }
        try {
            const nextState = advanceHandState(session, input.amount === undefined ? { type: input.type } : { type: input.type, amount: input.amount });
            saveSession(nextState);
            return nextState;
        }
        catch (error) {
            return reply.code(400).send({
                message: error instanceof Error ? error.message : "invalid action",
            });
        }
    });
    app.post("/session/next-hand", async (request, reply) => {
        const body = z.object({ sessionId: z.string() }).parse(request.body);
        const session = loadSession(body.sessionId);
        if (!session) {
            return reply.code(404).send({ message: "session not found" });
        }
        const nextState = createNextHandState(session);
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
            result: row.result_json ? normalizeResult(JSON.parse(row.result_json)) : null,
            actionLog: JSON.parse(row.action_log_json),
            createdAt: row.created_at,
        }));
    });
};
