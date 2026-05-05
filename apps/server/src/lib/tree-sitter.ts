import path from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Node, Parser } from "web-tree-sitter";

export type SemanticNodeType = "function" | "class";

export interface SemanticNode {
  type: SemanticNodeType;
  name: string | null;
  content: string;
  startLine: number;
  endLine: number;
}

type SupportedLanguage = "typescript" | "tsx" | "javascript" | "python";

const parserByLanguage = new Map<SupportedLanguage, Parser>();
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const grammarFileByLanguage: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
};

await Parser.init();

const languageByType = new Map<SupportedLanguage, Language>();
for (const language of Object.keys(
  grammarFileByLanguage,
) as SupportedLanguage[]) {
  const wasmPath = path.resolve(
    currentDir,
    "grammars",
    grammarFileByLanguage[language],
  );
  const loaded = await Language.load(wasmPath);
  languageByType.set(language, loaded);
}

function resolveLanguage(filePath: string): SupportedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts") return "typescript";
  if (ext === ".tsx") return "tsx";
  if (ext === ".js" || ext === ".jsx") return "javascript";
  if (ext === ".py") return "python";
  return null;
}

function getParser(language: SupportedLanguage): Parser {
  const cached = parserByLanguage.get(language);
  if (cached) return cached;

  const parser = new Parser();
  const grammar = languageByType.get(language);
  if (!grammar) {
    throw new Error(`Unsupported grammar not loaded: ${language}`);
  }
  parser.setLanguage(grammar);
  parserByLanguage.set(language, parser);
  return parser;
}

function inferNodeType(nodeType: string): SemanticNodeType | null {
  if (nodeType.includes("class")) return "class";
  if (nodeType.includes("function") || nodeType.includes("method"))
    return "function";
  return null;
}

function extractNodeName(node: Node): string | null {
  const byField = node.childForFieldName("name");
  if (byField && byField.text.trim().length > 0) {
    return byField.text.trim();
  }

  const signatureLine = node.text.split("\n")[0] ?? "";
  const classMatch = signatureLine.match(/class\s+([A-Za-z0-9_]+)/);
  if (classMatch?.[1]) return classMatch[1];
  const functionMatch =
    signatureLine.match(/function\s+([A-Za-z0-9_]+)/) ??
    signatureLine.match(/def\s+([A-Za-z0-9_]+)/);
  if (functionMatch?.[1]) return functionMatch[1];
  return null;
}

export function parseSemanticNodes(
  filePath: string,
  content: string,
): SemanticNode[] {
  const language = resolveLanguage(filePath);
  if (!language) return [];

  const parser = getParser(language);
  const tree = parser.parse(content);
  if (!tree) return [];

  const queue: Node[] = [tree.rootNode];
  let head = 0;
  const nodes: SemanticNode[] = [];

  while (head < queue.length) {
    const current = queue[head++];
    if (!current) break;

    // Drop the processed prefix so `queue` does not retain unbounded dead slots.
    if (head >= 100) {
      queue.splice(0, head);
      head = 0;
    }

    const inferredType = inferNodeType(current.type);
    if (inferredType) {
      nodes.push({
        type: inferredType,
        name: extractNodeName(current),
        content: content.slice(current.startIndex, current.endIndex),
        startLine: current.startPosition.row + 1,
        endLine: current.endPosition.row + 1,
      });
    }

    for (const child of current.namedChildren) {
      queue.push(child);
    }
  }

  return nodes.sort((a, b) => a.startLine - b.startLine);
}
