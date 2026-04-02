import { useCallback, useEffect, useMemo, useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { GraphModel } from "@/lib/graph/model";
import type { GraphRendererProps } from "@/lib/graph/renderers";
import type { GraphLayoutRequest } from "@/lib/graph/layouts/types";
import type { GraphRendererPreferenceStore, InteractiveGraphRendererId } from "@/lib/graph/preferences/types";
import type { GraphRendererInstallationStore } from "@/lib/graph/renderer-installation";
import type { GraphPositionStore } from "@/lib/graph/persistence/types";
import { cn } from "@/lib/utils";
import {
  getSupportedGraphRenderers,
  resolveGraphRenderer,
  resolveGraphRendererId,
} from "@/lib/graph/renderers";
import { applyGraphLayout } from "@/lib/graph/layouts/apply-layout";
import { localStorageGraphRendererPreferenceStore } from "@/lib/graph/preferences/LocalStorageGraphRendererPreferenceStore";
import { resolveGraphRendererPreferenceScope } from "@/lib/graph/preferences/types";
import { applyPersistedPositions } from "@/lib/graph/persistence/apply-persisted-positions";
import { localStorageGraphPositionStore } from "@/lib/graph/persistence/LocalStorageGraphPositionStore";
import { resolveGraphPersistenceKey } from "@/lib/graph/persistence/resolve-graph-key";
import { localStorageGraphRendererInstallationStore } from "@/lib/graph/LocalStorageGraphRendererInstallationStore";
import {
  graphRendererManifests,
  resolveEnabledGraphRendererManifests,
  type GraphRendererManifest,
} from "@/lib/graph/renderer-registry";

interface GraphViewProps extends Omit<GraphRendererProps, "model"> {
  model: GraphModel;
  autoLayout?: boolean;
  layoutRequest?: GraphLayoutRequest;
  graphKey?: string;
  persistPositions?: boolean;
  positionStore?: GraphPositionStore;
  rendererId?: string;
  rendererPreferenceStore?: GraphRendererPreferenceStore;
  rendererInstallationStore?: GraphRendererInstallationStore;
  rendererManifests?: GraphRendererManifest[];
}

interface PersistedPositionsState {
  graphKey: string | null;
  positions: ReturnType<typeof getSynchronousPersistedPositions>;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function getSynchronousPersistedPositions(
  positionStore: GraphPositionStore,
  graphKey: string | null,
  persistPositions: boolean | undefined,
) {
  if (persistPositions === false || !graphKey) {
    return null;
  }

  try {
    const loaded = positionStore.load(graphKey);
    return isPromiseLike(loaded) ? null : loaded;
  } catch {
    return null;
  }
}

function getSynchronousRendererInstallations(
  rendererInstallationStore: GraphRendererInstallationStore,
) {
  try {
    const loaded = rendererInstallationStore.load();
    return isPromiseLike(loaded) ? null : loaded;
  } catch {
    return null;
  }
}

function getStoredRendererPreference(
  scope: ReturnType<typeof resolveGraphRendererPreferenceScope>,
  rendererPreferenceStore: GraphRendererPreferenceStore,
) {
  if (!scope) {
    return null;
  }

  try {
    const storedPreference = rendererPreferenceStore.get(scope);
    return isPromiseLike(storedPreference) ? null : storedPreference;
  } catch {
    return null;
  }
}

export function GraphView(props: GraphViewProps) {
  const {
    autoLayout = true,
    className,
    graphKey,
    layoutRequest,
    model,
    onCreateEdge,
    onNodeDoubleClick,
    onNodePositionChange,
    onSelectionChange,
    persistPositions,
    positionStore: providedPositionStore,
    readOnly,
    rendererId,
    rendererPreferenceStore: providedRendererPreferenceStore,
    rendererInstallationStore: providedRendererInstallationStore,
    rendererManifests: providedRendererManifests,
  } = props;
  const positionStore = providedPositionStore ?? localStorageGraphPositionStore;
  const rendererPreferenceStore = providedRendererPreferenceStore ?? localStorageGraphRendererPreferenceStore;
  const rendererInstallationStore = providedRendererInstallationStore ?? localStorageGraphRendererInstallationStore;
  const manifests = providedRendererManifests ?? graphRendererManifests;
  const rendererPreferenceScope = useMemo(
    () => resolveGraphRendererPreferenceScope(model.kind),
    [model.kind],
  );
  const resolvedGraphKey = useMemo(
    () => resolveGraphPersistenceKey(model, graphKey),
    [graphKey, model],
  );
  const [preferredRendererId, setPreferredRendererId] = useState<InteractiveGraphRendererId | null>(() =>
    rendererId ? null : getStoredRendererPreference(rendererPreferenceScope, rendererPreferenceStore),
  );
  const [persistedState, setPersistedState] = useState<PersistedPositionsState>(() => ({
    graphKey: resolvedGraphKey,
    positions: getSynchronousPersistedPositions(positionStore, resolvedGraphKey, persistPositions),
  }));
  const [rendererInstallations, setRendererInstallations] = useState<ReturnType<typeof getSynchronousRendererInstallations>>(
    () => getSynchronousRendererInstallations(rendererInstallationStore),
  );
  const persistedPositions = persistedState.graphKey === resolvedGraphKey ? persistedState.positions : null;
  const enabledRendererManifests = useMemo(
    () => resolveEnabledGraphRendererManifests(manifests, rendererInstallations),
    [manifests, rendererInstallations],
  );
  const enabledRenderers = useMemo(
    () => enabledRendererManifests.map((manifest) => manifest.adapter),
    [enabledRendererManifests],
  );
  const supportedRendererManifests = useMemo(
    () => enabledRendererManifests.filter((manifest) => manifest.adapter.supports(model.kind)),
    [enabledRendererManifests, model.kind],
  );
  const supportedRenderers = useMemo(
    () => getSupportedGraphRenderers(model, enabledRenderers),
    [enabledRenderers, model],
  );

  useEffect(() => {
    if (rendererId) {
      setPreferredRendererId(null);
      return;
    }

    if (!rendererPreferenceScope) {
      setPreferredRendererId(null);
      return;
    }

    let cancelled = false;

    try {
      const storedPreference = rendererPreferenceStore.get(rendererPreferenceScope);

      if (isPromiseLike(storedPreference)) {
        setPreferredRendererId((current) => current);

        void storedPreference
          .then((value) => {
            if (!cancelled) {
              setPreferredRendererId(value ?? null);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setPreferredRendererId(null);
            }
          });

        return () => {
          cancelled = true;
        };
      }

      setPreferredRendererId(storedPreference ?? null);
    } catch {
      setPreferredRendererId(null);
    }

    return () => {
      cancelled = true;
    };
  }, [rendererId, rendererPreferenceScope, rendererPreferenceStore]);

  useEffect(() => {
    let cancelled = false;

    try {
      const loaded = rendererInstallationStore.load();

      if (isPromiseLike(loaded)) {
        setRendererInstallations((current) => current);

        void loaded
          .then((installations) => {
            if (!cancelled) {
              setRendererInstallations(installations ?? null);
            }
          })
          .catch(() => {
            if (!cancelled) {
              setRendererInstallations(null);
            }
          });

        return () => {
          cancelled = true;
        };
      }

      setRendererInstallations(loaded ?? null);
    } catch {
      setRendererInstallations(null);
    }

    return () => {
      cancelled = true;
    };
  }, [rendererInstallationStore]);

  useEffect(() => {
    if (persistPositions === false || !resolvedGraphKey) {
      setPersistedState({ graphKey: resolvedGraphKey, positions: null });
      return;
    }

    let cancelled = false;

    try {
      const loaded = positionStore.load(resolvedGraphKey);

      if (isPromiseLike(loaded)) {
        setPersistedState((current) =>
          current.graphKey === resolvedGraphKey
            ? current
            : { graphKey: resolvedGraphKey, positions: null },
        );

        void loaded
          .then((positions) => {
            if (cancelled) {
              return;
            }

            setPersistedState({ graphKey: resolvedGraphKey, positions: positions ?? null });
          })
          .catch(() => {
            if (cancelled) {
              return;
            }

            setPersistedState({ graphKey: resolvedGraphKey, positions: null });
          });

        return () => {
          cancelled = true;
        };
      }

      setPersistedState({ graphKey: resolvedGraphKey, positions: loaded ?? null });
    } catch {
      setPersistedState({ graphKey: resolvedGraphKey, positions: null });
    }

    return () => {
      cancelled = true;
    };
  }, [persistPositions, positionStore, resolvedGraphKey]);

  const preparedModel = useMemo(() => {
    const modelWithPersistedPositions = applyPersistedPositions(model, persistedPositions);

    if (!autoLayout) {
      return modelWithPersistedPositions;
    }

    return applyGraphLayout(modelWithPersistedPositions, layoutRequest);
  }, [autoLayout, layoutRequest, model, persistedPositions]);

  const handleNodePositionChange = useCallback<NonNullable<GraphRendererProps["onNodePositionChange"]>>(
    (nodeId, position, meta) => {
      const normalizedMeta = meta ?? { source: "system" as const };
      onNodePositionChange?.(nodeId, position, normalizedMeta);

      if (normalizedMeta.source !== "user" || persistPositions === false || !resolvedGraphKey) {
        return;
      }

      void Promise.resolve(positionStore.load(resolvedGraphKey))
        .then((current) => {
          const nextNodes = [
            ...(current?.nodes.filter((node) => node.id !== nodeId) ?? []),
            { id: nodeId, x: position.x, y: position.y },
          ].sort((left, right) => left.id.localeCompare(right.id));
          const nextPositions = {
            graphKey: resolvedGraphKey,
            nodes: nextNodes,
            savedAt: new Date().toISOString(),
          };

          setPersistedState({ graphKey: resolvedGraphKey, positions: nextPositions });
          return positionStore.save(nextPositions);
        })
        .catch(() => undefined);
    },
    [onNodePositionChange, persistPositions, positionStore, resolvedGraphKey],
  );

  const resolvedRendererId = useMemo(
    () =>
      resolveGraphRendererId(preparedModel, enabledRenderers, {
        explicitRendererId: rendererId,
        preferredRendererId,
      }),
    [enabledRenderers, preferredRendererId, preparedModel, rendererId],
  );
  const renderer = resolveGraphRenderer(preparedModel, enabledRenderers, {
    explicitRendererId: rendererId,
    preferredRendererId,
  });
  const showRendererSwitcher =
    !rendererId
    && !!rendererPreferenceScope
    && supportedRendererManifests.length > 1
    && supportedRendererManifests.every((candidate) => candidate.id !== "mermaid");

  const handleRendererPreferenceChange = useCallback(
    (nextRendererId: string) => {
      if (!rendererPreferenceScope || !nextRendererId || nextRendererId === preferredRendererId) {
        return;
      }

      if (!supportedRendererManifests.some((candidate) => candidate.id === nextRendererId)) {
        return;
      }

      const nextPreference = nextRendererId;
      setPreferredRendererId(nextPreference);
      void Promise.resolve()
        .then(() => rendererPreferenceStore.set(rendererPreferenceScope, nextPreference))
        .catch(() => undefined);
    },
    [preferredRendererId, rendererPreferenceScope, rendererPreferenceStore, supportedRendererManifests],
  );

  if (!renderer) {
    return (
      <div className={className} data-testid="graph-view-unavailable">
        No compatible graph renderer is available for this model.
      </div>
    );
  }

  const RendererComponent = renderer.Component;
  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      {showRendererSwitcher ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">Renderer</span>
          <ToggleGroup
            type="single"
            value={resolvedRendererId ?? undefined}
            onValueChange={handleRendererPreferenceChange}
            variant="outline"
            size="sm"
            data-testid="graph-renderer-switcher"
            aria-label="Graph renderer"
          >
            {supportedRendererManifests.map((manifest) => (
              <ToggleGroupItem key={manifest.id} value={manifest.id} aria-label={manifest.label}>
                {manifest.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      <RendererComponent
        className="min-h-0 flex-1"
        model={preparedModel}
        onCreateEdge={onCreateEdge}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodePositionChange={handleNodePositionChange}
        onSelectionChange={onSelectionChange}
        readOnly={readOnly}
      />
    </div>
  );
}
