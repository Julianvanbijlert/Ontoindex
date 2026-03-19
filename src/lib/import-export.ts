// Import/Export Factory Pattern interfaces and mock implementations

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
  warnings: string[];
}

export interface ExportResult {
  success: boolean;
  data: string | Blob;
  filename: string;
  mimeType: string;
}

export interface Importer {
  format: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  parse(file: File): Promise<ImportResult>;
}

export interface Exporter {
  format: string;
  label: string;
  export(data: any[]): Promise<ExportResult>;
}

// CSV Importer
export class CSVImporter implements Importer {
  format = "csv";
  label = "CSV";
  extensions = [".csv"];
  mimeTypes = ["text/csv"];

  async parse(file: File): Promise<ImportResult> {
    const text = await file.text();
    const lines = text.split("\n").filter(l => l.trim());
    if (lines.length < 2) return { success: false, imported: 0, errors: ["File is empty or has no data rows"], warnings: [] };
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const titleIdx = headers.indexOf("title");
    if (titleIdx === -1) return { success: false, imported: 0, errors: ["CSV must have a 'title' column"], warnings: [] };
    const rows = lines.slice(1);
    const warnings: string[] = [];
    rows.forEach((row, i) => {
      const cols = row.split(",");
      if (!cols[titleIdx]?.trim()) warnings.push(`Row ${i + 2}: empty title, will be skipped`);
    });
    return { success: true, imported: rows.length - warnings.length, errors: [], warnings };
  }
}

// CSV Exporter
export class CSVExporter implements Exporter {
  format = "csv";
  label = "CSV";

  async export(data: any[]): Promise<ExportResult> {
    if (data.length === 0) return { success: true, data: "", filename: "export.csv", mimeType: "text/csv" };
    const keys = Object.keys(data[0]).filter(k => typeof data[0][k] !== "object");
    const header = keys.join(",");
    const rows = data.map(d => keys.map(k => `"${String(d[k] ?? "").replace(/"/g, '""')}"`).join(","));
    const csv = [header, ...rows].join("\n");
    return { success: true, data: csv, filename: "export.csv", mimeType: "text/csv" };
  }
}

// Excel (mock - would need xlsx library in production)
export class ExcelImporter implements Importer {
  format = "excel";
  label = "Excel";
  extensions = [".xlsx", ".xls"];
  mimeTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

  async parse(_file: File): Promise<ImportResult> {
    return { success: false, imported: 0, errors: ["Excel import requires server-side processing. Please use CSV format for now."], warnings: [] };
  }
}

export class ExcelExporter implements Exporter {
  format = "excel";
  label = "Excel";

  async export(data: any[]): Promise<ExportResult> {
    // Falls back to CSV for now
    const csvExporter = new CSVExporter();
    const result = await csvExporter.export(data);
    return { ...result, filename: "export.csv", mimeType: "text/csv" };
  }
}

// Turtle (RDF)
export class TurtleImporter implements Importer {
  format = "turtle";
  label = "Turtle (RDF)";
  extensions = [".ttl"];
  mimeTypes = ["text/turtle"];

  async parse(_file: File): Promise<ImportResult> {
    return { success: false, imported: 0, errors: ["Turtle import requires an RDF parser. This feature is coming soon."], warnings: [] };
  }
}

export class TurtleExporter implements Exporter {
  format = "turtle";
  label = "Turtle (RDF)";

  async export(data: any[]): Promise<ExportResult> {
    const prefixes = `@prefix onto: <http://ontologyhub.io/ontology/> .\n@prefix def: <http://ontologyhub.io/definition/> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n`;
    const triples = data.map(d =>
      `def:${d.id} rdfs:label "${d.title}" ;\n  rdfs:comment "${(d.description || "").replace(/"/g, '\\"')}" .`
    ).join("\n\n");
    return { success: true, data: prefixes + triples, filename: "export.ttl", mimeType: "text/turtle" };
  }
}

// Factory
export class ImportFactory {
  static create(format: string): Importer {
    switch (format) {
      case "csv": return new CSVImporter();
      case "excel": return new ExcelImporter();
      case "turtle": return new TurtleImporter();
      default: throw new Error(`Unknown import format: ${format}`);
    }
  }

  static getAll(): Importer[] {
    return [new CSVImporter(), new ExcelImporter(), new TurtleImporter()];
  }
}

export class ExportFactory {
  static create(format: string): Exporter {
    switch (format) {
      case "csv": return new CSVExporter();
      case "excel": return new ExcelExporter();
      case "turtle": return new TurtleExporter();
      default: throw new Error(`Unknown export format: ${format}`);
    }
  }

  static getAll(): Exporter[] {
    return [new CSVExporter(), new ExcelExporter(), new TurtleExporter()];
  }
}
