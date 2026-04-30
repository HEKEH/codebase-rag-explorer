import { Link } from "react-router-dom";

export function ChatPage() {
  return (
    <main style={{ fontFamily: "Inter, sans-serif", margin: "2rem auto", maxWidth: 960, padding: "0 1rem" }}>
      <h1>聊天页</h1>
      <p>这里将承载仓库选择和问答能力。</p>
      <nav aria-label="primary-navigation">
        <Link to="/repos">仓库管理页</Link>
      </nav>
    </main>
  );
}
