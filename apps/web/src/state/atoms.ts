import { atom } from "jotai";
import type { Message, RepoStatus } from "@repo/types";

export type RepoState = {
  repoId: string | null;
  status: RepoStatus;
  fileCount: number;
  chunkCount: number;
};

const initialRepoState: RepoState = {
  repoId: null,
  status: "idle",
  fileCount: 0,
  chunkCount: 0
};

export const repoAtom = atom<RepoState>(initialRepoState);

export const repoStatusAtom = atom((get) => get(repoAtom).status);

export const isIndexedAtom = atom((get) => get(repoStatusAtom) === "indexed");

export const messagesAtom = atom<Message[]>([]);

export const currentQuestionAtom = atom("");

export const isAskingAtom = atom(false);
