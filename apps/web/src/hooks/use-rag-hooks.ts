import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { askApi, chatApi, indexApi, repoApi } from "@repo/api-client";
import type {
  AskData,
  AskRequest,
  BuildIndexData,
  BuildIndexRequest,
  ClearRepoChatHistoryData,
  CreateRepoRequest,
  GetRepoChatHistoryData,
  ImportRepoData,
  ImportRepoRequest,
  IndexStatusData,
  Message,
  Reference,
  SaveRepoChatMessageData
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
  const queryClient = useQueryClient();
  return useMutation<ClearRepoChatHistoryData, Error, string>({
    mutationFn: (repoId) => chatApi.clearHistory(repoId),
    onSuccess: (_, repoId) => {
      queryClient.setQueryData<GetRepoChatHistoryData>(["chat-history", repoId], {
        repo_id: repoId,
        messages: []
      });
    }
  });
}

export function useChatHistory(repoId: string | null) {
  const normalizedRepoId = repoId?.trim() ?? "";
  return useQuery<GetRepoChatHistoryData, Error>({
    queryKey: ["chat-history", normalizedRepoId || null],
    enabled: Boolean(normalizedRepoId),
    queryFn: () => chatApi.getHistory(normalizedRepoId),
    staleTime: Infinity
  });
}

interface SaveChatMessageParams {
  repoId: string;
  role: "user" | "assistant";
  content: string;
  references?: Reference[];
}

interface SaveChatMessageContext {
  previousHistory?: GetRepoChatHistoryData;
}

export function useSaveChatMessage() {
  const queryClient = useQueryClient();
  return useMutation<SaveRepoChatMessageData, Error, SaveChatMessageParams, SaveChatMessageContext>({
    mutationFn: (params) => chatApi.saveMessage(params.repoId, params.role, params.content, params.references),
    onMutate: async (params) => {
      await queryClient.cancelQueries({ queryKey: ["chat-history", params.repoId] });
      const previousHistory = queryClient.getQueryData<GetRepoChatHistoryData>(["chat-history", params.repoId]);
      const newMessage: Message = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        role: params.role,
        content: params.content,
        references: params.references
      };
      queryClient.setQueryData<GetRepoChatHistoryData>(["chat-history", params.repoId], (old) => {
        if (!old) {
          return {
            repo_id: params.repoId,
            messages: [{
              id: newMessage.id,
              role: newMessage.role,
              content: newMessage.content,
              references: newMessage.references,
              created_at: new Date(newMessage.timestamp).toISOString()
            }]
          };
        }
        return {
          ...old,
          messages: [...old.messages, {
            id: newMessage.id,
            role: newMessage.role,
            content: newMessage.content,
            references: newMessage.references,
            created_at: new Date(newMessage.timestamp).toISOString()
          }]
        };
      });
      return { previousHistory };
    },
    onError: (_, __, context) => {
      if (context?.previousHistory) {
        queryClient.setQueryData(["chat-history"], context.previousHistory);
      }
    }
  });
}
