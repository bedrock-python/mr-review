import axios from "axios";

export const getApiErrorStatus = (error: unknown): number | null => {
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
