import type { MRStatus, PipelineStatus } from "../model/mr.schema";
import type { Status } from "@shared/ui";

export type MRStatusLook = {
  status: Status;
  /** One word for a badge: "Merged", "Running". */
  label: string;
  /** The same as a phrase on its own, for a dot's name: "Pipeline running". */
  description: string;
  /** Still changing: the badge's or dot's dot pulses. */
  isLive: boolean;
};

const MR_STATE: Record<MRStatus, MRStatusLook> = {
  opened: { status: "neutral", label: "Opened", description: "Open", isLive: false },
  merged: { status: "success", label: "Merged", description: "Merged", isLive: false },
  closed: { status: "danger", label: "Closed", description: "Closed", isLive: false },
};

const PIPELINE: Record<Exclude<PipelineStatus, "none">, MRStatusLook> = {
  passed: { status: "success", label: "Passed", description: "Pipeline passed", isLive: false },
  failed: { status: "danger", label: "Failed", description: "Pipeline failed", isLive: false },
  running: { status: "active", label: "Running", description: "Pipeline running", isLive: true },
};

/** A merge request's state as a status: opened is neutral, merged success, closed danger. */
export const mrStateStatus = (state: MRStatus): MRStatusLook => MR_STATE[state];

/**
 * Its pipeline as a status: passed success, failed danger, running active and live; null when
 * there is none (or the host did not say).
 */
export const pipelineStatus = (pipeline: PipelineStatus | null | undefined): MRStatusLook | null =>
  pipeline === null || pipeline === undefined || pipeline === "none" ? null : PIPELINE[pipeline];
