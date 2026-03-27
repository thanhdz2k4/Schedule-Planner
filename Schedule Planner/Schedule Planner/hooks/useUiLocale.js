"use client";

import { useCallback, useEffect, useState } from "react";

export const UI_LOCALE_KEY = "schedule_planner_locale_v1";
const UI_LOCALE_EVENT = "schedule-planner:locale-change";
const DEFAULT_LOCALE = "vi";

function normalizeLocale(value) {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

export function readUiLocale() {
  if (typeof window === "undefined") {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(window.localStorage.getItem(UI_LOCALE_KEY));
}

export function writeUiLocale(nextLocale) {
  if (typeof window === "undefined") {
    return;
  }

  const locale = normalizeLocale(nextLocale);
  window.localStorage.setItem(UI_LOCALE_KEY, locale);
  window.dispatchEvent(new CustomEvent(UI_LOCALE_EVENT, { detail: locale }));
}

export function useUiLocale() {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readUiLocale());

    const onStorage = (event) => {
      if (event.key && event.key !== UI_LOCALE_KEY) {
        return;
      }

      setLocaleState(readUiLocale());
    };

    const onLocaleEvent = (event) => {
      setLocaleState(normalizeLocale(event?.detail));
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(UI_LOCALE_EVENT, onLocaleEvent);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UI_LOCALE_EVENT, onLocaleEvent);
    };
  }, []);

  const setLocale = useCallback((nextLocale) => {
    const resolved = typeof nextLocale === "function" ? normalizeLocale(nextLocale(readUiLocale())) : normalizeLocale(nextLocale);
    setLocaleState(resolved);
    writeUiLocale(resolved);
  }, []);

  return [locale, setLocale];
}

