import { z } from "zod";

import { httpClient } from "./http-client";

export const SystemInfoSchema = z.object({
  data_dir: z.string(),
  os: z.string(),
  os_version: z.string(),
  python_version: z.string(),
  can_open_explorer: z.boolean(),
  backend_version: z.string(),
  frontend_version: z.string().nullable(),
  deployment_mode: z.enum(["all-in-one", "standard"]),
});

export type SystemInfo = z.infer<typeof SystemInfoSchema>;

export const systemApi = {
  getInfo: async (): Promise<SystemInfo> => {
    const res = await httpClient.get<unknown>("/api/v1/system/info");
    return SystemInfoSchema.parse(res.data);
  },
};
