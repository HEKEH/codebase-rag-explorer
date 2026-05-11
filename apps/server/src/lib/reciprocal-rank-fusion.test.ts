import { describe, expect, test } from "bun:test";
import { reciprocalRankFusionTwoList } from "./reciprocal-rank-fusion";

describe("reciprocalRankFusionTwoList", () => {
  test("orders by sum of 1/(k+rank) for dense and BM25 lists (k=60)", () => {
    const k = 60;
    const dense = ["a", "b", "c"];
    const bm25 = ["b", "c", "a"];

    const expectedScore = (id: string) => {
      let s = 0;
      const di = dense.indexOf(id) + 1;
      const bi = bm25.indexOf(id) + 1;
      if (di > 0) s += 1 / (k + di);
      if (bi > 0) s += 1 / (k + bi);
      return s;
    };

    const { orderedChunkIds, scores } = reciprocalRankFusionTwoList(
      dense,
      bm25,
      k,
    );

    expect(scores.get("a")).toBeCloseTo(expectedScore("a"));
    expect(scores.get("b")).toBeCloseTo(expectedScore("b"));
    expect(scores.get("c")).toBeCloseTo(expectedScore("c"));

    // b wins; a beats c (see retrieval-enhancement-design §3.B RRF)
    expect(orderedChunkIds).toEqual(["b", "a", "c"]);
  });

  test("uses first occurrence rank when an id repeats in one list", () => {
    const k = 1;
    const dense = ["x", "y", "x"];
    const bm25 = ["y"];
    const { orderedChunkIds, scores } = reciprocalRankFusionTwoList(
      dense,
      bm25,
      k,
    );

    const xScore = 1 / (k + 1); // rank 1 in dense only
    const yScore = 1 / (k + 2) + 1 / (k + 1); // rank 2 dense, rank 1 bm25
    expect(scores.get("x")).toBeCloseTo(xScore);
    expect(scores.get("y")).toBeCloseTo(yScore);
    expect(orderedChunkIds[0]).toBe("y");
  });

  test("tie-breaks equal RRF scores by chunk_id lexicographic order", () => {
    const k = 60;
    const dense = ["a", "b"];
    const bm25 = ["b", "a"];
    const { orderedChunkIds, scores } = reciprocalRankFusionTwoList(
      dense,
      bm25,
      k,
    );
    expect(scores.get("a")).toBeCloseTo(scores.get("b")!);
    expect(orderedChunkIds).toEqual(["a", "b"]);
  });

  test("single-list contribution preserves that list order", () => {
    const k = 10;
    const dense: string[] = [];
    const bm25 = ["u", "v", "w"];
    const { orderedChunkIds } = reciprocalRankFusionTwoList(dense, bm25, k);
    expect(orderedChunkIds).toEqual(["u", "v", "w"]);
  });
});
