import { useMutation, useQuery } from "@tanstack/react-query";
import { askApi, indexApi, repoApi } from "@repo/api-client";
import type {
  AskData,
  AskRequest,
  BuildIndexData,
  BuildIndexRequest,
  ImportRepoData,
  ImportRepoRequest,
  IndexStatusData
} from "@repo/types";

const INDEX_STATUS_POLLING_MS = 1000;

export function useImportRepo() {
  return useMutation<ImportRepoData, Error, ImportRepoRequest>({
    mutationFn: (input) => repoApi.import(input)
  });
}

export function useBuildIndex() {
  return useMutation<BuildIndexData, Error, BuildIndexRequest>({
    mutationFn: (input) => indexApi.build(input)
  });
}

export function useIndexStatus(repoId: string | null, pollingIntervalMs = INDEX_STATUS_POLLING_MS) {
  return useQuery<IndexStatusData, Error>({
    queryKey: ["index-status", repoId],
    enabled: Boolean(repoId),
    queryFn: () => repoApi.status(repoId as string),
    refetchInterval: (query) => (query.state.data?.status === "indexing" ? pollingIntervalMs : false)
  });
}

export function useAskQuestion() {
  return useMutation<AskData, Error, AskRequest>({
    mutationFn: (input) => askApi.ask(input)
  });
}
