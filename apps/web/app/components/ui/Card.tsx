"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
  padding?: "sm" | "md" | "lg";
}

const paddingStyles = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export function Card({
  children,
  className = "",
  onClick,
  interactive = false,
  padding = "md",
}: CardProps) {
  const interactiveClasses = interactive || onClick
    ? "cursor-pointer hover:border-blue-400 hover:shadow-md dark:hover:border-blue-600 transition"
    : "";

  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={`rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 ${paddingStyles[padding]} ${interactiveClasses} ${className}`}
    >
      {children}
    </Component>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function CardHeader({ children, icon, action, className = "" }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-blue-600 dark:text-blue-400">{icon}</span>}
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{children}</h3>
      </div>
      {action}
    </div>
  );
}
