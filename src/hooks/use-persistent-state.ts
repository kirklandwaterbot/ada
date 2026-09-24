"use client";

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

export type PersistentStateNormalizer<T> = (
  storedValue: unknown,
  fallbackValue: T,
) => T;

export function usePersistentState<T>(
  storageKey: string,
  fallbackValue: T,
  normalize: PersistentStateNormalizer<T> = acceptStoredValue,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(fallbackValue);
  const [storageReady, setStorageReady] = useState(false);
  const fallbackRef = useRef(fallbackValue);
  const normalizeRef = useRef(normalize);

  useEffect(() => {
    function restore(rawValue: string | null) {
      if (rawValue === null) {
        setValue(fallbackRef.current);
        return;
      }

      try {
        setValue(
          normalizeRef.current(JSON.parse(rawValue), fallbackRef.current),
        );
      } catch {
        setValue(fallbackRef.current);
      }
    }

    try {
      restore(window.localStorage.getItem(storageKey));
    } catch {
      setValue(fallbackRef.current);
    } finally {
      setStorageReady(true);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === storageKey) restore(event.newValue);
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [storageKey]);

  useEffect(() => {
    if (!storageReady) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing or when quota is full.
    }
  }, [storageKey, storageReady, value]);

  return [value, setValue];
}

export function normalizeStoredBoolean(storedValue: unknown, fallback: boolean) {
  return typeof storedValue === "boolean" ? storedValue : fallback;
}

export function normalizeStoredString(storedValue: unknown, fallback: string) {
  return typeof storedValue === "string" ? storedValue : fallback;
}

export function normalizeStoredPositiveInteger(
  storedValue: unknown,
  fallback: number,
) {
  return Number.isInteger(storedValue) && Number(storedValue) > 0
    ? Number(storedValue)
    : fallback;
}

function acceptStoredValue<T>(storedValue: unknown, fallbackValue: T) {
  return storedValue === undefined ? fallbackValue : (storedValue as T);
}
