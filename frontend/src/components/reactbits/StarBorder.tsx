import type { ReactNode, ComponentPropsWithoutRef, ElementType } from "react";

type StarBorderProps<T extends ElementType = "button"> = {
  as?: T;
  className?: string;
  color?: string;
  speed?: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<T>;

export function StarBorder<T extends ElementType = "button">({
  as,
  className = "",
  color = "#10b981",
  speed = "5s",
  children,
  ...props
}: StarBorderProps<T>) {
  const Component = as || "button";

  return (
    <Component
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-xl p-[1px] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${className}`}
      {...props}
    >
      {/* Animated rotating conic gradient border beam */}
      <span
        className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite]"
        style={{
          background: `conic-gradient(from 90deg at 50% 50%, transparent 0%, transparent 65%, ${color} 85%, transparent 100%)`,
          animationDuration: speed,
        }}
        aria-hidden="true"
      />

      {/* Button body */}
      <span className="relative z-10 flex h-full w-full items-center justify-center gap-2 rounded-xl bg-space-900/90 px-4 py-2 text-sm font-semibold text-white backdrop-blur-xl transition-colors duration-200 hover:bg-space-850">
        {children}
      </span>
    </Component>
  );
}
