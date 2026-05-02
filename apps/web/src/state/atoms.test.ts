import { describe, expect, test } from "vitest";
import { createStore } from "jotai/vanilla";
import type { Message } from "@repo/types";
import {
  currentQuestionAtom,
  isAskingAtom,
  isIndexedAtom,
  messagesByRepoAtom,
  messagesAtom,
  repoAtom,
  repoStatusAtom,
} from "./atoms";

describe("state atoms", () => {
  test("repoStatusAtom and isIndexedAtom derive from repoAtom", () => {
    const store = createStore();

    expect(store.get(repoStatusAtom)).toBe("idle");
    expect(store.get(isIndexedAtom)).toBe(false);

    store.set(repoAtom, {
      repoId: "repo-1",
      status: "indexing",
      fileCount: 8,
      chunkCount: 0,
    });
    expect(store.get(repoStatusAtom)).toBe("indexing");
    expect(store.get(isIndexedAtom)).toBe(false);

    store.set(repoAtom, {
      repoId: "repo-1",
      status: "indexed",
      fileCount: 8,
      chunkCount: 120,
    });
    expect(store.get(repoStatusAtom)).toBe("indexed");
    expect(store.get(isIndexedAtom)).toBe(true);
  });

  test("messagesAtom can append and replace conversation messages", () => {
    const store = createStore();
    const message: Message = {
      id: "m-1",
      timestamp: Date.now(),
      role: "user",
      content: "What does IndexService do?",
    };

    store.set(messagesAtom, [message]);
    expect(store.get(messagesAtom)).toEqual([message]);

    store.set(messagesAtom, []);
    expect(store.get(messagesAtom)).toEqual([]);
  });

  test("currentQuestionAtom and isAskingAtom are writable", () => {
    const store = createStore();

    expect(store.get(currentQuestionAtom)).toBe("");
    expect(store.get(isAskingAtom)).toBe(false);

    store.set(currentQuestionAtom, "How does retrieval ranking work?");
    store.set(isAskingAtom, true);
    expect(store.get(currentQuestionAtom)).toBe(
      "How does retrieval ranking work?",
    );
    expect(store.get(isAskingAtom)).toBe(true);
  });

  test("messagesByRepoAtom stores isolated message history per repository", () => {
    const store = createStore();
    const repo1Message: Message = {
      id: "repo1-m1",
      timestamp: Date.now(),
      role: "assistant",
      content: "repo 1 answer",
    };
    const repo2Message: Message = {
      id: "repo2-m1",
      timestamp: Date.now(),
      role: "assistant",
      content: "repo 2 answer",
    };

    store.set(messagesByRepoAtom, {
      "repo-1": [repo1Message],
      "repo-2": [repo2Message],
    });

    expect(store.get(messagesByRepoAtom)["repo-1"]).toEqual([repo1Message]);
    expect(store.get(messagesByRepoAtom)["repo-2"]).toEqual([repo2Message]);
  });
});
