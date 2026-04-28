import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import type { Reference } from "@repo/types";

type CodeReferenceProps = {
  reference: Reference;
  language: string;
};

function getLineCount(snippet: string) {
  return snippet.split("\n").length;
}

export function CodeReference({ reference, language }: CodeReferenceProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState("");

  const lineCount = useMemo(() => getLineCount(reference.snippet), [reference.snippet]);
  useEffect(() => {
    let cancelled = false;

    void codeToHtml(reference.snippet, {
      lang: language || "text",
      theme: "github-light"
    })
      .then((html) => {
        if (!cancelled) {
          setHighlightedHtml(html);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedHtml(`<pre><code>${reference.snippet}</code></pre>`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reference.snippet, language]);

  async function handleCopy() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(reference.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: 10,
          borderBottom: expanded ? "1px solid #e5e7eb" : "none"
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ fontSize: 13 }}>{reference.file_path}</strong>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            score={reference.score.toFixed(4)} | {lineCount} lines
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              background: "#f3f4f6",
              color: "#374151",
              padding: "2px 6px",
              borderRadius: 999
            }}
          >
            {language}
          </span>
          <button type="button" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? "收起代码" : "展开代码"}
          </button>
        </div>
      </header>
      {expanded && (
        <div style={{ padding: 10 }}>
          <button type="button" onClick={handleCopy} style={{ marginBottom: 8 }}>
            {copied ? "已复制" : "复制代码"}
          </button>
          <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </div>
      )}
    </article>
  );
}
