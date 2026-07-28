import type { ReactNode } from "react";

interface ButtonGroupProps {
  children: ReactNode;
  className?: string;
}

/**
 * ButtonGroup — consistent horizontal spacing for action buttons.
 */
export function ButtonGroup({ children, className }: ButtonGroupProps) {
  return (
    <div className={`flex items-center gap-2${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
