import { ApiError } from "@shared/api";

const MAX_LISTED_PROBLEMS = 3;

type ValidationProblem = { loc: (string | number)[]; msg: string };

const isValidationProblem = (value: unknown): value is ValidationProblem =>
  typeof value === "object" &&
  value !== null &&
  "loc" in value &&
  Array.isArray(value.loc) &&
  "msg" in value &&
  typeof value.msg === "string";

const parseProblems = (message: string): ValidationProblem[] | null => {
  try {
    const parsed: unknown = JSON.parse(message);
    return Array.isArray(parsed) && parsed.every(isValidationProblem) ? parsed : null;
  } catch {
    return null;
  }
};

const describeProblem = ({ loc, msg }: ValidationProblem): string => {
  const path = loc[0] === "body" ? loc.slice(1) : loc;
  return path.length > 0 ? `${path.join(".")}: ${msg}` : msg;
};

/** One readable message for a failed preview or import. */
export const formatImportError = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 422) {
    const problems = parseProblems(error.message);
    if (problems && problems.length > 0) {
      const listed = problems.slice(0, MAX_LISTED_PROBLEMS).map(describeProblem).join("; ");
      const more = problems.length - MAX_LISTED_PROBLEMS;
      return `This file is not a valid mr-review export (${listed}${more > 0 ? `; and ${String(more)} more` : ""}).`;
    }
    return "This file is not a valid mr-review export.";
  }
  if (error instanceof ApiError && error.status === 0) {
    return "The server could not be reached. Check that mr-review is running and try again.";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
};
