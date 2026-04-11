"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { ChevronDown, Settings as SettingsIcon, Home } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  // Open the section that matches current URL by default.
  const initialOpen = NAV.find((s) => pathname?.startsWith(`/${s.slug}`))?.slug;
  const [open, setOpen] = useState<string | null>(initialOpen ?? "analytics");

  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-slate-200">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-indigo-600 to-violet-600 grid place-items-center text-white font-bold">
            S
          </div>
          <div>
            <div className="font-semibold text-slate-900 leading-tight">
              SEO
            </div>
            <div className="text-[10px] tracking-wider text-slate-500 uppercase">
              for Shopify
            </div>
          </div>
        </Link>
      </div>

      <nav className="py-2">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50",
            pathname === "/" && "bg-indigo-50 text-indigo-700 font-medium",
          )}
        >
          <Home className="w-4 h-4" /> Home
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50",
            pathname === "/settings" &&
              "bg-indigo-50 text-indigo-700 font-medium",
          )}
        >
          <SettingsIcon className="w-4 h-4" /> Settings
        </Link>

        {NAV.map((section) => {
          const SectionIcon = section.icon;
          const isOpen = open === section.slug;
          return (
            <div key={section.slug} className="mt-1">
              <button
                type="button"
                onClick={() =>
                  setOpen((cur) =>
                    cur === section.slug ? null : section.slug,
                  )
                }
                className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <SectionIcon className="w-3.5 h-3.5" /> {section.title}
                </span>
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen && (
                <div className="pb-2">
                  {section.items.map((item) => {
                    const href = `/${section.slug}/${item.slug}`;
                    const active = pathname === href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-2 pl-9 pr-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50",
                          active &&
                            "bg-indigo-50 text-indigo-700 font-medium border-l-2 border-indigo-500 -ml-px pl-[34px]",
                        )}
                      >
                        <Icon className="w-3.5 h-3.5 opacity-70" />
                        <span className="truncate">{item.title}</span>
                        {item.premium && (
                          <span className="ml-auto text-[9px] px-1 py-px rounded bg-amber-100 text-amber-700 font-semibold">
                            PRO
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
