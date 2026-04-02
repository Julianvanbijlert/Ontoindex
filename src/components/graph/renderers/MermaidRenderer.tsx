import { useEffect, useId, useMemo, useState } from "react";

import { graphModelToMermaid } from "@/lib/graph/mappers/graph-to-mermaid";
import type { GraphRendererProps } from "@/lib/graph/renderers";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to render Mermaid diagram.";
}

export function MermaidRenderer({
  model,
  className,
}: GraphRendererProps) {
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const diagram = useMemo(() => graphModelToMermaid(model), [model]);
  const chartId = useId().replace(/:/g, "_");

  useEffect(() => {
    let isCancelled = false;

    async function renderDiagram() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
        });
        const renderResult = await mermaid.render(`graph_${chartId}`, diagram);

        if (isCancelled) {
          return;
        }

        setSvg(renderResult.svg);
        setRenderError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSvg("");
        setRenderError(getErrorMessage(error));
      }
    }

    void renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [chartId, diagram]);

  return (
    <div className={className} data-testid="mermaid-graph-view">
      {renderError ? (
        <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Mermaid diagram could not be rendered.</p>
          <p className="mt-1">{renderError}</p>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs" data-testid="mermaid-source">
            {diagram}
          </pre>
        </div>
      ) : svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-md border border-border/60 bg-muted/20 text-sm text-muted-foreground">
          Rendering diagram...
        </div>
      )}
    </div>
  );
}
