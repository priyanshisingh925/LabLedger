import type { ReactNode } from "react";

interface ShinyTextProps {
  children: ReactNode;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export function ShinyText({
  children,
  disabled = false,
  speed = 3,
  className = "",
}: ShinyTextProps) {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`relative inline-block ${
        disabled
          ? "text-slate-300"
          : "bg-gradient-to-r from-slate-200 via-white to-slate-300 bg-[length:250%_100%] bg-clip-text text-transparent"
      } ${className}`}
      style={{
        animation: disabled ? "none" : `shine ${animationDuration} linear infinite`,
      }}
    >
      {children}
    </span>
  );
}
