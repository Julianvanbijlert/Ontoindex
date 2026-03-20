import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, Code, Loader2, Table } from "lucide-react";
import { ExportFactory, fetchOntologyExportSnapshot } from "@/lib/import-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { canExportOntology } from "@/lib/authorization";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ontologyId: string;
  ontologyTitle: string;
  entityName?: string;
}

const iconByFormat: Record<string, React.ElementType> = {
  csv: Table,
  excel: FileText,
  turtle: Code,
  jsonld: Code,
  rdfxml: Code,
  ntriples: Code,
  owl: Code,
  skos: Code,
  xmi: FileText,
};

export function ExportDialog({ open, onOpenChange, ontologyId, ontologyTitle, entityName = "definitions" }: ExportDialogProps) {
  const { role } = useAuth();
  const formats = useMemo(() => ExportFactory.getAll(), []);
  const [selectedFormat, setSelectedFormat] = useState(formats[0]?.format || "csv");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!canExportOntology(role)) {
      toast.error("Your current role cannot export ontology data");
      return;
    }

    setExporting(true);

    try {
      const exporter = ExportFactory.create(selectedFormat);
      const snapshot = await fetchOntologyExportSnapshot(supabase, ontologyId);
      const result = await exporter.export(snapshot);
      const blob = typeof result.data === "string" ? new Blob([result.data], { type: result.mimeType }) : result.data;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${snapshot.definitions.length} ${entityName} as ${exporter.label}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }

    setExporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export {ontologyTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Export the latest saved ontology snapshot in a business or enterprise interchange format.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {formats.map((format) => {
              const Icon = iconByFormat[format.format] || Code;

              return (
                <Card
                  key={format.format}
                  className={cn(
                    "cursor-pointer border-border/50 transition-colors hover:border-border",
                    selectedFormat === format.format && "border-primary bg-primary/5",
                  )}
                  onClick={() => setSelectedFormat(format.format)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Icon className={cn("mt-0.5 h-5 w-5", selectedFormat === format.format ? "text-primary" : "text-muted-foreground")} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{format.label}</p>
                        <p className="text-xs text-muted-foreground">.{format.extension}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Button onClick={handleExport} className="w-full" disabled={exporting || !canExportOntology(role)}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export latest snapshot
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
