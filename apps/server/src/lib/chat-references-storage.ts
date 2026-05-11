import type { Reference, RetrievalFusionMode } from "@repo/types";

export type ParsedChatReferences = {
  references?: Reference[];
  retrieval_fusion?: RetrievalFusionMode;
};

function isRetrievalFusionMode(
  value: unknown,
): value is RetrievalFusionMode {
  return value === "weighted" || value === "rrf";
}

/** Supports legacy `Reference[]` or `{ references, retrieval_fusion? }`. */
export function parseChatReferencesJson(
  json: string | null,
): ParsedChatReferences {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return { references: parsed as Reference[] };
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "references" in parsed &&
      Array.isArray((parsed as { references: unknown }).references)
    ) {
      const p = parsed as {
        references: Reference[];
        retrieval_fusion?: unknown;
      };
      const out: ParsedChatReferences = { references: p.references };
      if (isRetrievalFusionMode(p.retrieval_fusion)) {
        out.retrieval_fusion = p.retrieval_fusion;
      }
      return out;
    }
  } catch {
    return {};
  }
  return {};
}

export function serializeChatReferencesForStorage(
  references: Reference[],
  retrieval_fusion?: RetrievalFusionMode,
): string {
  if (retrieval_fusion !== undefined) {
    return JSON.stringify({ references, retrieval_fusion });
  }
  return JSON.stringify(references);
}
