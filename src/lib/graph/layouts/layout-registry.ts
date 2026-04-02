import type { GraphLayoutEngine } from "@/lib/graph/layouts/types";
import { dagreLayoutEngine } from "@/lib/graph/layouts/DagreLayoutEngine";
import { ontologyLayoutEngine } from "@/lib/graph/layouts/OntologyLayoutEngine";

export const availableGraphLayoutEngines: GraphLayoutEngine[] = [ontologyLayoutEngine, dagreLayoutEngine];
