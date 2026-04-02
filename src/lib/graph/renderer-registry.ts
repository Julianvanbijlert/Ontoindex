import type { GraphRenderer } from "@/lib/graph/renderers";
import { CytoscapeRenderer } from "@/components/graph/renderers/CytoscapeRenderer";
import { MermaidRenderer } from "@/components/graph/renderers/MermaidRenderer";
import { ReactFlowRenderer } from "@/components/graph/renderers/ReactFlowRenderer";

export interface GraphRendererInstallation {
  rendererId: string;
  installed: boolean;
  enabled: boolean;
  updatedAt?: string;
}

export type GraphRendererInstallType = "builtin" | "plugin";

export interface GraphRendererManifest {
  id: string;
  label: string;
  description?: string;
  installType: GraphRendererInstallType;
  defaultInstalled?: boolean;
  defaultEnabled?: boolean;
  adapter: GraphRenderer;
}

function defaultInstalledState(manifest: GraphRendererManifest) {
  if (typeof manifest.defaultInstalled === "boolean") {
    return manifest.defaultInstalled;
  }

  return manifest.installType === "builtin";
}

function defaultEnabledState(manifest: GraphRendererManifest) {
  if (typeof manifest.defaultEnabled === "boolean") {
    return manifest.defaultEnabled;
  }

  return defaultInstalledState(manifest);
}

function normalizeRendererInstallations(
  manifests: GraphRendererManifest[],
  installations: GraphRendererInstallation[] | null | undefined,
) {
  const byId = new Map((installations ?? []).map((item) => [item.rendererId, item]));

  return manifests.map((manifest) => {
    const current = byId.get(manifest.id);
    const installed = current?.installed ?? defaultInstalledState(manifest);
    const enabled = installed && (current?.enabled ?? defaultEnabledState(manifest));

    return {
      rendererId: manifest.id,
      installed,
      enabled,
      updatedAt: current?.updatedAt,
    } satisfies GraphRendererInstallation;
  });
}

export const graphRendererManifests: GraphRendererManifest[] = [
  {
    id: "react-flow",
    label: "React Flow",
    description: "Editing-focused interactive renderer",
    installType: "builtin",
    defaultInstalled: true,
    defaultEnabled: true,
    adapter: {
      id: "react-flow",
      supports: (kind) => kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
      capabilities: {
        editable: true,
        minimap: true,
        edgeLabels: true,
      },
      Component: ReactFlowRenderer,
    },
  },
  {
    id: "cytoscape",
    label: "Cytoscape",
    description: "Exploration-focused renderer for dense interactive graphs",
    installType: "builtin",
    defaultInstalled: true,
    defaultEnabled: true,
    adapter: {
      id: "cytoscape",
      supports: (kind) => kind === "ontology" || kind === "knowledge-graph" || kind === "property-graph",
      capabilities: {
        editable: false,
        edgeLabels: true,
        clustering: true,
      },
      Component: CytoscapeRenderer,
    },
  },
  {
    id: "mermaid",
    label: "Mermaid",
    description: "Diagram renderer for UML and ER graph kinds",
    installType: "builtin",
    defaultInstalled: true,
    defaultEnabled: true,
    adapter: {
      id: "mermaid",
      supports: (kind) => kind === "uml-class" || kind === "er",
      capabilities: {
        editable: false,
        autoLayout: true,
        edgeLabels: true,
      },
      Component: MermaidRenderer,
    },
  },
];

export function getDefaultGraphRendererInstallations(manifests: GraphRendererManifest[] = graphRendererManifests) {
  return normalizeRendererInstallations(manifests, null);
}

export function resolveEnabledGraphRendererManifests(
  manifests: GraphRendererManifest[] = graphRendererManifests,
  installations?: GraphRendererInstallation[] | null,
) {
  const normalized = normalizeRendererInstallations(manifests, installations);
  const enabledIds = new Set(
    normalized
      .filter((item) => item.installed && item.enabled)
      .map((item) => item.rendererId),
  );

  return manifests.filter((manifest) => enabledIds.has(manifest.id));
}

export function resolveEnabledGraphRenderers(
  manifests: GraphRendererManifest[] = graphRendererManifests,
  installations?: GraphRendererInstallation[] | null,
) {
  return resolveEnabledGraphRendererManifests(manifests, installations).map((manifest) => manifest.adapter);
}

export const availableGraphRenderers: GraphRenderer[] = graphRendererManifests.map((manifest) => manifest.adapter);
