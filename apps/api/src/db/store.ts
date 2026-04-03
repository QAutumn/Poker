import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { HandState } from "@poker/shared";

import { config } from "../core/config";

export interface AdviceRecord {
  cacheKey: string;
  response: string;
}

const dataDir = path.resolve(process.cwd(), config.dataDir);
fs.mkdirSync(dataDir, { recursive: true });

const database = new Database(path.join(dataDir, "poker.db"));
database.pragma("journal_mode = WAL");

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

export const saveSession = (state: HandState) => {
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

export const loadSession = (sessionId: string): HandState | undefined => {
  const row = database
    .prepare("SELECT state_json FROM sessions WHERE session_id = ?")
    .get(sessionId) as { state_json?: string } | undefined;

  return row?.state_json ? (JSON.parse(row.state_json) as HandState) : undefined;
};

export const loadRecentHistory = () => {
  return database
    .prepare(
      "SELECT id, session_id, hand_number, mode, board, result_json, action_log_json, created_at FROM hand_history ORDER BY id DESC LIMIT 12",
    )
    .all() as Array<{
      id: number;
      session_id: string;
      hand_number: number;
      mode: string;
      board: string;
      result_json: string | null;
      action_log_json: string;
      created_at: string;
    }>;
};

export const loadAdvice = (cacheKey: string): AdviceRecord | undefined => {
  return database
    .prepare("SELECT cache_key AS cacheKey, response FROM advice_cache WHERE cache_key = ?")
    .get(cacheKey) as AdviceRecord | undefined;
};

export const saveAdvice = (cacheKey: string, response: string) => {
  database
    .prepare(
      `INSERT INTO advice_cache (cache_key, response, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(cache_key) DO UPDATE SET response = excluded.response, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(cacheKey, response);
};
