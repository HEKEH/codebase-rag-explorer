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

  test("P2-3 locate: bm25Weight 1 matches symmetric two-list RRF", () => {
    const k = 60;
    const dense = ["a", "b", "c"];
    const bm25 = ["b", "c", "a"];
    const def = reciprocalRankFusionTwoList(dense, bm25, k);
    const explicit = reciprocalRankFusionTwoList(dense, bm25, k, {
      bm25Weight: 1,
    });
    expect(explicit.orderedChunkIds).toEqual(def.orderedChunkIds);
  });

  test("P2-3 explain: reduced bm25Weight lets dense rank dominate when lists disagree", () => {
    const k = 60;
    const dense = ["a", "b"];
    const bm25 = ["b", "a"];
    const tied = reciprocalRankFusionTwoList(dense, bm25, k);
    expect(tied.scores.get("a")).toBeCloseTo(tied.scores.get("b")!);

    const explain = reciprocalRankFusionTwoList(dense, bm25, k, {
      bm25Weight: 0.35,
    });
    expect(explain.orderedChunkIds[0]).toBe("a");
  });

  test("P3-3: denseWeight / bm25Weight skew breaks ties for disagreeing short lists", () => {
    const k = 2;
    const dense = ["c1", "c2"];
    const bm25 = ["c2", "c1"];
    const nlish = reciprocalRankFusionTwoList(dense, bm25, k, {
      denseWeight: 1.1,
      bm25Weight: 0.88,
    });
    const plish = reciprocalRankFusionTwoList(dense, bm25, k, {
      denseWeight: 0.92,
      bm25Weight: 1.14,
    });
    expect(nlish.orderedChunkIds[0]).toBe("c1");
    expect(plish.orderedChunkIds[0]).toBe("c2");
  });
});
