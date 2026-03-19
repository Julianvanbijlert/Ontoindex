import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, AlertCircle, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { importDefinitionsToOntology, type ImportResult } from "@/lib/import-service";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

export default function Imports() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(prev => (prev < 90 ? prev + 10 : prev));
    }, 150);

    try {
      const res = await importDefinitionsToOntology(supabase, "global", file);
      clearInterval(interval);
      setProgress(100);
      setResult(res);
      setImporting(false);
      if (res.success) toast.success(`Successfully imported ${res.imported} definitions.`);
    } catch (err: any) {
      clearInterval(interval);
      setImporting(false);
      toast.error(err.message || "Import failed");
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-20 px-4 space-y-10 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight uppercase">Bulk Import</h1>
      </div>

      <div className="space-y-6">
        <label 
          htmlFor="file-upload"
          className={cn(
            "relative group flex flex-col items-center justify-center border-2 border-dashed rounded-3xl p-16 transition-all cursor-pointer",
            file ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50 hover:bg-zinc-50"
          )}
        >
          <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.xls,.ttl,.rdf,.owl" />
          <div className="bg-white p-4 rounded-2xl shadow-xl mb-4 group-hover:scale-110 transition-transform">
            {file ? <Database className="h-8 w-8 text-primary" /> : <Upload className="h-8 w-8 text-zinc-400" />}
          </div>
          <p className="text-xl font-bold">{file ? file.name : "Upload your files (turtle, csv, rdf)"}</p>
          <p className="text-sm text-muted-foreground">{file ? `${(file.size / 1024).toFixed(1)} KB` : "Drag and drop or click to browse"}</p>
        </label>

        <Button 
          size="lg" 
          className="w-full h-16 text-xl rounded-2xl font-bold shadow-lg" 
          disabled={!file || importing}
          onClick={handleImport}
        >
          {importing ? "Importing Data..." : "Run Import"}
        </Button>
      </div>

      {importing && (
        <div className="space-y-3">
          <Progress value={progress} className="h-3 rounded-full" />
          <p className="text-sm font-medium animate-pulse">Extracting and Normalising...</p>
        </div>
      )}

      {result && (
        <Card className={cn(
          "border-none shadow-2xl rounded-3xl overflow-hidden",
          result.success ? "bg-green-50" : "bg-red-50"
        )}>
          <CardContent className="p-8 space-y-6">
            <div className="flex flex-col items-center gap-2">
              {result.success ? (
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              ) : (
                <AlertCircle className="h-12 w-12 text-red-600" />
              )}
              <h2 className="text-2xl font-black">{result.success ? "Finished" : "Error"}</h2>
              <p className="text-muted-foreground font-medium">
                {result.success ? `We extracted ${result.imported} definitions.` : result.errors[0]}
              </p>
            </div>

            <div className="flex gap-4">
              <Button className="flex-1 rounded-xl h-12" onClick={() => window.location.href = "/definitions"}>
                View Results
              </Button>
              <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={() => { setFile(null); setResult(null); }}>
                Try Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
