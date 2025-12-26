// src/components/ui/alert.tsx
import * as React from "react";
import { cn } from "@/lib/cn";

type AlertVariant = "info" | "success" | "error" | "warning";

export function Alert({
  variant = "info",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  const styles =
    variant === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : variant === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : variant === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div
      className={cn("rounded-xl border p-3 text-sm", styles, className)}
      {...props}
    />
  );
}
