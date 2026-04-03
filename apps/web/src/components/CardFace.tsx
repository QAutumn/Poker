import type { CSSProperties } from "react";
import type { CardCode } from "@poker/shared";

const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function CardFace({
  card,
  hidden = false,
  label,
  className = "",
  style,
}: {
  card?: CardCode;
  hidden?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
}) {
  if (hidden || !card) {
    return (
      <div className={`card-face card-face--hidden ${className}`.trim()} aria-label={label ?? "hidden card"} style={style}>
        <span className="card-face__pattern" />
      </div>
    );
  }

  const suit = card[1];
  const tone = suit === "h" || suit === "d" ? "red" : "black";

  return (
    <div className={`card-face card-face--${tone} ${className}`.trim()} aria-label={label ?? card} style={style}>
      <span className="card-face__rank">{card[0]}</span>
      <span className="card-face__suit">{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}
