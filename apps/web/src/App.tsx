import { useEffect, useRef, useState } from "react";
import type { AllowedAction, HandState } from "@poker/shared";

import { TableScene } from "./components/TableScene";
import { usePokerStore } from "./hooks/usePokerStore";
import { useTableAudio } from "./hooks/useTableAudio";
import "./App.css";

type TrayTab = "history" | "equity" | "log";

interface AmountPreset {
  label: string;
  amount: number;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const STREET_LABEL: Record<HandState["street"], string> = {
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
};
const ACTION_LABEL: Record<string, string> = {
  fold: "弃牌",
  check: "过牌",
  call: "跟注",
  bet: "下注",
  raise: "加注",
  "all-in": "全下",
};
const RESULT_REASON_LABEL: Record<NonNullable<HandState["result"]>["reason"], string> = {
  fold: "弃牌获胜",
  showdown: "摊牌结算",
};

const buildAmountPresets = (
  action: AllowedAction | undefined,
  totalPot: number,
  currentBet: number,
): AmountPreset[] => {
  if (!action || (action.type !== "bet" && action.type !== "raise")) return [];

  const min = action.min ?? action.amount ?? 0;
  const max = action.max ?? action.amount ?? min;
  const rawTargets =
    action.type === "bet"
      ? [
          { label: "1/3 池", amount: Math.round(totalPot * 0.33) },
          { label: "1/2 池", amount: Math.round(totalPot * 0.5) },
          { label: "2/3 池", amount: Math.round(totalPot * 0.66) },
          { label: "满池", amount: Math.round(totalPot) },
        ]
      : [
          { label: "最小加注", amount: min },
          { label: "2.2x", amount: Math.round(currentBet * 2.2) },
          { label: "半池加", amount: Math.round(currentBet + totalPot * 0.5) },
          { label: "满池加", amount: Math.round(currentBet + totalPot) },
        ];

  const seen = new Set<number>();
  return rawTargets
    .map((preset) => ({
      label: preset.label,
      amount: clamp(preset.amount, min, max),
    }))
    .filter((preset) => {
      if (seen.has(preset.amount)) return false;
      seen.add(preset.amount);
      return true;
    });
};

function App() {
  const {
    session,
    mode,
    botCount,
    loading,
    actionPending,
    advicePending,
    advice,
    adviceSource,
    error,
    history,
    equityLab,
    boot,
    restart,
    nextHand,
    setBotCount,
    act,
    askAdvice,
    updateLab,
    computeLab,
  } = usePokerStore();
  const [activeTray, setActiveTray] = useState<TrayTab | null>(null);
  const [betSize, setBetSize] = useState(0);
  const [pendingBotCount, setPendingBotCount] = useState(botCount);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const tableStageRef = useRef<HTMLElement | null>(null);
  const actionRailRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void boot();
  }, [boot]);

  useEffect(() => {
    const currentVariableAction = session?.nextActions.find(
      (action) => action.type === "bet" || action.type === "raise",
    );
    if (!currentVariableAction) return;
    setBetSize(currentVariableAction.amount ?? currentVariableAction.min ?? 0);
  }, [session?.sessionId, session?.street, session?.nextActions]);

  useEffect(() => {
    setPendingBotCount(botCount);
  }, [botCount]);

  useEffect(() => {
    if (!tableStageRef.current || !actionRailRef.current) return;

    const tableStage = tableStageRef.current;
    const actionRail = actionRailRef.current;
    const syncActionRailHeight = () => {
      tableStage.style.setProperty("--action-rail-height", `${Math.ceil(actionRail.getBoundingClientRect().height)}px`);
    };

    syncActionRailHeight();
    const observer = new ResizeObserver(syncActionRailHeight);
    observer.observe(actionRail);
    window.addEventListener("resize", syncActionRailHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncActionRailHeight);
    };
  }, []);

  useTableAudio(session, soundEnabled);

  if (loading || !session) {
    return (
      <div className="app-shell loading-shell">
        <div className="loading-shell__halo" />
        <div className="loading-shell__copy">
          <span>QuantArt Poker Salon</span>
          <strong>正在布置牌桌、筹码和发牌节奏...</strong>
        </div>
      </div>
    );
  }

  const hero = session.players.find((player) => player.isHero)!;
  const bots = session.players.filter((player) => !player.isHero);
  const totalPot = session.pot + session.players.reduce((sum, player) => sum + player.bet, 0);
  const currentToCall = Math.max(0, session.currentBet - hero.bet);
  const resultReady = Boolean(session.result);
  const profiles = bots.map((player) => player.profile);
  const strategyLabel = session.botStrategyMode === "hu-gto" ? "单挑近似 GTO" : "多人桌启发式";

  const instantActions = session.nextActions.filter((action) =>
    ["fold", "check", "call"].includes(action.type),
  );
  const variableAction = session.nextActions.find((action) => action.type === "bet" || action.type === "raise");
  const allInAction = session.nextActions.find((action) => action.type === "all-in");
  const amountPresets = buildAmountPresets(variableAction, totalPot, session.currentBet);

  const sliderMin = variableAction?.min ?? variableAction?.amount ?? 0;
  const sliderMax = variableAction?.max ?? variableAction?.amount ?? sliderMin;
  const showAdviceDock = advicePending || Boolean(advice) || Boolean(error);

  return (
    <div className="app-shell">
      <div className="room-glow room-glow--left" />
      <div className="room-glow room-glow--right" />
      <div className="room-vignette" />

      <main className="table-page">
        <section ref={tableStageRef} className="table-stage">
          <div className="table-stage__ceiling-light" />
          <div className="table-stage__ceiling-light table-stage__ceiling-light--soft" />

          <header className="table-hud table-hud--top">
            <div className="hud-cluster hud-cluster--brand">
              <span className="hud-kicker">QuantArt Poker Salon</span>
              <strong>{mode === "tournament" ? "Short-Handed Tournament Table" : "Custom Bot Practice Table"}</strong>
              <small>
                Hand #{session.handNumber} · {STREET_LABEL[session.street]} · {bots.length} 个电脑 · {strategyLabel}
              </small>
            </div>

            <div className="hud-cluster hud-cluster--switches">
              <button className={mode === "practice" ? "hud-pill is-active" : "hud-pill"} onClick={() => void restart("practice")}>
                练习
              </button>
              <button className={mode === "tournament" ? "hud-pill is-active" : "hud-pill"} onClick={() => void restart("tournament")}>
                锦标赛
              </button>
              <button className="hud-pill" onClick={() => (resultReady ? void nextHand() : void restart(mode))}>
                {resultReady ? "下一手(继承筹码)" : "重开整桌"}
              </button>
              <button className={soundEnabled ? "hud-pill is-active" : "hud-pill"} onClick={() => setSoundEnabled((value) => !value)}>
                {soundEnabled ? "音效开" : "音效关"}
              </button>
            </div>

            <div className="hud-cluster hud-cluster--switches">
              <button className="hud-pill" disabled={pendingBotCount <= 1} onClick={() => setPendingBotCount((value) => Math.max(1, value - 1))}>
                -1 电脑
              </button>
              <span className="hud-kicker">当前 {pendingBotCount} 个电脑</span>
              <button className="hud-pill" disabled={pendingBotCount >= 5} onClick={() => setPendingBotCount((value) => Math.min(5, value + 1))}>
                +1 电脑
              </button>
              <button
                className={pendingBotCount === botCount ? "hud-pill" : "hud-pill is-active"}
                onClick={() => {
                  setBotCount(pendingBotCount);
                  void restart(mode);
                }}
              >
                应用到新局
              </button>
            </div>
          </header>

          <aside className="table-hud table-hud--left">
            <div className="edge-card">
              <span className="edge-card__label">Hero Equity</span>
              <strong>{percent(session.equity.winRate)}</strong>
              <small>平局 {percent(session.equity.tieRate)}</small>
            </div>
            <div className="edge-card">
              <span className="edge-card__label">Pot Pressure</span>
              <strong>{currentToCall}</strong>
              <small>{session.villainRangeHint}</small>
            </div>
            {session.tournament ? (
              <div className="edge-card">
                <span className="edge-card__label">Blind</span>
                <strong>
                  {session.tournament.smallBlind}/{session.tournament.bigBlind}
                </strong>
                <small>{session.tournament.handsUntilLevelUp} 手后升级</small>
              </div>
            ) : (
              <div className="edge-card">
                <span className="edge-card__label">Table Mix</span>
                <strong>{Math.min(hero.stack, ...bots.map((player) => player.stack))} effective</strong>
                <small>
                  {strategyLabel} · {profiles.join(" / ")}
                </small>
              </div>
            )}
          </aside>

          <TableScene session={session} />

          {showAdviceDock ? (
            <aside className="coach-dock" aria-live="polite">
              <div className="coach-dock__header">
                <div>
                  <span>{advicePending ? "DeepSeek 正在分析" : "DeepSeek 建议"}</span>
                  <strong>{advicePending ? "正在生成当前局面的最优解读" : "决策建议已就位"}</strong>
                </div>
                {adviceSource ? <div className="tray-panel__source">来源：{adviceSource}</div> : null}
              </div>
              <p className="coach-dock__copy">
                {advicePending
                  ? "正在结合当前牌面、下注压力和对手范围生成建议。"
                  : advice ?? "当前没有可展示的建议。"}
              </p>
              {error ? <div className="tray-panel__alert">{error}</div> : null}
            </aside>
          ) : null}

          <div className="rail-legend rail-legend--left">
            <button className={activeTray === "log" ? "rail-toggle is-active" : "rail-toggle"} onClick={() => setActiveTray(activeTray === "log" ? null : "log")}>
              手序
            </button>
          </div>

          <div className="rail-legend rail-legend--right">
            <button className={activeTray === "equity" ? "rail-toggle is-active" : "rail-toggle"} onClick={() => setActiveTray(activeTray === "equity" ? null : "equity")}>
              胜率台
            </button>
            <button className={activeTray === "history" ? "rail-toggle is-active" : "rail-toggle"} onClick={() => setActiveTray(activeTray === "history" ? null : "history")}>
              复盘
            </button>
          </div>

          <section ref={actionRailRef} className="action-rail">
            <div className="action-rail__meta">
              <div>
                <span className="action-rail__label">桌边情报</span>
                <strong>
                  {hero.name} · {hero.stack} 筹码 · 底池 {totalPot}
                </strong>
                <small>{resultReady ? "点下一手会继承当前筹码继续同一桌" : "刷新页面会恢复当前桌面的进行状态"}</small>
              </div>
              <div>
                <span className="action-rail__label">当前局面</span>
                <strong>
                  {session.result ? session.result.description : currentToCall > 0 ? `面对 ${currentToCall} 待跟注` : "你掌握主动权"}
                </strong>
              </div>
            </div>

            <div className="action-rail__row">
              <div className="action-rail__quick">
                {instantActions.map((action) => (
                  <button
                    key={action.label}
                    className={`action-button action-button--${action.type}`}
                    disabled={actionPending || resultReady}
                    onClick={() => void act({ type: action.type, amount: action.amount })}
                  >
                    <span>{action.label}</span>
                    <small>{ACTION_LABEL[action.type] ?? action.type}</small>
                  </button>
                ))}

                {allInAction ? (
                  <button
                    className="action-button action-button--all-in"
                    disabled={actionPending || resultReady}
                    onClick={() => void act({ type: "all-in", amount: allInAction.amount })}
                  >
                    <span>{allInAction.label}</span>
                    <small>{ACTION_LABEL["all-in"]}</small>
                  </button>
                ) : null}
              </div>

              <button className="action-button action-button--coach" disabled={advicePending} onClick={() => void askAdvice()}>
                <span>{advicePending ? "分析中..." : "DeepSeek 建议"}</span>
                <small>{adviceSource === "deepseek" ? "live" : adviceSource ?? "coach"}</small>
              </button>
            </div>

            {variableAction ? (
              <div className="amount-control">
                <div className="amount-control__header">
                  <span className="action-rail__label">尺度控制</span>
                  <strong>
                    {variableAction.type === "raise" ? "加注到" : "下注到"} {betSize}
                  </strong>
                </div>

                <div className="amount-control__presets">
                  {amountPresets.map((preset) => (
                    <button
                      key={`${preset.label}-${preset.amount}`}
                      className={betSize === preset.amount ? "amount-preset is-active" : "amount-preset"}
                      disabled={actionPending || resultReady}
                      onClick={() => setBetSize(preset.amount)}
                    >
                      {preset.label} · {preset.amount}
                    </button>
                  ))}
                </div>

                <input
                  className="amount-control__slider"
                  type="range"
                  min={sliderMin}
                  max={sliderMax}
                  step={1}
                  value={clamp(betSize, sliderMin, sliderMax)}
                  onChange={(event) => setBetSize(Number(event.target.value))}
                />

                <div className="amount-control__range">
                  <span>
                    最小 {sliderMin} / 最大 {sliderMax}
                  </span>
                  <input
                    className="amount-control__number"
                    type="number"
                    min={sliderMin}
                    max={sliderMax}
                    value={betSize}
                    onChange={(event) =>
                      setBetSize(clamp(Number(event.target.value || sliderMin), sliderMin, sliderMax))
                    }
                  />
                  <button
                    className="amount-control__submit"
                    disabled={actionPending || resultReady}
                    onClick={() => void act({ type: variableAction.type, amount: clamp(betSize, sliderMin, sliderMax) })}
                  >
                    {variableAction.type === "raise" ? "确认加注" : "确认下注"}
                  </button>
                </div>
              </div>
            ) : null}

            {session.result ? (
              <div className={`result-banner result-banner--${session.result.reason}`}>
                <span className="result-banner__eyebrow">{RESULT_REASON_LABEL[session.result.reason]}</span>
                <strong>{session.result.description}</strong>
                <div className="result-banner__meta">
                  <span>最终底池 {session.result.pot}</span>
                  <span>{session.result.winnerIds.length > 1 ? "多人平分" : "单人收池"}</span>
                </div>
              </div>
            ) : null}
          </section>

          <div className={`tray tray--left ${activeTray === "log" ? "is-open" : ""}`}>
            {activeTray === "log" ? (
              <section className="tray-panel">
                <div className="tray-panel__header">
                  <span>Action Log</span>
                  <strong>发牌记录</strong>
                </div>
                <div className="tray-log">
                  {session.actionLog.length === 0 ? <p>这手牌还没开始行动。</p> : null}
                  {session.actionLog.map((entry, index) => (
                    <div key={`${entry.actorId}-${index}`} className="tray-log__row">
                      <span>{STREET_LABEL[entry.street]}</span>
                      <strong>{entry.actorName}</strong>
                      <span>{ACTION_LABEL[entry.action] ?? entry.action}</span>
                      <span>{entry.amount > 0 ? entry.amount : "-"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <div className={`tray tray--right ${activeTray === "equity" || activeTray === "history" ? "is-open" : ""}`}>
            {activeTray === "equity" ? (
              <section className="tray-panel">
                <div className="tray-panel__header">
                  <span>Equity Lab</span>
                  <strong>胜率实验台</strong>
                </div>
                <div className="tray-form">
                  <label>
                    Hero
                    <input value={equityLab.hero} onChange={(event) => updateLab({ hero: event.target.value })} />
                  </label>
                  <label>
                    Villain
                    <input value={equityLab.villain} onChange={(event) => updateLab({ villain: event.target.value })} />
                  </label>
                  <label>
                    Board
                    <input value={equityLab.board} onChange={(event) => updateLab({ board: event.target.value })} />
                  </label>
                  <button className="hud-pill is-active" onClick={computeLab}>
                    计算胜率
                  </button>
                  {equityLab.result ? (
                    <div className="tray-stats">
                      <span>Win {percent(equityLab.result.winRate)}</span>
                      <span>Tie {percent(equityLab.result.tieRate)}</span>
                      <span>Loss {percent(equityLab.result.lossRate)}</span>
                    </div>
                  ) : null}
                  {equityLab.error ? <div className="tray-panel__alert">{equityLab.error}</div> : null}
                </div>
              </section>
            ) : null}

            {activeTray === "history" ? (
              <section className="tray-panel">
                <div className="tray-panel__header">
                  <span>Recent Hands</span>
                  <strong>复盘记录</strong>
                </div>
                <div className="tray-history">
                  {history.map((entry) => (
                    <article key={entry.id} className="history-card">
                      <div className="history-card__top">
                        <strong>
                          #{entry.handNumber} {entry.mode === "tournament" ? "锦标赛" : "练习"}
                        </strong>
                        <span>{new Date(entry.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}</span>
                      </div>
                      {entry.result ? (
                        <span className="history-card__tag">
                          {RESULT_REASON_LABEL[entry.result.reason]}
                        </span>
                      ) : null}
                      <p>{entry.result?.description ?? "等待摊牌"}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
