import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import { Copy, Check, ChevronDown, ChevronUp, FileCode } from "lucide-react";
import type { Reference } from "@repo/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const codePanelId = `code-ref-${reference.chunk_id}`;

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
          setHighlightedHtml(`<pre class="p-4 rounded-lg bg-muted overflow-x-auto"><code>${reference.snippet}</code></pre>`);
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
    <Card className="overflow-hidden">
      <CardHeader
        className={cn(
          "flex flex-row items-center justify-between gap-2 py-3 px-4",
          expanded ? "border-b" : ""
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <FileCode className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{reference.file_path}</p>
            <p className="text-xs text-muted-foreground">
              score={reference.score.toFixed(4)} | {lineCount} lines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="font-mono text-xs">
            {language}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls={codePanelId}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span className="ml-1 text-xs">
              {expanded ? "收起代码" : "展开代码"}
            </span>
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent id={codePanelId} className="p-0">
          <div className="flex justify-end p-2 border-b">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="ml-1 text-xs">
                {copied ? "已复制" : "复制代码"}
              </span>
            </Button>
          </div>
          <div
            className="[&_pre]:!bg-transparent [&_pre]:m-0 [&_pre]:p-4 [&_code]:font-mono [&_code]:text-sm
            overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </CardContent>
      )}
    </Card>
  );
}
