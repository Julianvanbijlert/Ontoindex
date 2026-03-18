'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { domains, ontologies, statusOptions } from '@/lib/mock-data'

import { domains, statusOptions } from '@/lib/mock-data'
import { useAppContext } from '@/lib/app-context'

export default function NewConceptPage() {
  const router = useRouter()
  const { addConcept, ontologies, currentUser } = useAppContext()
  
  const [term, setTerm] = useState('')
  const [shortDef, setShortDef] = useState('')
  const [fullDef, setFullDef] = useState('')
  const [examples, setExamples] = useState('')
  const [domain, setDomain] = useState('')
  const [ontologyId, setOntologyId] = useState('')
  const [status, setStatus] = useState('draft')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  const handleCreate = () => {
    if (!term || !shortDef || !domain || !ontologyId) {
      alert('Please fill in all required fields')
      return
    }

    const selectedOntology = ontologies.find(o => o.id === ontologyId)

    const newConcept = {
      id: `c-new-${Date.now()}`,
      term,
      shortDefinition: shortDef,
      fullDefinition: fullDef,
      examples: examples.split('\n').filter(e => e.trim()),
      domain,
      ontology: selectedOntology?.name || 'Unknown',
      status: status as any,
      owner: currentUser?.name || 'Unknown',
      ownerRole: currentUser?.role || 'employee' as any,
      lastUpdated: new Date().toISOString().split('T')[0],
      procedures: 0,
      policies: 0,
      systems: 0,
      tags,
      relatedConcepts: [],
      comments: []
    }

    addConcept(newConcept)
    router.push(`/concepts/${newConcept.id}`)
  }

  return (
    <AppShell title="Create Definition">
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>New Definition</CardTitle>
            <CardDescription>
              Create a new concept or definition to add to the knowledge base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Term */}
            <div className="space-y-2">
              <label htmlFor="term" className="text-sm font-medium">
                Term <span className="text-destructive">*</span>
              </label>
              <Input id="term" placeholder="e.g., Customer Legal Entity" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>

            {/* Short Definition */}
            <div className="space-y-2">
              <label htmlFor="shortDef" className="text-sm font-medium">
                Short Definition <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="shortDef"
                placeholder="A brief 1-2 sentence definition..."
                className="min-h-[80px] resize-none"
                value={shortDef}
                onChange={(e) => setShortDef(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This will appear in search results and previews.
              </p>
            </div>

            {/* Full Definition */}
            <div className="space-y-2">
              <label htmlFor="fullDef" className="text-sm font-medium">
                Full Definition
              </label>
              <Textarea
                id="fullDef"
                placeholder="A comprehensive definition with context and details..."
                className="min-h-[120px]"
                value={fullDef}
                onChange={(e) => setFullDef(e.target.value)}
              />
            </div>

            {/* Examples */}
            <div className="space-y-2">
              <label htmlFor="examples" className="text-sm font-medium">
                Examples
              </label>
              <Textarea
                id="examples"
                placeholder="Enter examples, one per line..."
                className="min-h-[80px]"
                value={examples}
                onChange={(e) => setExamples(e.target.value)}
              />
            </div>

            {/* Domain & Ontology */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Domain <span className="text-destructive">*</span>
                </label>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.filter((d) => d !== 'All domains').map((domainName) => (
                      <SelectItem key={domainName} value={domainName}>
                        {domainName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Ontology <span className="text-destructive">*</span>
                </label>
                <Select value={ontologyId} onValueChange={setOntologyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ontology" />
                  </SelectTrigger>
                  <SelectContent>
                    {ontologies.map((ontology) => (
                      <SelectItem key={ontology.id} value={ontology.id}>
                        {ontology.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Initial Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in-review">In Review</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                New definitions typically start as Draft.
              </p>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tags</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 rounded-full hover:bg-muted"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create Definition</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
