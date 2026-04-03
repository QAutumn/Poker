import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { HandState } from "@poker/shared";

import { CardFace } from "./CardFace";

const profileLabel: Record<string, string> = {
  aggressive: "激进",
  balanced: "均衡",
  careful: "谨慎",
};

const streetLabel: Record<HandState["street"], string> = {
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
};

const actionLabel: Record<string, string> = {
  fold: "弃牌",
  check: "过牌",
  call: "跟注",
  bet: "下注",
  raise: "加注",
  "all-in": "全下",
};

const BOT_LAYOUTS: Record<number, Array<{ left: string; top: string; variant: "top" | "side" }>> = {
  1: [{ left: "50%", top: "14%", variant: "top" }],
  2: [
    { left: "28%", top: "14%", variant: "top" },
    { left: "72%", top: "14%", variant: "top" },
  ],
  3: [
    { left: "50%", top: "10%", variant: "top" },
    { left: "18%", top: "28%", variant: "side" },
    { left: "82%", top: "28%", variant: "side" },
  ],
  4: [
    { left: "34%", top: "12%", variant: "top" },
    { left: "66%", top: "12%", variant: "top" },
    { left: "14%", top: "34%", variant: "side" },
    { left: "86%", top: "34%", variant: "side" },
  ],
  5: [
    { left: "50%", top: "9%", variant: "top" },
    { left: "30%", top: "13%", variant: "top" },
    { left: "70%", top: "13%", variant: "top" },
    { left: "14%", top: "34%", variant: "side" },
    { left: "86%", top: "34%", variant: "side" },
  ],
};

const POT_ANCHOR = { left: "50%", top: "38%" };
const HERO_STACK_ANCHOR = { left: "50%", top: "70%" };
const HERO_BET_ANCHOR = { left: "50%", top: "61%" };
const CHIP_VALUES = [500, 100, 25, 5, 1] as const;
const CHIP_DISPLAY_LIMIT = 14;

type ChipTone = "white" | "red" | "green" | "black" | "purple";
type Point = { left: string; top: string };
type SeatChipAmounts = Record<string, number>;
type ChipFlightKind = "bet" | "collect" | "payout";

type AnimatedSeatAction = {
  actorId: string;
  action: "fold" | "raise";
  id: string;
};

type AnimatedActorMeta = {
  startLeft: string;
  startTop: string;
  isHero: boolean;
  cards: HandState["players"][number]["cards"];
};

type AnimationBatch = {
  id: string;
  kind: ChipFlightKind;
  duration: number;
  sourceIds: string[];
  winnerIds?: string[];
  nextSeatChipAmounts: SeatChipAmounts;
  nextPotChipAmount: number;
  flights: Array<{
    id: string;
    amount: number;
    from: Point;
    to: Point;
    delay: number;
    kind: ChipFlightKind;
  }>;
};

const seatStyle = (layout: { left: string; top: string }): CSSProperties => ({
  left: layout.left,
  top: layout.top,
  transform: "translateX(-50%)",
});

const dealerOffset = (layout: { left: string; top: string }, isHero: boolean): CSSProperties => ({
  left: layout.left,
  ...(isHero ? { bottom: "calc(var(--action-rail-height, 280px) + 124px)" } : { top: `calc(${layout.top} + 10%)` }),
  transform: "translateX(40px)",
});

const pointStyle = (point: Point): CSSProperties => ({
  left: point.left,
  top: point.top,
});

const chipToneFor = (value: number): ChipTone => {
  if (value >= 500) return "purple";
  if (value >= 100) return "black";
  if (value >= 25) return "green";
  if (value >= 5) return "red";
  return "white";
};

const buildSeatChipAmounts = (session: HandState): SeatChipAmounts =>
  Object.fromEntries(session.players.map((player) => [player.id, session.result ? 0 : player.bet]));

const buildPotChipAmount = (session: HandState) => (session.result ? 0 : session.pot);

const cloneSeatChipAmounts = (seatChipAmounts: SeatChipAmounts): SeatChipAmounts => ({ ...seatChipAmounts });

const sumSeatChipAmounts = (seatChipAmounts: SeatChipAmounts) =>
  Object.values(seatChipAmounts).reduce((sum, amount) => sum + amount, 0);

const botSeatOrigin = (layout: { left: string; top: string; variant: "top" | "side" }): Point => ({
  left: layout.left,
  top: layout.variant === "top" ? "22%" : "31%",
});

const botBetAnchor = (layout: { left: string; top: string; variant: "top" | "side" }): Point => ({
  left: layout.left,
  top: layout.variant === "top" ? "30%" : "40%",
});

const buildChipDisplay = (amount: number) => {
  let remaining = Math.max(0, Math.round(amount));
  const counts = new Map<number, number>(CHIP_VALUES.map((value) => [value, 0]));

  CHIP_VALUES.forEach((value) => {
    const count = Math.floor(remaining / value);
    if (count > 0) {
      counts.set(value, count);
      remaining -= count * value;
    }
  });

  const mergeRules = [
    { from: 1, count: 5, to: 5 },
    { from: 5, count: 5, to: 25 },
    { from: 25, count: 4, to: 100 },
    { from: 100, count: 5, to: 500 },
  ] as const;

  let total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  while (total > CHIP_DISPLAY_LIMIT) {
    let merged = false;
    for (const rule of mergeRules) {
      while ((counts.get(rule.from) ?? 0) >= rule.count && total > CHIP_DISPLAY_LIMIT) {
        counts.set(rule.from, (counts.get(rule.from) ?? 0) - rule.count);
        counts.set(rule.to, (counts.get(rule.to) ?? 0) + 1);
        total -= rule.count - 1;
        merged = true;
      }
    }

    if (!merged) break;
  }

  const chips: Array<{ id: string; tone: ChipTone }> = [];
  let index = 0;
  CHIP_VALUES.forEach((value) => {
    const count = counts.get(value) ?? 0;
    for (let chip = 0; chip < count; chip += 1) {
      chips.push({ id: `${amount}-${value}-${index}`, tone: chipToneFor(value) });
      index += 1;
    }
  });
  return chips;
};

const payoutByWinner = (result: NonNullable<HandState["result"]>) => {
  const share = Math.floor(result.pot / result.winnerIds.length);
  const remainder = result.pot - share * result.winnerIds.length;
  return Object.fromEntries(
    result.winnerIds.map((winnerId, index) => [winnerId, share + (index === 0 ? remainder : 0)]),
  );
};

function ChipPile({
  amount,
  variant,
}: {
  amount: number;
  variant: "seat" | "pot" | "flight";
}) {
  const chips = buildChipDisplay(amount);
  if (chips.length === 0) return null;

  const stackHeight = variant === "pot" ? 4 : 3;

  return (
    <div className={`chip-pile chip-pile--${variant}`}>
      {chips.map((chip, index) => {
        const column = Math.floor(index / stackHeight);
        const row = index % stackHeight;
        return (
          <span
            key={`${chip.id}-${index}`}
            className={`table-chip table-chip--${chip.tone}`}
            style={
              {
                "--chip-x": `${column * 18}px`,
                "--chip-y": `${row * -7}px`,
                "--chip-z": `${index + 1}`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

export function TableScene({ session }: { session: HandState }) {
  const [animatedAction, setAnimatedAction] = useState<AnimatedSeatAction | null>(null);
  const [seatChipAmounts, setSeatChipAmounts] = useState<SeatChipAmounts>(() => buildSeatChipAmounts(session));
  const [potChipAmount, setPotChipAmount] = useState(() => buildPotChipAmount(session));
  const [activeBatch, setActiveBatch] = useState<AnimationBatch | null>(null);
  const [winnerGlowIds, setWinnerGlowIds] = useState<string[]>(session.result?.winnerIds ?? []);
  const queueRef = useRef<AnimatedSeatAction[]>([]);
  const chipQueueRef = useRef<AnimationBatch[]>([]);
  const playbackRef = useRef(false);
  const chipPlaybackRef = useRef(false);
  const actionTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const chipTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const actionCursorRef = useRef({ sessionId: session.sessionId, count: session.actionLog.length });
  const previousSessionRef = useRef(session);
  const hero = session.players.find((player) => player.isHero)!;
  const bots = session.players.filter((player) => !player.isHero);
  const livePot = potChipAmount + sumSeatChipAmounts(seatChipAmounts);
  const actingPlayer = session.players[session.currentPlayerIndex];
  const lastAction = session.actionLog.at(-1);
  const layouts = BOT_LAYOUTS[bots.length] ?? BOT_LAYOUTS[1];
  const buttonPlayer = session.players[session.buttonIndex];
  const buttonLayout = buttonPlayer?.isHero
    ? { left: "50%", top: "72%" }
    : layouts[bots.findIndex((player) => player.id === buttonPlayer?.id)] ?? layouts[0]!;
  const stackAnchors: Record<string, Point> = { [hero.id]: HERO_STACK_ANCHOR };
  const betAnchors: Record<string, Point> = { [hero.id]: HERO_BET_ANCHOR };

  bots.forEach((bot, index) => {
    const layout = layouts[index] ?? layouts[0]!;
    stackAnchors[bot.id] = botSeatOrigin(layout);
    betAnchors[bot.id] = botBetAnchor(layout);
  });

  useEffect(() => {
    const clearActionTimers = () => {
      actionTimersRef.current.forEach((timer) => clearTimeout(timer));
      actionTimersRef.current = [];
    };

    const playNext = () => {
      if (playbackRef.current || queueRef.current.length === 0) return;
      const nextAction = queueRef.current.shift()!;
      playbackRef.current = true;
      setAnimatedAction(nextAction);

      actionTimersRef.current.push(
        setTimeout(() => {
          setAnimatedAction(null);
          actionTimersRef.current.push(
            setTimeout(() => {
              playbackRef.current = false;
              playNext();
            }, 110),
          );
        }, nextAction.action === "fold" ? 860 : 720),
      );
    };

    if (actionCursorRef.current.sessionId !== session.sessionId) {
      clearActionTimers();
      queueRef.current = [];
      playbackRef.current = false;
      setAnimatedAction(null);
      actionCursorRef.current = { sessionId: session.sessionId, count: session.actionLog.length };
      return clearActionTimers;
    }

    const recentEntries: AnimatedSeatAction[] = session.actionLog
      .slice(actionCursorRef.current.count)
      .flatMap((entry, index) =>
        entry.action === "fold" || entry.action === "raise"
          ? [
              {
                actorId: entry.actorId,
                action: entry.action,
                id: `${entry.actorId}-${entry.action}-${session.actionLog.length}-${index}`,
              },
            ]
          : [],
      );

    actionCursorRef.current = { sessionId: session.sessionId, count: session.actionLog.length };
    if (recentEntries.length > 0) {
      queueRef.current.push(...recentEntries);
      playNext();
    }

    return clearActionTimers;
  }, [session.actionLog, session.sessionId]);

  useEffect(() => {
    const clearChipTimers = () => {
      chipTimersRef.current.forEach((timer) => clearTimeout(timer));
      chipTimersRef.current = [];
    };

    const playNextBatch = () => {
      if (chipPlaybackRef.current || chipQueueRef.current.length === 0) return;
      const nextBatch = chipQueueRef.current.shift()!;
      const maxDelay = Math.max(...nextBatch.flights.map((flight) => flight.delay), 0);
      chipPlaybackRef.current = true;
      setActiveBatch(nextBatch);
      if (nextBatch.kind === "payout") {
        setWinnerGlowIds(nextBatch.winnerIds ?? []);
      }

      chipTimersRef.current.push(
        setTimeout(() => {
          setSeatChipAmounts(nextBatch.nextSeatChipAmounts);
          setPotChipAmount(nextBatch.nextPotChipAmount);
          setActiveBatch(null);
          chipTimersRef.current.push(
            setTimeout(() => {
              chipPlaybackRef.current = false;
              playNextBatch();
            }, 120),
          );
        }, nextBatch.duration + maxDelay),
      );
    };

    const previousSession = previousSessionRef.current;
    if (!previousSession || previousSession.sessionId !== session.sessionId) {
      clearChipTimers();
      chipQueueRef.current = [];
      chipPlaybackRef.current = false;
      setActiveBatch(null);
      setSeatChipAmounts(buildSeatChipAmounts(session));
      setPotChipAmount(buildPotChipAmount(session));
      setWinnerGlowIds(session.result?.winnerIds ?? []);
      previousSessionRef.current = session;
      return clearChipTimers;
    }

    const seatAmounts = cloneSeatChipAmounts(buildSeatChipAmounts(previousSession));
    let potAmount = buildPotChipAmount(previousSession);
    let currentStreet = previousSession.street;
    const batches: AnimationBatch[] = [];
    const nextEntries = session.actionLog.slice(previousSession.actionLog.length);

    const pushCollectBatch = (reasonId: string) => {
      const totalToCollect = sumSeatChipAmounts(seatAmounts);
      if (totalToCollect <= 0) return;

      const nextSeatChipAmounts = Object.fromEntries(
        Object.keys(seatAmounts).map((playerId) => [playerId, 0]),
      ) as SeatChipAmounts;

      batches.push({
        id: `${session.sessionId}-${reasonId}-collect-${batches.length}`,
        kind: "collect",
        duration: 520,
        sourceIds: Object.keys(seatAmounts).filter((playerId) => (seatAmounts[playerId] ?? 0) > 0),
        nextSeatChipAmounts,
        nextPotChipAmount: potAmount + totalToCollect,
        flights: Object.entries(seatAmounts)
          .filter(([, amount]) => amount > 0)
          .map(([playerId, amount], index) => ({
            id: `${session.sessionId}-${reasonId}-collect-${playerId}`,
            amount,
            from: betAnchors[playerId] ?? HERO_BET_ANCHOR,
            to: POT_ANCHOR,
            delay: index * 50,
            kind: "collect" as const,
          })),
      });

      Object.keys(seatAmounts).forEach((playerId) => {
        seatAmounts[playerId] = 0;
      });
      potAmount += totalToCollect;
    };

    nextEntries.forEach((entry, index) => {
      if (entry.street !== currentStreet) {
        pushCollectBatch(`${entry.street}-${index}`);
        currentStreet = entry.street;
      }

      if (entry.amount <= 0 || entry.action === "fold" || entry.action === "check") return;

      const currentAmount = seatAmounts[entry.actorId] ?? 0;
      const nextSeatChipAmounts = cloneSeatChipAmounts(seatAmounts);
      nextSeatChipAmounts[entry.actorId] = currentAmount + entry.amount;

      batches.push({
        id: `${session.sessionId}-${entry.actorId}-${entry.action}-${index}`,
        kind: "bet",
        duration: 380,
        sourceIds: [],
        nextSeatChipAmounts,
        nextPotChipAmount: potAmount,
        flights: [
          {
            id: `${session.sessionId}-${entry.actorId}-${entry.action}-${index}-flight`,
            amount: entry.amount,
            from: stackAnchors[entry.actorId] ?? HERO_STACK_ANCHOR,
            to: betAnchors[entry.actorId] ?? HERO_BET_ANCHOR,
            delay: 0,
            kind: "bet",
          },
        ],
      });

      seatAmounts[entry.actorId] = currentAmount + entry.amount;
    });

    if (sumSeatChipAmounts(seatAmounts) > 0 && (session.street !== currentStreet || Boolean(session.result))) {
      pushCollectBatch("street-end");
    }

    if (session.result && !previousSession.result && potAmount > 0) {
      const payouts = payoutByWinner(session.result);
      batches.push({
        id: `${session.sessionId}-payout`,
        kind: "payout",
        duration: 780,
        sourceIds: ["pot"],
        winnerIds: session.result.winnerIds,
        nextSeatChipAmounts: cloneSeatChipAmounts(seatAmounts),
        nextPotChipAmount: 0,
        flights: session.result.winnerIds.map((winnerId, index) => ({
          id: `${session.sessionId}-payout-${winnerId}`,
          amount: payouts[winnerId] ?? 0,
          from: POT_ANCHOR,
          to: stackAnchors[winnerId] ?? HERO_STACK_ANCHOR,
          delay: index * 90,
          kind: "payout" as const,
        })),
      });
    }

    previousSessionRef.current = session;

    if (batches.length === 0) {
      if (!chipPlaybackRef.current) {
        setSeatChipAmounts(buildSeatChipAmounts(session));
        setPotChipAmount(buildPotChipAmount(session));
        setWinnerGlowIds(session.result?.winnerIds ?? []);
      }
      return clearChipTimers;
    }

    chipQueueRef.current.push(...batches);
    playNextBatch();
    return clearChipTimers;
  }, [session]);

  const actionForActor = (actorId: string) => (animatedAction?.actorId === actorId ? animatedAction.action : null);
  const boardActionState = animatedAction?.action ?? null;
  const boardChipState = activeBatch?.kind ?? null;
  const animatedActorMeta: AnimatedActorMeta | null = (() => {
    if (!animatedAction) return null;
    if (animatedAction.actorId === hero.id) {
      return {
        startLeft: "50%",
        startTop: "70%",
        isHero: true,
        cards: hero.cards,
      };
    }

    const botIndex = bots.findIndex((player) => player.id === animatedAction.actorId);
    if (botIndex < 0) return null;
    const layout = layouts[botIndex] ?? layouts[0]!;
    const bot = bots[botIndex]!;
    return {
      startLeft: layout.left,
      startTop: layout.variant === "top" ? "26%" : layout.top,
      isHero: false,
      cards: bot.cards,
    };
  })();

  return (
    <div className="table-overlay">
      <div className="table-overlay__spotlight" />
      <div className="table-overlay__watermark-mask" />
      <div className={`table-overlay__discard-pile ${boardActionState === "fold" ? "is-active" : ""}`} />

      {Object.entries(betAnchors).map(([playerId, point]) => {
        const amount = seatChipAmounts[playerId] ?? 0;
        const isSending = activeBatch?.kind === "collect" && activeBatch.sourceIds.includes(playerId);
        const isWinner = winnerGlowIds.includes(playerId);

        return (
          <div
            key={`${playerId}-bet-slot`}
            className={`table-chip-slot table-chip-slot--bet ${amount > 0 ? "has-chips" : ""} ${isSending ? "is-sending" : ""} ${isWinner ? "is-winner" : ""}`}
            style={pointStyle(point)}
          >
            <div className="table-chip-slot__halo" />
            <ChipPile amount={amount} variant="seat" />
            <span className="table-chip-slot__amount">{amount > 0 ? amount : "下注区"}</span>
          </div>
        );
      })}

      <div
        className={`table-chip-slot table-chip-slot--pot ${potChipAmount > 0 ? "has-chips" : ""} ${activeBatch?.kind === "payout" ? "is-sending" : ""}`}
        style={pointStyle(POT_ANCHOR)}
      >
        <div className="table-chip-slot__halo" />
        <ChipPile amount={potChipAmount} variant="pot" />
        <span className="table-chip-slot__amount">{potChipAmount > 0 ? `${potChipAmount} 在池中` : "等待收池"}</span>
      </div>

      {animatedAction && animatedActorMeta ? (
        <div
          key={animatedAction.id}
          className={`table-action table-action--${animatedAction.action}`}
          style={
            {
              "--action-start-left": animatedActorMeta.startLeft,
              "--action-start-top": animatedActorMeta.startTop,
            } as CSSProperties
          }
        >
          {animatedAction.action === "fold" ? (
            <div className="table-action__cards">
              <div className="table-action__card table-action__card--lead">
                <CardFace card={animatedActorMeta.cards[0]} hidden={!animatedActorMeta.isHero} />
              </div>
              <div className="table-action__card table-action__card--trail">
                <CardFace card={animatedActorMeta.cards[1]} hidden={!animatedActorMeta.isHero} />
              </div>
            </div>
          ) : (
            <div className="table-action__chip">
              <span />
            </div>
          )}
        </div>
      ) : null}

      {activeBatch?.flights.map((flight) => (
        <div
          key={flight.id}
          className={`chip-flight chip-flight--${flight.kind}`}
          style={
            {
              "--flight-start-left": flight.from.left,
              "--flight-start-top": flight.from.top,
              "--flight-end-left": flight.to.left,
              "--flight-end-top": flight.to.top,
              "--flight-delay": `${flight.delay}ms`,
              "--flight-duration": `${activeBatch.duration}ms`,
            } as CSSProperties
          }
        >
          <ChipPile amount={flight.amount} variant="flight" />
        </div>
      ))}

      {bots.map((bot, index) => {
        const layout = layouts[index] ?? layouts[0]!;
        const actionState = actionForActor(bot.id);
        return (
          <div
            key={bot.id}
            className={`seat seat--bot seat--bot-${layout.variant} ${actingPlayer?.id === bot.id && session.street !== "showdown" ? "is-acting" : ""} ${actionState === "raise" ? "is-raising" : ""} ${actionState === "fold" ? "is-folding" : ""} ${winnerGlowIds.includes(bot.id) ? "is-winner" : ""}`}
            style={seatStyle(layout)}
          >
            {actionState ? <div className={`seat__action-flash seat__action-flash--${actionState}`} /> : null}
            <div className="seat__caption">
              <span className="seat__kicker">
                {bot.name} · {profileLabel[bot.profile]}
              </span>
              <strong>{bot.stack} 筹码</strong>
              <small>{bot.folded ? "已弃牌" : bot.allIn ? "已全下" : "电脑席位"}</small>
            </div>

            <div className="seat__cards seat__cards--top">
              <CardFace card={bot.cards[0]} hidden={session.street !== "showdown"} />
              <CardFace card={bot.cards[1]} hidden={session.street !== "showdown"} />
            </div>

            <div className="seat__bet-badge">{bot.bet > 0 ? `投入 ${bot.bet}` : bot.folded ? "已弃牌" : "等待行动"}</div>
          </div>
        );
      })}

      <div
        className={`board-cluster ${boardActionState === "raise" ? "board-cluster--raise" : ""} ${boardActionState === "fold" ? "board-cluster--fold" : ""} ${boardChipState === "collect" ? "board-cluster--collect" : ""} ${boardChipState === "payout" ? "board-cluster--payout" : ""}`}
      >
        <div className="board-cluster__pot">
          <span className="seat__kicker">底池</span>
          <strong>{livePot}</strong>
          <small>{session.result ? "怎么领奖中" : streetLabel[session.street]}</small>
        </div>

        <div className="board-runout">
          {Array.from({ length: 5 }).map((_, index) => (
            <CardFace key={index} card={session.board[index]} hidden={!session.board[index]} label={`board-${index}`} />
          ))}
        </div>

        {lastAction ? (
          <div className="board-cluster__ticker">
            {lastAction.actorName} · {actionLabel[lastAction.action] ?? lastAction.action}
            {lastAction.amount > 0 ? ` ${lastAction.amount}` : ""}
          </div>
        ) : null}
      </div>

      <div
        className={`seat seat--hero ${actingPlayer?.id === hero.id && session.street !== "showdown" ? "is-acting" : ""} ${actionForActor(hero.id) === "raise" ? "is-raising" : ""} ${actionForActor(hero.id) === "fold" ? "is-folding" : ""} ${winnerGlowIds.includes(hero.id) ? "is-winner" : ""}`}
      >
        {actionForActor(hero.id) ? <div className={`seat__action-flash seat__action-flash--${actionForActor(hero.id)}`} /> : null}
        <div className="seat__cards seat__cards--bottom">
          <CardFace card={hero.cards[0]} />
          <CardFace card={hero.cards[1]} />
        </div>

        <div className="seat__caption seat__caption--hero">
          <span className="seat__kicker">{hero.name}</span>
          <strong>{hero.stack} 筹码</strong>
          <small>{hero.bet > 0 ? `本轮已投入 ${hero.bet}` : "等待你的决策"}</small>
        </div>

        <div className="seat__bet-badge">{hero.bet > 0 ? `投入 ${hero.bet}` : "未投入"}</div>
      </div>

      <div className="dealer-button" style={dealerOffset(buttonLayout, buttonPlayer?.isHero ?? false)}>
        D
      </div>
      <div className="scene-chip scene-chip--left" />
      <div className="scene-chip scene-chip--right" />
    </div>
  );
}
