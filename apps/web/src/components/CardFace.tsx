import type { CardCode } from "@poker/shared";

const SUIT_SYMBOL: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function CardFace({ card, hidden = false, label }: { card?: CardCode; hidden?: boolean; label?: string }) {
  if (hidden || !card) {
    return (
      <div className="card-face card-face--hidden" aria-label={label ?? "hidden card"}>
        <span className="card-face__pattern" />
      </div>
    );
  }

  const suit = card[1];
  const tone = suit === "h" || suit === "d" ? "red" : "black";

  return (
    <div className={`card-face card-face--${tone}`} aria-label={label ?? card}>
      <span className="card-face__rank">{card[0]}</span>
      <span className="card-face__suit">{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}
