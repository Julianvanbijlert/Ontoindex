import type { GraphEdge, GraphGroup, GraphModel, GraphNode } from "@/lib/graph/model";
import type { GraphLayoutEngine, GraphLayoutOptions } from "@/lib/graph/layouts/types";

const DEFAULT_NODE_WIDTH = 180;
const DEFAULT_NODE_HEIGHT = 56;
const DEFAULT_NODE_SPACING = 72;
const DEFAULT_RANK_SPACING = 120;

const CHILD_TO_PARENT_RELATIONS = new Set([
  "child_of",
  "extends",
  "inherits_from",
  "inheritance",
  "is_a",
  "isa",
  "narrower",
  "part_of",
  "subclass_of",
  "subclassof",
]);

const PARENT_TO_CHILD_RELATIONS = new Set([
  "broader",
  "contains",
  "has_part",
  "parent_of",
]);

type NodePosition = { x: number; y: number };

function normalizeToken(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getNodeSize(node: GraphNode) {
  return {
    width: node.visual?.width ?? DEFAULT_NODE_WIDTH,
    height: node.visual?.height ?? DEFAULT_NODE_HEIGHT,
  };
}

function withNodePosition(node: GraphNode, position: NodePosition) {
  return {
    ...node,
    visual: {
      ...node.visual,
      x: position.x,
      y: position.y,
    },
  };
}

function getEdgeSemanticKey(edge: GraphEdge) {
  const propertyType = edge.properties && typeof edge.properties.type === "string" ? edge.properties.type : null;
  return normalizeToken(propertyType || edge.kind);
}

function getHierarchyDirection(edge: GraphEdge) {
  const semanticKey = getEdgeSemanticKey(edge);

  if (CHILD_TO_PARENT_RELATIONS.has(semanticKey)) {
    return {
      parentId: edge.target,
      childId: edge.source,
    };
  }

  if (PARENT_TO_CHILD_RELATIONS.has(semanticKey)) {
    return {
      parentId: edge.source,
      childId: edge.target,
    };
  }

  return null;
}

function buildNeighbors(nodeIds: string[], edges: GraphEdge[]) {
  const neighbors = new Map<string, Set<string>>();

  nodeIds.forEach((nodeId) => {
    neighbors.set(nodeId, new Set());
  });

  edges.forEach((edge) => {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  });

  return neighbors;
}

function buildDegreeByNodeId(nodeIds: string[], edges: GraphEdge[]) {
  const degreeByNodeId = new Map<string, number>();

  nodeIds.forEach((nodeId) => {
    degreeByNodeId.set(nodeId, 0);
  });

  edges.forEach((edge) => {
    degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1);
    degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1);
  });

  return degreeByNodeId;
}

function readStringProperty(node: GraphNode, key: string) {
  if (!node.properties) {
    return null;
  }

  const value = (node.properties as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getIriNamespace(iri: string | undefined) {
  if (!iri?.trim()) {
    return null;
  }

  const trimmedIri = iri.trim();
  const lastHashIndex = trimmedIri.lastIndexOf("#");
  const lastSlashIndex = trimmedIri.lastIndexOf("/");
  const delimiterIndex = Math.max(lastHashIndex, lastSlashIndex);

  if (delimiterIndex <= 0) {
    return null;
  }

  return trimmedIri.slice(0, delimiterIndex);
}

function buildClusterKeyByNodeId(model: GraphModel) {
  const groupLabelsByNodeId = new Map<string, string[]>();

  (model.groups ?? []).forEach((group: GraphGroup) => {
    group.nodeIds.forEach((nodeId) => {
      const current = groupLabelsByNodeId.get(nodeId) ?? [];
      groupLabelsByNodeId.set(nodeId, [...current, group.label]);
    });
  });

  return new Map<string, string>(
    model.nodes.map((node) => {
      const groupLabels = [...(groupLabelsByNodeId.get(node.id) ?? [])].sort((left, right) => left.localeCompare(right));
      const fallback =
        readStringProperty(node, "namespace")
        ?? readStringProperty(node, "section")
        ?? readStringProperty(node, "group");
      const iriNamespace = getIriNamespace(node.iri);
      const clusterKey = groupLabels[0] ?? fallback ?? iriNamespace ?? "";

      return [node.id, normalizeToken(clusterKey)];
    }),
  );
}

function buildLayerClusters(layerNodeIds: string[], clusterKeyByNodeId: Map<string, string>) {
  const clusters: string[][] = [];
  let currentClusterKey: string | null = null;

  layerNodeIds.forEach((nodeId) => {
    const clusterKey = clusterKeyByNodeId.get(nodeId) ?? "";

    if (clusters.length === 0 || clusterKey !== currentClusterKey) {
      clusters.push([nodeId]);
      currentClusterKey = clusterKey;
      return;
    }

    clusters[clusters.length - 1].push(nodeId);
  });

  return clusters;
}

function calculateClusteredLayerWidth(
  layerNodeIds: string[],
  nodeById: Map<string, GraphNode>,
  nodeSpacing: number,
  clusterKeyByNodeId: Map<string, string>,
  clusterGap: number,
) {
  const clusters = buildLayerClusters(layerNodeIds, clusterKeyByNodeId);

  return clusters.reduce((width, clusterNodeIds, index) => (
    width
    + calculateLayerWidth(clusterNodeIds, nodeById, nodeSpacing)
    + (index === 0 ? 0 : clusterGap)
  ), 0);
}

function compareNodeIds(nodeById: Map<string, GraphNode>, leftId: string, rightId: string) {
  const leftNode = nodeById.get(leftId);
  const rightNode = nodeById.get(rightId);

  const leftLabel = leftNode?.label ?? leftId;
  const rightLabel = rightNode?.label ?? rightId;
  return leftLabel.localeCompare(rightLabel) || leftId.localeCompare(rightId);
}

function buildConnectedComponents(nodeIds: string[], neighbors: Map<string, Set<string>>, nodeById: Map<string, GraphNode>) {
  const sortedNodeIds = [...nodeIds].sort((left, right) => compareNodeIds(nodeById, left, right));
  const visited = new Set<string>();
  const components: string[][] = [];

  sortedNodeIds.forEach((startNodeId) => {
    if (visited.has(startNodeId)) {
      return;
    }

    const component: string[] = [];
    const queue = [startNodeId];
    visited.add(startNodeId);

    while (queue.length > 0) {
      const currentNodeId = queue.shift();

      if (!currentNodeId) {
        continue;
      }

      component.push(currentNodeId);

      const nextNodeIds = [...(neighbors.get(currentNodeId) ?? [])]
        .sort((left, right) => compareNodeIds(nodeById, left, right));

      nextNodeIds.forEach((nextNodeId) => {
        if (visited.has(nextNodeId)) {
          return;
        }

        visited.add(nextNodeId);
        queue.push(nextNodeId);
      });
    }

    components.push(component);
  });

  return components;
}

function buildHierarchy(componentNodeIds: string[], edges: GraphEdge[]) {
  const componentNodeIdSet = new Set(componentNodeIds);
  const childrenByParentId = new Map<string, Set<string>>();
  const parentIdsByChildId = new Map<string, Set<string>>();
  const hierarchyNodeIds = new Set<string>();
  const seenPairs = new Set<string>();

  edges.forEach((edge) => {
    const directedHierarchy = getHierarchyDirection(edge);

    if (!directedHierarchy) {
      return;
    }

    const { parentId, childId } = directedHierarchy;

    if (!componentNodeIdSet.has(parentId) || !componentNodeIdSet.has(childId) || parentId === childId) {
      return;
    }

    const pairKey = `${parentId}->${childId}`;

    if (seenPairs.has(pairKey)) {
      return;
    }

    seenPairs.add(pairKey);
    hierarchyNodeIds.add(parentId);
    hierarchyNodeIds.add(childId);

    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, new Set());
    }

    if (!parentIdsByChildId.has(childId)) {
      parentIdsByChildId.set(childId, new Set());
    }

    childrenByParentId.get(parentId)?.add(childId);
    parentIdsByChildId.get(childId)?.add(parentId);
  });

  return {
    childrenByParentId,
    parentIdsByChildId,
    hierarchyNodeIds,
  };
}

function assignDepthsFromHierarchy(
  componentNodeIds: string[],
  nodeById: Map<string, GraphNode>,
  degreeByNodeId: Map<string, number>,
  hierarchy: ReturnType<typeof buildHierarchy>,
) {
  const { childrenByParentId, hierarchyNodeIds, parentIdsByChildId } = hierarchy;
  const depthByNodeId = new Map<string, number>();

  if (hierarchyNodeIds.size === 0) {
    return depthByNodeId;
  }

  const compareHierarchyCandidates = (leftId: string, rightId: string) => {
    const leftInDegree = parentIdsByChildId.get(leftId)?.size ?? 0;
    const rightInDegree = parentIdsByChildId.get(rightId)?.size ?? 0;
    const leftOutDegree = childrenByParentId.get(leftId)?.size ?? 0;
    const rightOutDegree = childrenByParentId.get(rightId)?.size ?? 0;

    return (
      leftInDegree - rightInDegree
      || rightOutDegree - leftOutDegree
      || (degreeByNodeId.get(rightId) ?? 0) - (degreeByNodeId.get(leftId) ?? 0)
      || compareNodeIds(nodeById, leftId, rightId)
    );
  };

  const visit = (nodeId: string, nextDepth: number, path: Set<string>) => {
    if (path.has(nodeId)) {
      return;
    }

    const existingDepth = depthByNodeId.get(nodeId);

    if (typeof existingDepth === "number" && existingDepth >= nextDepth) {
      return;
    }

    depthByNodeId.set(nodeId, nextDepth);

    const nextPath = new Set(path);
    nextPath.add(nodeId);

    const childIds = [...(childrenByParentId.get(nodeId) ?? [])]
      .sort(compareHierarchyCandidates);

    childIds.forEach((childId) => {
      visit(childId, nextDepth + 1, nextPath);
    });
  };

  let rootIds = [...hierarchyNodeIds]
    .filter((nodeId) => (parentIdsByChildId.get(nodeId)?.size ?? 0) === 0)
    .sort(compareHierarchyCandidates);

  if (rootIds.length === 0) {
    rootIds = [...hierarchyNodeIds].sort(compareHierarchyCandidates).slice(0, 1);
  }

  rootIds.forEach((rootId) => {
    visit(rootId, 0, new Set());
  });

  const unresolvedHierarchyNodeIds = componentNodeIds
    .filter((nodeId) => hierarchyNodeIds.has(nodeId) && !depthByNodeId.has(nodeId))
    .sort(compareHierarchyCandidates);

  unresolvedHierarchyNodeIds.forEach((nodeId) => {
    const nextDepth = Math.max(...depthByNodeId.values(), -1) + 1;
    visit(nodeId, nextDepth, new Set());
  });

  return depthByNodeId;
}

function assignDepthsFromGenericStructure(
  componentNodeIds: string[],
  neighbors: Map<string, Set<string>>,
  nodeById: Map<string, GraphNode>,
  degreeByNodeId: Map<string, number>,
) {
  const sortedNodeIds = [...componentNodeIds].sort((left, right) => (
    (degreeByNodeId.get(right) ?? 0) - (degreeByNodeId.get(left) ?? 0)
    || compareNodeIds(nodeById, left, right)
  ));
  const rootNodeId = sortedNodeIds[0];
  const depthByNodeId = new Map<string, number>();

  if (!rootNodeId) {
    return depthByNodeId;
  }

  const queue = [rootNodeId];
  depthByNodeId.set(rootNodeId, 0);

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId) {
      continue;
    }

    const nextDepth = (depthByNodeId.get(currentNodeId) ?? 0) + 1;
    const nextNodeIds = [...(neighbors.get(currentNodeId) ?? [])]
      .sort((left, right) => compareNodeIds(nodeById, left, right));

    nextNodeIds.forEach((nextNodeId) => {
      if (depthByNodeId.has(nextNodeId)) {
        return;
      }

      depthByNodeId.set(nextNodeId, nextDepth);
      queue.push(nextNodeId);
    });
  }

  return depthByNodeId;
}

function assignDepthsForComponent(
  componentNodeIds: string[],
  neighbors: Map<string, Set<string>>,
  nodeById: Map<string, GraphNode>,
  degreeByNodeId: Map<string, number>,
  hierarchy: ReturnType<typeof buildHierarchy>,
) {
  const hierarchyDepths = assignDepthsFromHierarchy(componentNodeIds, nodeById, degreeByNodeId, hierarchy);

  if (hierarchyDepths.size === 0) {
    return assignDepthsFromGenericStructure(componentNodeIds, neighbors, nodeById, degreeByNodeId);
  }

  const depthByNodeId = new Map(hierarchyDepths);
  const remainingNodeIds = componentNodeIds.filter((nodeId) => !depthByNodeId.has(nodeId));

  while (remainingNodeIds.length > 0) {
    let assignedInPass = false;

    for (let index = remainingNodeIds.length - 1; index >= 0; index -= 1) {
      const nodeId = remainingNodeIds[index];
      const neighborDepths = [...(neighbors.get(nodeId) ?? [])]
        .map((neighborId) => depthByNodeId.get(neighborId))
        .filter((depth): depth is number => typeof depth === "number");

      if (neighborDepths.length === 0) {
        continue;
      }

      const nodeDegree = degreeByNodeId.get(nodeId) ?? 0;
      const nextDepth = nodeDegree <= 1
        ? Math.max(...neighborDepths) + 1
        : Math.round(neighborDepths.reduce((sum, value) => sum + value, 0) / neighborDepths.length);

      depthByNodeId.set(nodeId, nextDepth);
      remainingNodeIds.splice(index, 1);
      assignedInPass = true;
    }

    if (assignedInPass) {
      continue;
    }

    const fallbackDepths = assignDepthsFromGenericStructure(remainingNodeIds, neighbors, nodeById, degreeByNodeId);
    const depthOffset = Math.max(...depthByNodeId.values(), -1) + 1;

    [...fallbackDepths.entries()].forEach(([nodeId, depth]) => {
      depthByNodeId.set(nodeId, depthOffset + depth);
    });

    break;
  }

  return depthByNodeId;
}

function calculateLayerWidth(nodeIds: string[], nodeById: Map<string, GraphNode>, nodeSpacing: number) {
  return nodeIds.reduce((width, nodeId, index) => {
    const node = nodeById.get(nodeId);
    const nodeWidth = node ? getNodeSize(node).width : DEFAULT_NODE_WIDTH;
    return width + nodeWidth + (index === 0 ? 0 : nodeSpacing);
  }, 0);
}

function transformPositions(
  positionsByNodeId: Map<string, NodePosition>,
  nodeById: Map<string, GraphNode>,
  direction: GraphLayoutOptions["direction"],
) {
  if (!direction || direction === "TB") {
    return positionsByNodeId;
  }

  let maxX = 0;
  let maxY = 0;

  positionsByNodeId.forEach((position, nodeId) => {
    const node = nodeById.get(nodeId);
    const { width, height } = node ? getNodeSize(node) : { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
    maxX = Math.max(maxX, position.x + width);
    maxY = Math.max(maxY, position.y + height);
  });

  return new Map(
    [...positionsByNodeId.entries()].map(([nodeId, position]) => {
      if (direction === "BT") {
        return [nodeId, { x: position.x, y: maxY - position.y }];
      }

      if (direction === "LR") {
        return [nodeId, { x: position.y, y: position.x }];
      }

      return [nodeId, { x: maxY - position.y, y: position.x }];
    }),
  );
}

export const ontologyLayoutEngine: GraphLayoutEngine = {
  id: "ontology",
  supports: (kind) => kind === "ontology",
  layout: (model, options) => {
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
    const nodeIds = model.nodes.map((node) => node.id);
    const neighbors = buildNeighbors(nodeIds, model.edges);
    const degreeByNodeId = buildDegreeByNodeId(nodeIds, model.edges);
    const clusterKeyByNodeId = buildClusterKeyByNodeId(model);
    const nodeSpacing = options?.nodeSpacing ?? DEFAULT_NODE_SPACING;
    const rankSpacing = options?.rankSpacing ?? DEFAULT_RANK_SPACING;
    const clusterGap = nodeSpacing * 1.5;
    const componentGap = nodeSpacing * 2;
    const components = buildConnectedComponents(nodeIds, neighbors, nodeById);
    const positionsByNodeId = new Map<string, NodePosition>();
    let currentComponentOffset = 0;

    components.forEach((componentNodeIds) => {
      const hierarchy = buildHierarchy(componentNodeIds, model.edges);
      const depthByNodeId = assignDepthsForComponent(
        componentNodeIds,
        neighbors,
        nodeById,
        degreeByNodeId,
        hierarchy,
      );
      const hierarchyNodeIds = hierarchy.hierarchyNodeIds;
      const layers = new Map<number, string[]>();

      componentNodeIds.forEach((nodeId) => {
        const depth = depthByNodeId.get(nodeId) ?? 0;
        const currentLayer = layers.get(depth) ?? [];
        layers.set(depth, [...currentLayer, nodeId]);
      });

      const sortedLayers = [...layers.entries()]
        .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
        .map(([depth, layerNodeIds]) => {
          const sortedNodeIds = [...layerNodeIds].sort((leftId, rightId) => {
            const leftHierarchyPriority = hierarchyNodeIds.has(leftId) ? 0 : 1;
            const rightHierarchyPriority = hierarchyNodeIds.has(rightId) ? 0 : 1;
            const leftChildren = hierarchy.childrenByParentId.get(leftId)?.size ?? 0;
            const rightChildren = hierarchy.childrenByParentId.get(rightId)?.size ?? 0;

            return (
              leftHierarchyPriority - rightHierarchyPriority
              || clusterKeyByNodeId.get(leftId)?.localeCompare(clusterKeyByNodeId.get(rightId) ?? "") || 0
              || rightChildren - leftChildren
              || (degreeByNodeId.get(rightId) ?? 0) - (degreeByNodeId.get(leftId) ?? 0)
              || compareNodeIds(nodeById, leftId, rightId)
            );
          });

          return [depth, sortedNodeIds] as const;
        });

      const componentWidth = Math.max(
        ...sortedLayers.map(([, layerNodeIds]) => calculateClusteredLayerWidth(
          layerNodeIds,
          nodeById,
          nodeSpacing,
          clusterKeyByNodeId,
          clusterGap,
        )),
        DEFAULT_NODE_WIDTH,
      );

      sortedLayers.forEach(([depth, layerNodeIds]) => {
        const clusters = buildLayerClusters(layerNodeIds, clusterKeyByNodeId);
        const layerWidth = calculateClusteredLayerWidth(
          layerNodeIds,
          nodeById,
          nodeSpacing,
          clusterKeyByNodeId,
          clusterGap,
        );
        let currentX = currentComponentOffset + (componentWidth - layerWidth) / 2;
        const currentY = depth * (DEFAULT_NODE_HEIGHT + rankSpacing);

        clusters.forEach((clusterNodeIds, clusterIndex) => {
          if (clusterIndex > 0) {
            currentX += clusterGap;
          }

          clusterNodeIds.forEach((nodeId) => {
            const node = nodeById.get(nodeId);
            const { width } = node ? getNodeSize(node) : { width: DEFAULT_NODE_WIDTH };
            positionsByNodeId.set(nodeId, { x: currentX, y: currentY });
            currentX += width + nodeSpacing;
          });
        });
      });

      currentComponentOffset += componentWidth + componentGap;
    });

    const transformedPositions = transformPositions(positionsByNodeId, nodeById, options?.direction);

    return {
      ...model,
      nodes: model.nodes.map((node) => {
        const position = transformedPositions.get(node.id);

        if (!position) {
          return node;
        }

        return withNodePosition(node, position);
      }),
    };
  },
};
