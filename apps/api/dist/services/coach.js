import { createHash } from "node:crypto";
import { summarizeBoardTexture } from "@poker/shared";
import { config } from "../core/config.js";
import { loadAdvice, saveAdvice } from "../db/store.js";
const chatCompletionUrl = (() => {
    const base = config.deepseekBaseUrl.replace(/\/$/, "");
    return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
})();
const heuristicAdvice = (state) => {
    const hero = state.players.find((player) => player.isHero);
    const opponents = state.players.filter((player) => !player.isHero && !player.folded);
    const focus = state.players[state.currentPlayerIndex]?.isHero ? opponents[0] : state.players[state.currentPlayerIndex];
    const toCall = Math.max(0, state.currentBet - hero.bet);
    const rangePressure = state.mode === "tournament" ? "锦标赛筹码压力更高，边缘跟注要收紧。" : "练习模式优先训练下注尺度和持续下注逻辑。";
    const equity = `${Math.round(state.equity.winRate * 100)}%`;
    const actionLine = toCall > 0
        ? `当前面对 ${toCall} 筹码压力，若继续建议优先考虑跟注或中等尺度再加注。`
        : "当前没有待跟注金额，主动下注会更有训练价值。";
    return [
        `本地教练结论：你当前手牌胜率约 ${equity}，牌面属于 ${summarizeBoardTexture(state.board)}。`,
        `${rangePressure}`,
        `${focus?.name ?? "当前电脑"} 的牌桌提示是“${state.villainRangeHint}”，不要把所有高张都当成纯价值下注。`,
        `${actionLine}`,
    ].join(" ");
};
const buildPrompt = (state) => {
    const hero = state.players.find((player) => player.isHero);
    const opponents = state.players
        .filter((player) => !player.isHero)
        .map((player) => ({
        name: player.name,
        profile: player.profile,
        stack: player.stack,
        folded: player.folded,
        allIn: player.allIn,
    }));
    const toCall = Math.max(0, state.currentBet - hero.bet);
    return [
        "你是专业德州扑克教练，用中文回答。",
        "任务：给出当前局面的最优行动建议、下注尺度建议、简要理由，并指出一个最容易犯的错误。",
        "要求：不要展开成论文，控制在 180 字以内，结构为“建议 / 理由 / 风险”。",
        JSON.stringify({
            mode: state.mode,
            street: state.street,
            heroCards: hero.cards,
            board: state.board,
            heroStack: hero.stack,
            opponents,
            pot: state.pot + state.players.reduce((sum, player) => sum + player.bet, 0),
            toCall,
            equity: state.equity,
            villainRangeHint: state.villainRangeHint,
            allowedActions: state.nextActions,
            tournament: state.tournament,
            boardTexture: summarizeBoardTexture(state.board),
        }),
    ].join("\n");
};
const cacheKeyFor = (state) => createHash("sha1")
    .update(JSON.stringify({
    hand: state.handNumber,
    mode: state.mode,
    street: state.street,
    hero: state.players.find((entry) => entry.isHero)?.cards,
    villain: state.players.find((entry) => !entry.isHero)?.cards,
    board: state.board,
    pot: state.pot,
    bet: state.currentBet,
    actions: state.actionLog,
}))
    .digest("hex");
export const getCoachingAdvice = async (state) => {
    const cacheKey = cacheKeyFor(state);
    const cached = loadAdvice(cacheKey);
    if (cached)
        return { source: "cache", text: cached.response };
    if (!config.deepseekApiKey) {
        const fallback = heuristicAdvice(state);
        saveAdvice(cacheKey, fallback);
        return { source: "local", text: fallback };
    }
    const response = await fetch(chatCompletionUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.deepseekApiKey}`,
        },
        body: JSON.stringify({
            model: config.deepseekModel,
            messages: [
                {
                    role: "system",
                    content: "你是德州扑克训练教练，只给出基于局面信息的严谨建议，不要编造不存在的数据。",
                },
                {
                    role: "user",
                    content: buildPrompt(state),
                },
            ],
            temperature: 0.2,
            max_tokens: 280,
        }),
    });
    if (!response.ok) {
        const fallback = heuristicAdvice(state);
        saveAdvice(cacheKey, fallback);
        return { source: "local", text: fallback };
    }
    const payload = (await response.json());
    const text = payload.choices?.[0]?.message?.content?.trim() || heuristicAdvice(state);
    saveAdvice(cacheKey, text);
    return { source: "deepseek", text };
};
