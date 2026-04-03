import { useEffect } from "react";

import { TableScene } from "./components/TableScene";
import { usePokerStore } from "./hooks/usePokerStore";
import "./App.css";

const percent = (value: number) => `${Math.round(value * 100)}%`;

function App() {
  const {
    session,
    mode,
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
    act,
    askAdvice,
    updateLab,
    computeLab,
  } = usePokerStore();

  useEffect(() => {
    void boot();
  }, [boot]);

  if (loading || !session) {
    return <div className="app-shell loading-shell">正在搭建牌桌场景与训练数据...</div>;
  }

  const hero = session.players.find((player) => player.isHero)!;
  const currentToCall = Math.max(0, session.currentBet - hero.bet);
  const resultReady = Boolean(session.result);

  return (
    <div className="app-shell">
      <header className="hero-bar">
        <div>
          <p className="eyebrow">QuantArt Poker Lab</p>
          <h1>本地德扑训练系统</h1>
          <p className="subtitle">真实牌桌质感、实时胜率、锦标赛压力模拟、DeepSeek 决策教练</p>
        </div>
        <div className="hero-bar__actions">
          <button className={mode === "practice" ? "pill is-active" : "pill"} onClick={() => void restart("practice")}>
            练习模式
          </button>
          <button className={mode === "tournament" ? "pill is-active" : "pill"} onClick={() => void restart("tournament")}>
            锦标赛模式
          </button>
          <button className="pill pill--ghost" onClick={() => void restart(mode)}>
            {resultReady ? "下一手" : "重开"}
          </button>
        </div>
      </header>

      <main className="layout-grid">
        <section className="table-column">
          <TableScene session={session} />

          <div className="status-strip">
            <div className="status-card">
              <span>Hero 胜率</span>
              <strong>{percent(session.equity.winRate)}</strong>
            </div>
            <div className="status-card">
              <span>平局率</span>
              <strong>{percent(session.equity.tieRate)}</strong>
            </div>
            <div className="status-card">
              <span>待跟注</span>
              <strong>{currentToCall}</strong>
            </div>
            <div className="status-card">
              <span>范围提示</span>
              <strong>{session.villainRangeHint}</strong>
            </div>
          </div>

          <section className="panel action-panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">决策区</p>
                <h2>当前动作</h2>
              </div>
              <button className="pill pill--accent" disabled={advicePending} onClick={() => void askAdvice()}>
                {advicePending ? "分析中..." : "DeepSeek 建议"}
              </button>
            </div>

            <div className="action-grid">
              {session.nextActions.map((action) => (
                <button
                  key={action.label}
                  className="action-button"
                  disabled={actionPending || resultReady}
                  onClick={() => void act({ type: action.type, amount: action.amount })}
                >
                  <span>{action.label}</span>
                  <small>{action.type.toUpperCase()}</small>
                </button>
              ))}
            </div>

            {session.result ? (
              <div className="result-banner">
                <strong>{session.result.description}</strong>
                <span>底池 {session.result.pot}</span>
              </div>
            ) : null}

            {advice ? (
              <div className="coach-card">
                <span className="coach-card__source">{adviceSource === "deepseek" ? "DeepSeek" : adviceSource === "cache" ? "缓存" : "本地教练"}</span>
                <p>{advice}</p>
              </div>
            ) : null}

            {error ? <div className="error-banner">{error}</div> : null}
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Action Log</p>
                <h2>手牌流程</h2>
              </div>
            </div>

            <div className="log-list">
              {session.actionLog.length === 0 ? <p>这手牌还没开始行动。</p> : null}
              {session.actionLog.map((entry, index) => (
                <div key={`${entry.actorId}-${index}`} className="log-row">
                  <span>{entry.street}</span>
                  <strong>{entry.actorName}</strong>
                  <span>{entry.action}</span>
                  <span>{entry.amount > 0 ? `${entry.amount}` : "-"}</span>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="side-column">
          <section className="panel metric-panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Tournament Feed</p>
                <h2>压力面板</h2>
              </div>
            </div>

            {session.tournament ? (
              <div className="tournament-card">
                <div className="tournament-card__row">
                  <span>盲注级别</span>
                  <strong>
                    {session.tournament.smallBlind}/{session.tournament.bigBlind}
                  </strong>
                </div>
                <div className="tournament-card__row">
                  <span>升级倒计时</span>
                  <strong>{session.tournament.handsUntilLevelUp} 手</strong>
                </div>
                <div className="field-list">
                  {session.tournament.opponents.map((entry) => (
                    <div key={entry.id} className="field-list__row">
                      <span>{entry.name}</span>
                      <strong>{entry.stack}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted-copy">练习模式下，这里会显示对手范围和节奏提醒。</p>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Equity Lab</p>
                <h2>胜率实验台</h2>
              </div>
            </div>

            <div className="lab-form">
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
              <button className="pill pill--accent" onClick={computeLab}>
                计算胜率
              </button>
              {equityLab.result ? (
                <div className="lab-result">
                  <span>Win {percent(equityLab.result.winRate)}</span>
                  <span>Tie {percent(equityLab.result.tieRate)}</span>
                  <span>Loss {percent(equityLab.result.lossRate)}</span>
                </div>
              ) : null}
              {equityLab.error ? <div className="error-banner">{equityLab.error}</div> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Recent Hands</p>
                <h2>复盘记录</h2>
              </div>
            </div>

            <div className="history-list">
              {history.map((entry) => (
                <article key={entry.id} className="history-card">
                  <div className="history-card__top">
                    <strong>
                      #{entry.handNumber} {entry.mode === "tournament" ? "锦标赛" : "练习"}
                    </strong>
                    <span>{new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </div>
                  <p>{entry.result?.description ?? "等待摊牌"}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

export default App;
