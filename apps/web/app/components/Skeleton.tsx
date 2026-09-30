"use client";

import React from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn" aria-busy="true" aria-label="Cargando panel de control">
      {/* Operational Status Bar Skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-2.5 w-2.5 rounded-full" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-5 w-40 rounded-md" />
        </div>
        <Skeleton className="h-7 w-24 rounded-lg" />
      </div>

      {/* 8 KPI Metric Cards (4x2 Grid — matching real Dashboard) */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-24" />
            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-2">
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Workstation Actions (6 tiles) */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2"
            >
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          ))}
        </div>
      </div>

      {/* Two-Column Section: Activity Feed + Aisle Saturation */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Activity Feed (7 cols) */}
        <div className="lg:col-span-7 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <Skeleton className="h-3.5 w-12 ml-auto" />
                  <Skeleton className="h-2.5 w-10 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Aisle Saturation + Health (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            {[1, 2].map((a) => (
              <div key={a} className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-2">
            <Skeleton className="h-4 w-44" />
            {[1, 2, 3].map((r) => (
              <div key={r} className="flex justify-between py-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800" aria-busy="true">
      <div className="flex gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-2.5">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function WarehouseGridSkeleton() {
  return (
    <div className="space-y-4 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800" aria-busy="true">
      <div className="flex justify-between items-center">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i} className="p-3 border border-slate-100 dark:border-slate-800 rounded-xl space-y-2 bg-slate-50 dark:bg-slate-800/40">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-full rounded-md" />
            <Skeleton className="h-2 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
