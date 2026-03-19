import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Table, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  importDefinitionsToOntology,
  REQUIRED_IMPORT_REQUIREMENTS,
  SUPPORTED_IMPORT_COLUMNS,
  type ImportResult,
} from "@/lib/import-service";
import { supabase } from "@/integrations/supabase/client";
import { ImportFactory } from "@/lib/import-factory";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ontologyId: string;
  ontologyTitle: string;
  onImport?: (result: ImportResult) => void;
}

const iconByFormat: Record<string, React.ElementType> = {
  csv: Table,
  excel: FileText,
  turtle: FileText,
  jsonld: FileText,
  rdfxml: FileText,
  ntriples: FileText,
  owl: FileText,
  skos: FileText,
  xmi: FileText,
};

export function ImportDialog({ open, onOpenChange, ontologyId, ontologyTitle, onImport }: ImportDialogProps) {
  const formats = ImportFactory.getAll();
  const accept = formats.flatMap((format) => format.extensions).join(",");
  const [selectedFormat, setSelectedFormat] = useState(formats[0]?.format || "csv");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = async (nextFile: File) => {
    setFile(nextFile);
    setProcessing(true);
    setSelectedFormat(ImportFactory.createFromFile(nextFile).format);

    const res = await importDefinitionsToOntology(supabase, ontologyId, nextFile);
    setResult(res);
    if (res.success) onImport?.(res);
    setProcessing(false);
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setSelectedFormat("csv");
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Definitions into {ontologyTitle}</DialogTitle>
          <DialogDescription>
            Upload business or enterprise interchange files to create definitions and relationships inside this ontology.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {formats.map(f => {
              const Icon = iconByFormat[f.format] || FileText;

              return (
              <Card
                key={f.format}
                className={cn(
                  "cursor-pointer border-border/50 transition-colors hover:border-border",
                  selectedFormat === f.format && "border-primary bg-primary/5"
                )}
                onClick={() => { setSelectedFormat(f.format); setFile(null); setResult(null); }}
              >
                <CardContent className="p-3 text-center">
                  <Icon className={cn("h-5 w-5 mx-auto mb-1", selectedFormat === f.format ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-xs font-medium text-foreground">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground">{f.extensions.join(", ")}</p>
                </CardContent>
              </Card>
            )})}
          </div>

          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                return;
              }
              setIsDragActive(false);
            }}
            onDrop={async (event) => {
              event.preventDefault();
              setIsDragActive(false);
              const droppedFile = event.dataTransfer.files?.[0];
              if (!droppedFile) {
                return;
              }
              setResult(null);
              await processFile(droppedFile);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept={accept}
              onChange={async (event) => {
                const nextFile = event.target.files?.[0];
                setResult(null);
                if (nextFile) {
                  await processFile(nextFile);
                }
              }}
            />
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm text-foreground font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Drag and drop a supported ontology file here, or click to upload</p>
            )}
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
            <div>
              Required columns:
              {REQUIRED_IMPORT_REQUIREMENTS.map((column) => (
                <Badge key={column} variant="secondary" className="ml-1 text-[10px]">{column}</Badge>
              ))}
            </div>
            <div>
              Supported columns:
              {SUPPORTED_IMPORT_COLUMNS.map((column) => (
                <Badge key={column} variant="outline" className="ml-1 text-[10px]">{column}</Badge>
              ))}
            </div>
          </div>

          {result && (
            <div className={cn("p-3 rounded-lg text-sm space-y-1", result.success ? "bg-success/10" : "bg-destructive/10")}>
              <div className="flex items-center gap-2">
                {result.success ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                <span className={result.success ? "text-success" : "text-destructive"}>
                  {result.success ? `${result.imported} items imported successfully` : "Import failed"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Imported: {result.imported}</Badge>
                <Badge variant="outline">Warnings: {result.warningCount ?? result.warnings.length}</Badge>
                <Badge variant="outline">Errors: {result.errorCount ?? result.errors.length}</Badge>
              </div>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
              {result.warnings.map((w, i) => <p key={i} className="text-xs text-warning">{w}</p>)}
            </div>
          )}

          <Button onClick={() => inputRef.current?.click()} className="w-full" disabled={processing}>
            {processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Choose file to import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
