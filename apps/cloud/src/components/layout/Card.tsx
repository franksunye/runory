import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Card — the shared surface container.
 * Appends any extra classes after the base `.app-card` class.
 */
export function Card({ children, className }: CardProps) {
  return <div className={`app-card${className ? ` ${className}` : ""}`}>{children}</div>;
}

/**
 * CardHeader — a divided header section inside a Card.
 * Pair with `overflow-hidden` on the Card to clip the bottom border radius.
 */
export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="border-b border-slate-100 px-5 py-4 sm:px-6">{children}</div>;
}

/**
 * CardContent — standard interior padding for a Card.
 */
export function CardContent({ children }: { children: ReactNode }) {
  return <div className="p-5 sm:p-6">{children}</div>;
}
