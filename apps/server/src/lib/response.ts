import { ErrorCode, type ApiResponse } from "@repo/types";

export function success<T>(data: T, message = "success"): ApiResponse<T> {
  return { code: 0, message, data };
}

export function fail(code: ErrorCode, message: string): ApiResponse<null> {
  return { code, message, data: null };
}
