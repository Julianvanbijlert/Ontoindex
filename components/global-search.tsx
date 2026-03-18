'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Command } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search definitions..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 w-full bg-secondary pl-9 pr-12 text-sm"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
        <Command className="h-3 w-3" />K
      </kbd>
    </form>
  )
}
