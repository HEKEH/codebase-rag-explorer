import type {
  ClearRepoChatHistoryData,
  CreateRepoRequest,
  DeleteRepoData,
} from "./api";

const createRequest: CreateRepoRequest = {
  source_type: "local",
  source_value: "/tmp/repo",
  auto_reload: true,
};

const deleteData: DeleteRepoData = {
  repo_id: "repo-1",
  deleted: true,
};

const clearData: ClearRepoChatHistoryData = {
  repo_id: "repo-1",
  cleared: true,
};

void createRequest;
void deleteData;
void clearData;
