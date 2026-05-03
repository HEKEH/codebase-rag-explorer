import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { askApi, chatApi, indexApi, repoApi } from "@repo/api-client";
import type {
  AskData,
  AskRequest,
  BuildIndexData,
  BuildIndexRequest,
  ChatHistoryRole,
  ClearRepoChatHistoryData,
  CreateRepoRequest,
  GetRepoChatHistoryData,
  ImportRepoData,
  ImportRepoRequest,
  IndexStatusData,
  Message,
  Reference,
  SaveRepoChatMessageData,
} from "@repo/types";

const INDEX_STATUS_POLLING_MS = 1000;

/** Aligns with `useChatHistory` queryKey (`trim` + empty → null). */
function chatHistoryQueryKey(repoId: string) {
  const normalized = repoId.trim();
  return ["chat-history", normalized || null] as const;
}

export function useImportRepo() {
  return useMutation<ImportRepoData, Error, ImportRepoRequest>({
    mutationFn: (input) =>
      repoApi.create({
        source_type: input.type,
        source_value: input.path,
      }),
  });
}

export function useCreateRepo() {
  return useMutation<ImportRepoData, Error, CreateRepoRequest>({
    mutationFn: (input) => repoApi.create(input),
  });
}

export function useBuildIndex() {
  return useMutation<BuildIndexData, Error, BuildIndexRequest>({
    mutationFn: (input) => indexApi.build(input),
  });
}

export function useReloadRepo() {
  return useMutation<BuildIndexData, Error, string>({
    mutationFn: (repoId) => repoApi.reload(repoId),
  });
}

export function useIndexStatus(
  repoId: string | null,
  pollingIntervalMs = INDEX_STATUS_POLLING_MS,
) {
  const normalizedRepoId = repoId?.trim() ?? "";
  return useQuery<IndexStatusData, Error>({
    queryKey: ["index-status", normalizedRepoId || null],
    enabled: Boolean(normalizedRepoId),
    queryFn: () => repoApi.status(normalizedRepoId),
    refetchInterval: (query) =>
      query.state.data?.status === "indexing" ? pollingIntervalMs : false,
  });
}

export function useAskQuestion() {
  return useMutation<AskData, Error, AskRequest>({
    mutationFn: (input) => askApi.ask(input),
  });
}

export function useClearRepoChatHistory() {
  const queryClient = useQueryClient();
  return useMutation<ClearRepoChatHistoryData, Error, string>({
    mutationFn: (repoId) => chatApi.clearHistory(repoId.trim()),
    onSuccess: (_, repoId) => {
      const normalized = repoId.trim();
      queryClient.setQueryData<GetRepoChatHistoryData>(
        chatHistoryQueryKey(repoId),
        {
          repo_id: normalized,
          messages: [],
        },
      );
    },
  });
}

export function useChatHistory(repoId: string | null) {
  const normalizedRepoId = repoId?.trim() ?? "";
  return useQuery<GetRepoChatHistoryData, Error>({
    queryKey: ["chat-history", normalizedRepoId || null],
    enabled: Boolean(normalizedRepoId),
    queryFn: () => chatApi.getHistory(normalizedRepoId),
    staleTime: Infinity,
  });
}

interface SaveChatMessageParams {
  repoId: string;
  role: ChatHistoryRole;
  content: string;
  references?: Reference[];
}

interface SaveChatMessageContext {
  previousHistory: GetRepoChatHistoryData | undefined;
  optimisticMessageId: string;
}

export function useSaveChatMessage() {
  const queryClient = useQueryClient();
  return useMutation<
    SaveRepoChatMessageData,
    Error,
    SaveChatMessageParams,
    SaveChatMessageContext
  >({
    mutationFn: (params) =>
      chatApi.saveMessage(
        params.repoId.trim(),
        params.role,
        params.content,
        params.references,
      ),
    onMutate: async (params) => {
      const queryKey = chatHistoryQueryKey(params.repoId);
      await queryClient.cancelQueries({
        queryKey: [...queryKey],
      });
      const previousHistory =
        queryClient.getQueryData<GetRepoChatHistoryData>(queryKey);
      const optimisticMessageId = crypto.randomUUID();
      const newMessage: Message = {
        id: optimisticMessageId,
        timestamp: Date.now(),
        role: params.role,
        content: params.content,
        references: params.references,
      };
      queryClient.setQueryData<GetRepoChatHistoryData>(
        queryKey,
        (old) => {
          const repoId = params.repoId.trim();
          if (!old) {
            return {
              repo_id: repoId,
              messages: [
                {
                  id: newMessage.id,
                  role: newMessage.role,
                  content: newMessage.content,
                  references: newMessage.references,
                  created_at: new Date(newMessage.timestamp).toISOString(),
                },
              ],
            };
          }
          return {
            ...old,
            messages: [
              ...old.messages,
              {
                id: newMessage.id,
                role: newMessage.role,
                content: newMessage.content,
                references: newMessage.references,
                created_at: new Date(newMessage.timestamp).toISOString(),
              },
            ],
          };
        },
      );
      return { previousHistory, optimisticMessageId };
    },
    onSuccess: (data, variables, context) => {
      if (!context || !data.message_id) return;
      const queryKey = chatHistoryQueryKey(variables.repoId);
      queryClient.setQueryData<GetRepoChatHistoryData>(queryKey, (old) => {
        if (!old) return old;
        const idx = old.messages.findIndex(
          (m) => m.id === context.optimisticMessageId,
        );
        if (idx === -1) return old;
        const messages = old.messages.map((m, i) =>
          i === idx ? { ...m, id: data.message_id } : m,
        );
        return { ...old, messages };
      });
    },
    onError: (_error, variables, context) => {
      const queryKey = chatHistoryQueryKey(variables.repoId);
      if (context?.previousHistory !== undefined) {
        queryClient.setQueryData<GetRepoChatHistoryData>(
          queryKey,
          context.previousHistory,
        );
      } else {
        queryClient.removeQueries({ queryKey: [...queryKey] });
      }
    },
  });
}
