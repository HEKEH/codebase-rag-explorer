import { ApiClient } from "./client";

const DEFAULT_API_BASE_URL = "http://localhost:5001";

export const apiClient = new ApiClient(DEFAULT_API_BASE_URL);
