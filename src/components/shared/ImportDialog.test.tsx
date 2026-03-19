import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ImportDialog } from "@/components/shared/ImportDialog";

const importDefinitionsToOntology = vi.fn();

vi.mock("@/lib/import-service", () => ({
  importDefinitionsToOntology: (...args: unknown[]) => importDefinitionsToOntology(...args),
  REQUIRED_IMPORT_REQUIREMENTS: ["title", "description or context"],
  SUPPORTED_IMPORT_COLUMNS: ["title", "description", "context"],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

describe("ImportDialog", () => {
  it("processes a dropped file immediately", async () => {
    importDefinitionsToOntology.mockResolvedValue({
      success: true,
      imported: 1,
      errors: [],
      warnings: [],
    });
    const onImport = vi.fn();
    const file = new File(["title,description\nDefinition,Description"], "definitions.csv", { type: "text/csv" });

    render(
      <ImportDialog
        open
        onOpenChange={vi.fn()}
        ontologyId="onto-1"
        ontologyTitle="Security Ontology"
        onImport={onImport}
      />,
    );

    const dropzone = screen.getByText(/drag and drop a csv or excel file here/i).closest("div")!;

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => expect(importDefinitionsToOntology).toHaveBeenCalledTimes(1));
    expect(importDefinitionsToOntology.mock.calls[0][1]).toBe("onto-1");
    expect(importDefinitionsToOntology.mock.calls[0][2]).toBe(file);
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ success: true, imported: 1 }));
  });
});

