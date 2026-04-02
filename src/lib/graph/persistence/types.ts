export interface PersistedNodePosition {
  id: string;
  x: number;
  y: number;
}

export interface PersistedGraphPositions {
  graphKey: string;
  nodes: PersistedNodePosition[];
  savedAt?: string;
}

export type MaybePromise<T> = T | Promise<T>;

export interface GraphPositionStore {
  load: (graphKey: string) => MaybePromise<PersistedGraphPositions | null>;
  save: (positions: PersistedGraphPositions) => MaybePromise<void>;
  clear?: (graphKey: string) => MaybePromise<void>;
}
