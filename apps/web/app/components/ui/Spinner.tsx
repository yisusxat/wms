"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeMap = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function Spinner({ size = "md", className = "", label }: SpinnerProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} role="status">
      <Loader2
        className={`animate-spin text-blue-600 dark:text-blue-400 ${sizeMap[size]}`}
      />
      {label && (
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {label}
        </span>
      )}
      <span className="sr-only">{label || "Cargando..."}</span>
    </div>
  );
}
