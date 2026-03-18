'use client'

import { useState } from 'react'
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Database,
  RefreshCw,
  Plus,
  Clock,
  ChevronRight,
  File,
  Check,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { importSources, ontologies } from '@/lib/mock-data'

const sourceIcons = {
  sharepoint: Database,
  notion: FileText,
  csv: FileSpreadsheet,
  word: FileText,
  api: Database,
}

export default function ImportsPage() {
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importStep, setImportStep] = useState(1)

  const resetImport = () => {
    setImportStep(1)
    setImportDialogOpen(false)
  }

  return (
    <AppShell
      title="Imports"
      actions={
        <Dialog open={importDialogOpen} onOpenChange={(open) => {
          setImportDialogOpen(open)
          if (!open) setImportStep(1)
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Import
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            {importStep === 1 && (
              <>
                <DialogHeader>
                  <DialogTitle>Import Data</DialogTitle>
                  <DialogDescription>
                    Upload a file to import definitions into OntoIndex.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50">
                    <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
                    <p className="mb-2 text-sm font-medium">Drop files here or click to browse</p>
                    <p className="text-xs text-muted-foreground">
                      Supports CSV, JSON, Excel, and Word documents
                    </p>
                    <Input type="file" className="mt-4 w-auto" accept=".csv,.json,.xlsx,.docx" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setImportStep(2)}>Continue</Button>
                </DialogFooter>
              </>
            )}
            {importStep === 2 && (
              <>
                <DialogHeader>
                  <DialogTitle>Configure Import</DialogTitle>
                  <DialogDescription>
                    Map your data fields to OntoIndex concepts.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Target Ontology</label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select ontology" />
                      </SelectTrigger>
                      <SelectContent>
                        {ontologies.map((ont) => (
                          <SelectItem key={ont.id} value={ont.id}>
                            {ont.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="mb-3 text-sm font-medium">Field Mapping</p>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="w-24 text-sm text-muted-foreground">Column A</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <Select defaultValue="term">
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="term">Term</SelectItem>
                            <SelectItem value="definition">Definition</SelectItem>
                            <SelectItem value="domain">Domain</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-24 text-sm text-muted-foreground">Column B</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <Select defaultValue="definition">
                          <SelectTrigger className="flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="term">Term</SelectItem>
                            <SelectItem value="definition">Definition</SelectItem>
                            <SelectItem value="domain">Domain</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-secondary/50 p-4">
                    <div className="flex items-center gap-2 text-sm">
                      <File className="h-4 w-4" />
                      <span className="font-medium">glossary_export.csv</span>
                      <span className="text-muted-foreground">· 45 rows detected</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setImportStep(1)}>
                    Back
                  </Button>
                  <Button onClick={() => setImportStep(3)}>Import</Button>
                </DialogFooter>
              </>
            )}
            {importStep === 3 && (
              <>
                <DialogHeader>
                  <DialogTitle>Import Complete</DialogTitle>
                  <DialogDescription>
                    Your data has been imported successfully.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center py-8">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-approved/20">
                    <Check className="h-8 w-8 text-status-approved" />
                  </div>
                  <p className="text-lg font-medium">45 concepts imported</p>
                  <p className="text-sm text-muted-foreground">
                    All items have been added as drafts
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={resetImport}>Done</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{importSources.length}</p>
              <p className="text-sm text-muted-foreground">Connected Sources</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {importSources.reduce((sum, s) => sum + s.itemsImported, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Items Imported</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-status-draft">
                {importSources.reduce((sum, s) => sum + s.draftConcepts, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Pending Review</p>
            </CardContent>
          </Card>
        </div>

        {/* Import Sources */}
        <div>
          <h2 className="mb-4 text-lg font-semibold">Import Sources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {importSources.map((source) => {
              const Icon = sourceIcons[source.type]
              return (
                <Card key={source.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{source.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last import: {source.lastImport}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {source.type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Items imported</span>
                      <span className="font-medium">{source.itemsImported}</span>
                    </div>
                    <div className="mb-4 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Draft concepts</span>
                      <span className="font-medium text-status-draft">{source.draftConcepts}</span>
                    </div>
                    <Progress
                      value={((source.itemsImported - source.draftConcepts) / source.itemsImported) * 100}
                      className="mb-3 h-2"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        View Items
                      </Button>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
