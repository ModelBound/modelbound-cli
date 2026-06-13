import Conf from "conf";

export interface Profile {
  apiUrl?: string;
  apiKey?: string;
  defaultIntensity?: "conservative" | "balanced" | "aggressive";
  autosync?: boolean;
  telemetry?: boolean;
}

const store = new Conf<Record<string, Profile>>({
  projectName: "modelbound",
  configName: "config",
  defaults: { default: {} },
});

export function loadProfile(name: string): Profile {
  return store.get(name) ?? {};
}

export function saveProfile(name: string, patch: Partial<Profile>) {
  const cur = loadProfile(name);
  store.set(name, { ...cur, ...patch });
}

export function listProfiles(): string[] {
  return Object.keys(store.store);
}
