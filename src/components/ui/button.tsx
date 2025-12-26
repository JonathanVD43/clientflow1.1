// src/components/ui/button.tsx
import * as React from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none";

  const sizes = size === "sm" ? "px-3 py-1.5" : "px-4 py-2";

  // ✅ Darker text + clearer borders/hover on light backgrounds
  const variants =
    variant === "primary"
      ? "border-slate-900 bg-slate-900 text-white/90 hover:bg-slate-800"
      : variant === "danger"
      ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
      : variant === "ghost"
      ? "border-transparent bg-transparent text-slate-900 hover:bg-slate-100"
      : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100";

  return <button className={cn(base, sizes, variants, className)} {...props} />;
}
