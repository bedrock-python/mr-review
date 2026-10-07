import axios from "axios";
import { ApiError } from "@shared/api";

export const getApiErrorStatus = (error: unknown): number | null => {
  // The shared http client rewraps every Axios failure into ApiError, so most
  // errors that reach the UI carry their status there rather than on `response`.
  if (error instanceof ApiError) {
    return error.status === 0 ? null : error.status;
  }
  if (axios.isAxiosError(error) && error.response) {
    return error.response.status;
  }
  return null;
};

export const getVcsErrorMessage = (error: unknown): string => {
  const status = getApiErrorStatus(error);
  if (status === 401) return "Authentication failed — check your token in Settings";
  if (status === 403) return "Access denied — insufficient permissions";
  return "Failed to load";
};
