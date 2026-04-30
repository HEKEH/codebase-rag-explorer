import { Link } from "react-router-dom";
import { AppShell } from "@/components/app/AppShell";

export function ReposPage() {
  return (
    <>
      <main style={{ fontFamily: "Inter, sans-serif", margin: "2rem auto 1rem", maxWidth: 1280, padding: "0 1rem" }}>
        <h1>仓库管理页</h1>
        <nav aria-label="primary-navigation">
          <Link to="/chat">聊天页</Link>
        </nav>
      </main>
      <AppShell />
    </>
  );
}
