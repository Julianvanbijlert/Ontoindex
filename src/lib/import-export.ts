export interface ExportResult {
  success: boolean;
  data: string | Blob;
  filename: string;
  mimeType: string;
}

export interface Exporter {
  format: string;
  label: string;
  export(data: any[]): Promise<ExportResult>;
}

export class CSVExporter implements Exporter {
  format = "csv";
  label = "CSV";

  async export(data: any[]): Promise<ExportResult> {
    if (data.length === 0) {
      return {
        success: true,
        data: "",
        filename: "export.csv",
        mimeType: "text/csv",
      };
    }

    const keys = Object.keys(data[0]).filter((key) => typeof data[0][key] !== "object");
    const header = keys.join(",");
    const rows = data.map((item) =>
      keys.map((key) => `"${String(item[key] ?? "").replace(/"/g, '""')}"`).join(","),
    );
    const csv = [header, ...rows].join("\n");

    return {
      success: true,
      data: csv,
      filename: "export.csv",
      mimeType: "text/csv",
    };
  }
}

export class ExcelExporter implements Exporter {
  format = "excel";
  label = "Excel";

  async export(data: any[]): Promise<ExportResult> {
    const csvExporter = new CSVExporter();
    return csvExporter.export(data);
  }
}

export class TurtleExporter implements Exporter {
  format = "turtle";
  label = "Turtle (RDF)";

  async export(data: any[]): Promise<ExportResult> {
    const prefixes = `@prefix onto: <http://ontologyhub.io/ontology/> .\n@prefix def: <http://ontologyhub.io/definition/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n`;
    const triples = data
      .map(
        (item) =>
          `def:${item.id} rdfs:label "${item.title}" ;\n  rdfs:comment "${(item.description || "").replace(/"/g, '\\"')}" .`,
      )
      .join("\n\n");

    return {
      success: true,
      data: prefixes + triples,
      filename: "export.ttl",
      mimeType: "text/turtle",
    };
  }
}

export class ExportFactory {
  static create(format: string): Exporter {
    switch (format) {
      case "csv":
        return new CSVExporter();
      case "excel":
        return new ExcelExporter();
      case "turtle":
        return new TurtleExporter();
      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  static getAll(): Exporter[] {
    return [new CSVExporter(), new ExcelExporter(), new TurtleExporter()];
  }
}
