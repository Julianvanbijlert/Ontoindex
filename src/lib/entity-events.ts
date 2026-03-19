const APP_DATA_CHANGED_EVENT = "ontoindex:app-data-changed";

export interface AppDataChangeDetail {
  entityType: "definition" | "ontology" | "favorite" | "notification" | "relationship";
  action: "created" | "updated" | "deleted" | "imported";
  entityId?: string;
}

export function emitAppDataChanged(detail: AppDataChangeDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppDataChangeDetail>(APP_DATA_CHANGED_EVENT, { detail }));
}

export function subscribeToAppDataChanges(callback: (detail: AppDataChangeDetail) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = (event: Event) => {
    callback((event as CustomEvent<AppDataChangeDetail>).detail);
  };

  window.addEventListener(APP_DATA_CHANGED_EVENT, listener);

  return () => {
    window.removeEventListener(APP_DATA_CHANGED_EVENT, listener);
  };
}
