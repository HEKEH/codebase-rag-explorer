import { useMutation, useQuery } from "@tanstack/react-query";
import { askApi, chatApi, indexApi, repoApi } from "@repo/api-client";
import type {
  AskData,
  AskRequest,
  BuildIndexData,
  BuildIndexRequest,
  ClearRepoChatHistoryData,
  CreateRepoRequest,
  ImportRepoData,
  ImportRepoRequest,
  IndexStatusData
} from "@repo/types";

const INDEX_STATUS_POLLING_MS = 1000;

export function useImportRepo() {
  return useMutation<ImportRepoData, Error, ImportRepoRequest>({
    mutationFn: (input) => repoApi.create({
      source_type: input.type,
      source_value: input.path
    })
  });
}

export function useCreateRepo() {
  return useMutation<ImportRepoData, Error, CreateRepoRequest>({
    mutationFn: (input) => repoApi.create(input)
  });
}

export function useBuildIndex() {
  return useMutation<BuildIndexData, Error, BuildIndexRequest>({
    mutationFn: (input) => indexApi.build(input)
  });
}

export function useReloadRepo() {
  return useMutation<BuildIndexData, Error, string>({
    mutationFn: (repoId) => repoApi.reload(repoId)
  });
}

export function useIndexStatus(repoId: string | null, pollingIntervalMs = INDEX_STATUS_POLLING_MS) {
  const normalizedRepoId = repoId?.trim() ?? "";
  return useQuery<IndexStatusData, Error>({
    queryKey: ["index-status", normalizedRepoId || null],
    enabled: Boolean(normalizedRepoId),
    queryFn: () => repoApi.status(normalizedRepoId),
    refetchInterval: (query) => (query.state.data?.status === "indexing" ? pollingIntervalMs : false)
  });
}

export function useAskQuestion() {
  return useMutation<AskData, Error, AskRequest>({
    mutationFn: (input) => askApi.ask(input)
  });
}

export function useClearRepoChatHistory() {
  return useMutation<ClearRepoChatHistoryData, Error, string>({
    mutationFn: (repoId) => chatApi.clearHistory(repoId)
  });
}
