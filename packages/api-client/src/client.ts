import type { ApiResponse } from "@repo/types";

export class ApiError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, init);
    const payload = (await response.json()) as ApiResponse<T>;

    if (!response.ok || payload.code !== 0 || payload.data === null) {
      throw new ApiError(
        payload.code ?? response.status,
        payload.message ?? "Request failed",
      );
    }

    return payload.data;
  }
}
