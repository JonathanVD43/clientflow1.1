// src/components/ui/link-button.tsx
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/cn";

type LinkButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type LinkButtonSize = "sm" | "md";

export type LinkButtonProps = Omit<
  React.ComponentProps<typeof Link>,
  "className"
> & {
  className?: string;
  variant?: LinkButtonVariant;
  size?: LinkButtonSize;
  prefetch?: boolean;
};

export function LinkButton({
  variant = "secondary",
  size = "sm",
  className,
  prefetch = false,
  ...props
}: LinkButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-medium transition active:scale-[0.99] whitespace-nowrap min-w-[7.5rem]";

  const sizes = size === "md" ? "px-4 py-2" : "px-3 py-1.5 text-xs";

  const variants =
    variant === "primary"
      ? "border-slate-900 bg-slate-900 text-white/90 hover:bg-slate-800"
      : variant === "danger"
      ? "border-red-300 bg-red-50 text-red-800 hover:bg-red-100"
      : variant === "ghost"
      ? "border-transparent bg-transparent text-slate-800 hover:bg-slate-100"
      : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100";

  return (
    <Link
      {...props}
      prefetch={prefetch}
      className={cn(base, sizes, variants, className)}
    />
  );
}
