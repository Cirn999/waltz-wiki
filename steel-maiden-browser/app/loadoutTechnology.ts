import type { SimTechLevels } from "./loadoutMath";

export const globalTechnologyKey = "steel-loadout-global-tech-v1";
const emptyTechnology: SimTechLevels = {};
let snapshot: SimTechLevels = emptyTechnology;
let storedValue: string | null | undefined;
const listeners = new Set<() => void>();

export function getGlobalTechnology(): SimTechLevels {
  if (typeof window === "undefined") return emptyTechnology;
  try {
    const raw = window.localStorage.getItem(globalTechnologyKey);
    if (raw !== storedValue) {
      storedValue = raw;
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      snapshot = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0))
        : {};
    }
  } catch { /* Retain the session configuration if browser storage is unavailable. */ }
  return snapshot;
}

export const getServerTechnology = () => emptyTechnology;

export function subscribeGlobalTechnology(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === globalTechnologyKey || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", listener);
  };
}

export function updateGlobalTechnology(update: SimTechLevels | ((current: SimTechLevels) => SimTechLevels)) {
  snapshot = typeof update === "function" ? update(getGlobalTechnology()) : update;
  try {
    const raw = JSON.stringify(snapshot);
    window.localStorage.setItem(globalTechnologyKey, raw);
    storedValue = raw;
  } catch {
    // A quota error can leave readable old data behind. Remember its raw value
    // so the next snapshot read preserves this session's newer configuration.
    try { storedValue = window.localStorage.getItem(globalTechnologyKey); } catch { /* Session only. */ }
  }
  for (const listener of listeners) listener();
  return snapshot;
}
