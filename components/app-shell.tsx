'use client'

import { Bell } from 'lucide-react'
import { Sidebar } from '@/components/sidebar'
import { GlobalSearch } from '@/components/global-search'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface AppShellProps {
  children: React.ReactNode
  title?: string
  actions?: React.ReactNode
}

export function AppShell({ children, title, actions }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center gap-6">
            {title && <h1 className="text-lg font-semibold">{title}</h1>}
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-4">
            {actions}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              <Badge className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-primary p-0 text-[10px]">
                3
              </Badge>
            </Button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
