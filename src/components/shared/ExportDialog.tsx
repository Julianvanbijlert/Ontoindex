import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, Table, Code, Loader2 } from "lucide-react";
import { ExportFactory } from "@/lib/import-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: any[];
  entityName?: string;
}

const formatCards = [
  { format: "csv", label: "CSV", description: "Comma-separated values", icon: Table },
  { format: "excel", label: "Excel", description: "XLSX spreadsheet", icon: FileText },
  { format: "turtle", label: "Turtle", description: "RDF/Turtle format", icon: Code },
];

export function ExportDialog({ open, onOpenChange, data, entityName = "definitions" }: ExportDialogProps) {
  const [selectedFormat, setSelectedFormat] = useState("csv");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const exporter = ExportFactory.create(selectedFormat);
      const result = await exporter.export(data);
      if (result.success) {
        const blob = typeof result.data === "string" ? new Blob([result.data], { type: result.mimeType }) : result.data;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${data.length} ${entityName}`);
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setExporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Export {entityName}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">{data.length} items will be exported</p>
          <div className="grid grid-cols-3 gap-2">
            {formatCards.map(f => (
              <Card
                key={f.format}
                className={cn(
                  "cursor-pointer border-border/50 transition-colors hover:border-border",
                  selectedFormat === f.format && "border-primary bg-primary/5"
                )}
                onClick={() => setSelectedFormat(f.format)}
              >
                <CardContent className="p-3 text-center">
                  <f.icon className={cn("h-5 w-5 mx-auto mb-1", selectedFormat === f.format ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-xs font-medium text-foreground">{f.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button onClick={handleExport} className="w-full" disabled={exporting || data.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export as {selectedFormat.toUpperCase()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
