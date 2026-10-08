const OS_NAMES: Record<string, string> = {
  Darwin: "macOS",
};

/**
 * The server's OS as a person would name it. `os_version` is Python's platform.version():
 * a number on Windows ("10.0.22631"), but a kernel banner elsewhere ("Darwin Kernel Version
 * 25.0.0: …", "#1 SMP PREEMPT_DYNAMIC …") — only a leading version number is worth showing.
 */
export const formatPlatform = (os: string, osVersion: string): string => {
  const name = OS_NAMES[os] ?? os;
  const version = /^\d+(?:\.\d+)*/.exec(osVersion.trim())?.[0];
  return version === undefined ? name : `${name} ${version}`;
};
