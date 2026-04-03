import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../core/config.js";
const dataDir = path.resolve(process.cwd(), config.dataDir);
fs.mkdirSync(dataDir, { recursive: true });
const database = new DatabaseSync(path.join(dataDir, "poker.db"));
database.exec("PRAGMA journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS hand_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    hand_number INTEGER NOT NULL,
    mode TEXT NOT NULL,
    board TEXT NOT NULL,
    result_json TEXT,
    action_log_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS advice_cache (
    cache_key TEXT PRIMARY KEY,
    response TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
const upsertSessionStmt = database.prepare(`
  INSERT INTO sessions (session_id, mode, state_json, updated_at)
  VALUES (@sessionId, @mode, @stateJson, CURRENT_TIMESTAMP)
  ON CONFLICT(session_id) DO UPDATE SET
    state_json = excluded.state_json,
    updated_at = CURRENT_TIMESTAMP
`);
const historyStmt = database.prepare(`
  INSERT INTO hand_history (session_id, hand_number, mode, board, result_json, action_log_json)
  VALUES (@sessionId, @handNumber, @mode, @board, @resultJson, @actionLogJson)
`);
const normalizeResult = (result) => {
    if (!result)
        return undefined;
    if (result.reason && !result.description.includes("通过弃牌赢下底池"))
        return result;
    const foldMatch = result.description.match(/^(.*) 通过弃牌赢下底池$/);
    return {
        ...result,
        reason: result.reason ?? (result.description.includes("弃牌") ? "fold" : "showdown"),
        ...(foldMatch ? { description: `其余玩家弃牌，${foldMatch[1]} 赢下底池` } : {}),
    };
};
const hydrateHandState = (state) => {
    const result = normalizeResult(state.result);
    return result ? { ...state, result } : state;
};
export const saveSession = (state) => {
    upsertSessionStmt.run({
        sessionId: state.sessionId,
        mode: state.mode,
        stateJson: JSON.stringify(state),
    });
    if (state.result) {
        historyStmt.run({
            sessionId: state.sessionId,
            handNumber: state.handNumber,
            mode: state.mode,
            board: JSON.stringify(state.board),
            resultJson: JSON.stringify(state.result),
            actionLogJson: JSON.stringify(state.actionLog),
        });
    }
};
export const loadSession = (sessionId) => {
    const row = database
        .prepare("SELECT state_json FROM sessions WHERE session_id = ?")
        .get(sessionId);
    return row?.state_json ? hydrateHandState(JSON.parse(row.state_json)) : undefined;
};
export const loadLatestSession = (mode) => {
    const row = (mode
        ? database
            .prepare("SELECT state_json FROM sessions WHERE mode = ? ORDER BY updated_at DESC LIMIT 1")
            .get(mode)
        : database
            .prepare("SELECT state_json FROM sessions ORDER BY updated_at DESC LIMIT 1")
            .get());
    return row?.state_json ? hydrateHandState(JSON.parse(row.state_json)) : undefined;
};
export const loadRecentHistory = () => {
    return database
        .prepare("SELECT id, session_id, hand_number, mode, board, result_json, action_log_json, created_at FROM hand_history ORDER BY id DESC LIMIT 12")
        .all();
};
export const loadAdvice = (cacheKey) => {
    return database
        .prepare("SELECT cache_key AS cacheKey, response FROM advice_cache WHERE cache_key = ?")
        .get(cacheKey);
};
export const saveAdvice = (cacheKey, response) => {
    database
        .prepare(`INSERT INTO advice_cache (cache_key, response, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET response = excluded.response, updated_at = CURRENT_TIMESTAMP`)
        .run(cacheKey, response);
};
