'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Search,
  BookOpen,
  GitPullRequest,
  Import,
  BarChart3,
  Settings,
  Users,
  ChevronDown,
  LogOut,
  User,
  Home,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { currentUser, workflowItems } from '@/lib/mock-data'

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Search', href: '/search', icon: Search },
  { name: 'Ontologies', href: '/ontologies', icon: BookOpen },
  { name: 'Workflows', href: '/workflows', icon: GitPullRequest, badge: workflowItems.length },
  { name: 'Imports', href: '/imports', icon: Import },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
]

const adminNavigation = [
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
]

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'architect':
      return 'bg-primary/20 text-primary'
    case 'domain-owner':
      return 'bg-chart-2/20 text-chart-2'
    case 'governance':
      return 'bg-chart-3/20 text-chart-3'
    case 'admin':
      return 'bg-chart-5/20 text-chart-5'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getRoleLabel(role: string) {
  switch (role) {
    case 'architect':
      return 'Architect'
    case 'domain-owner':
      return 'Domain Owner'
    case 'governance':
      return 'Governance'
    case 'admin':
      return 'Admin'
    case 'employee':
      return 'Employee'
    default:
      return role
  }
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <BookOpen className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-sidebar-foreground">OntoIndex</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Main
        </div>
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
              {item.badge && (
                <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center bg-primary/20 text-primary text-xs">
                  {item.badge}
                </Badge>
              )}
            </Link>
          )
        })}

        {(currentUser.role === 'architect' || currentUser.role === 'admin') && (
          <>
            <div className="mb-2 mt-6 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Admin
            </div>
            {adminNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              )
            })}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {currentUser.name}
                </p>
                <Badge className={cn('mt-0.5 text-[10px] font-normal', getRoleBadgeColor(currentUser.role))}>
                  {getRoleLabel(currentUser.role)}
                </Badge>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
