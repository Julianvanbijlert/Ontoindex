import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Table, Code, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { ImportFactory, type ImportResult } from "@/lib/import-export";
import { cn } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport?: (result: ImportResult) => void;
}

const formatCards = [
  { format: "csv", label: "CSV", description: "Comma-separated values", icon: Table },
  { format: "excel", label: "Excel", description: "XLSX spreadsheet", icon: FileText },
  { format: "turtle", label: "Turtle", description: "RDF/Turtle format", icon: Code },
];

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState("csv");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;
    setProcessing(true);
    try {
      const importer = ImportFactory.create(selectedFormat);
      const res = await importer.parse(file);
      setResult(res);
      if (res.success) onImport?.(res);
    } catch (err: any) {
      setResult({ success: false, imported: 0, errors: [err.message], warnings: [] });
    }
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
        <DialogHeader><DialogTitle>Import Definitions</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-3 gap-2">
            {formatCards.map(f => (
              <Card
                key={f.format}
                className={cn(
                  "cursor-pointer border-border/50 transition-colors hover:border-border",
                  selectedFormat === f.format && "border-primary bg-primary/5"
                )}
                onClick={() => { setSelectedFormat(f.format); setFile(null); setResult(null); }}
              >
                <CardContent className="p-3 text-center">
                  <f.icon className={cn("h-5 w-5 mx-auto mb-1", selectedFormat === f.format ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-xs font-medium text-foreground">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" className="hidden" accept={ImportFactory.create(selectedFormat).extensions.join(",")} onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); }} />
            <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm text-foreground font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Click to select a file or drag and drop</p>
            )}
          </div>

          {result && (
            <div className={cn("p-3 rounded-lg text-sm space-y-1", result.success ? "bg-success/10" : "bg-destructive/10")}>
              <div className="flex items-center gap-2">
                {result.success ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                <span className={result.success ? "text-success" : "text-destructive"}>
                  {result.success ? `${result.imported} items ready to import` : "Import failed"}
                </span>
              </div>
              {result.errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
              {result.warnings.map((w, i) => <p key={i} className="text-xs text-warning">{w}</p>)}
            </div>
          )}

          <Button onClick={handleImport} className="w-full" disabled={!file || processing}>
            {processing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
