import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const maxWidthClass = {
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
} as const;

export type AppPageShellMaxWidth = keyof typeof maxWidthClass;

export type AppPageShellProps = {
  /** Shown next to the app title, e.g. 仓库管理页 */
  pageSubtitle: string;
  navLink: {
    to: string;
    label: string;
    icon: ReactNode;
  };
  /** Inner width for header bar and main content */
  maxWidth?: AppPageShellMaxWidth;
  children: ReactNode;
};

export function AppPageShell({
  pageSubtitle,
  navLink,
  maxWidth = "6xl",
  children,
}: AppPageShellProps) {
  const widthClass = maxWidthClass[maxWidth];
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-neutral-200/90 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 dark:border-neutral-800">
        <div
          className={cn(
            "mx-auto flex h-16 items-center justify-between px-4",
            widthClass,
          )}
        >
          <div className="flex items-center gap-3">
            <Code2 className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Codebase RAG Explorer</h1>
            <span className="text-sm text-muted-foreground">{pageSubtitle}</span>
          </div>
          <nav aria-label="primary-navigation">
            <Button variant="secondary" asChild>
              <Link to={navLink.to} className="flex items-center gap-2">
                {navLink.icon}
                {navLink.label}
              </Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className={cn("mx-auto px-4 py-6", widthClass)}>{children}</main>
    </div>
  );
}
