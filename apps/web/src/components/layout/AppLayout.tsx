import type { ReactNode } from "react";

type AppLayoutProps = {
  leftPanel: ReactNode;
  rightPanel: ReactNode;
};

export function AppLayout({ leftPanel, rightPanel }: AppLayoutProps) {
  return (
    <main
      data-testid="app-layout"
      style={{
        display: "flex",
        gap: 16,
        minWidth: 1024,
        margin: "0 auto",
        maxWidth: 1280,
        padding: "1rem"
      }}
    >
      <aside data-testid="app-layout-left" style={{ width: 320, flexShrink: 0 }}>
        {leftPanel}
      </aside>
      <section data-testid="app-layout-right" style={{ flex: "1 1 0%" }}>
        {rightPanel}
      </section>
    </main>
  );
}
