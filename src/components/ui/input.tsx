// src/components/ui/input.tsx
import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400",
        "border-slate-200 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200",
        error && "border-red-300 focus:border-red-400 focus:ring-red-200",
        className
      )}
      {...props}
    />
  );
}
