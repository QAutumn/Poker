import type { HandState } from "@poker/shared";

import { CardFace } from "./CardFace";

export function TableScene({ session }: { session: HandState }) {
  const hero = session.players.find((player) => player.isHero)!;
  const villain = session.players.find((player) => !player.isHero)!;
  const livePot = session.pot + session.players.reduce((sum, player) => sum + player.bet, 0);

  return (
    <section className="table-stage">
      <div className="table-stage__ambient table-stage__ambient--left" />
      <div className="table-stage__ambient table-stage__ambient--right" />

      <div className="table-surface">
        <div className="dealer-chip">D</div>

        <div className="seat seat--villain">
          <div className="seat__meta">
            <div>
              <strong>{villain.name}</strong>
              <span>{villain.stack} 筹码</span>
            </div>
            <span className="seat__badge">{session.mode === "tournament" ? "FT 压力" : "训练对手"}</span>
          </div>
          <div className="seat__cards seat__cards--top">
            <CardFace card={villain.cards[0]} hidden={session.street !== "showdown"} />
            <CardFace card={villain.cards[1]} hidden={session.street !== "showdown"} />
          </div>
          <div className="seat__bet">{villain.bet > 0 ? `${villain.bet}` : "等待"}</div>
        </div>

        <div className="pot-cluster">
          <span className="pot-cluster__label">Pot</span>
          <strong>{livePot}</strong>
          <small>{session.street.toUpperCase()}</small>
        </div>

        <div className="board-runout">
          {Array.from({ length: 5 }).map((_, index) => (
            <CardFace key={index} card={session.board[index]} hidden={!session.board[index]} label={`board-${index}`} />
          ))}
        </div>

        <div className="seat seat--hero">
          <div className="seat__cards seat__cards--bottom">
            <CardFace card={hero.cards[0]} />
            <CardFace card={hero.cards[1]} />
          </div>
          <div className="seat__meta">
            <div>
              <strong>{hero.name}</strong>
              <span>{hero.stack} 筹码</span>
            </div>
            <span className="seat__badge seat__badge--hero">{session.mode === "tournament" ? "锦标赛模式" : "练习模式"}</span>
          </div>
          <div className="seat__bet seat__bet--hero">{hero.bet > 0 ? `${hero.bet}` : "待行动"}</div>
        </div>
      </div>
    </section>
  );
}
