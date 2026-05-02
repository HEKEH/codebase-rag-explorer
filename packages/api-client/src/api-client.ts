import { ApiClient } from "./client";

const DEFAULT_API_BASE_URL = "http://localhost:5001";

function resolveApiBaseUrl() {
  const processEnvBaseUrl = (
    globalThis as { process?: { env?: { API_BASE_URL?: string } } }
  ).process?.env?.API_BASE_URL;
  const viteEnvBaseUrl =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env
          ?.VITE_API_BASE_URL
      : undefined;

  return viteEnvBaseUrl || processEnvBaseUrl || DEFAULT_API_BASE_URL;
}

export const apiClient = new ApiClient(resolveApiBaseUrl());
