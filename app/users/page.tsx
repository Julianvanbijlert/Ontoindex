'use client'

import { useState } from 'react'
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Shield,
  Mail,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const mockUsers = [
  {
    id: 'u1',
    name: 'Anna van Dijk',
    email: 'a.vandijk@ministry.nl',
    role: 'architect',
    department: 'Enterprise Architecture',
    status: 'active',
    lastActive: '2 hours ago',
  },
  {
    id: 'u2',
    name: 'Jan de Vries',
    email: 'j.devries@ministry.nl',
    role: 'domain-owner',
    department: 'Customer Management',
    status: 'active',
    lastActive: '1 day ago',
  },
  {
    id: 'u3',
    name: 'Maria Jansen',
    email: 'm.jansen@ministry.nl',
    role: 'domain-owner',
    department: 'Legal & Contracts',
    status: 'active',
    lastActive: '3 days ago',
  },
  {
    id: 'u4',
    name: 'Peter Bakker',
    email: 'p.bakker@ministry.nl',
    role: 'domain-owner',
    department: 'Product Management',
    status: 'active',
    lastActive: '1 week ago',
  },
  {
    id: 'u5',
    name: 'Lisa van der Berg',
    email: 'l.vanderberg@ministry.nl',
    role: 'architect',
    department: 'IT Governance',
    status: 'active',
    lastActive: '5 hours ago',
  },
  {
    id: 'u6',
    name: 'Emma de Groot',
    email: 'e.degroot@ministry.nl',
    role: 'governance',
    department: 'Compliance',
    status: 'active',
    lastActive: '2 days ago',
  },
  {
    id: 'u7',
    name: 'Tom Visser',
    email: 't.visser@ministry.nl',
    role: 'employee',
    department: 'Human Resources',
    status: 'invited',
    lastActive: 'Never',
  },
]

const roleColors: Record<string, string> = {
  architect: 'bg-primary/20 text-primary',
  'domain-owner': 'bg-chart-2/20 text-chart-2',
  governance: 'bg-chart-3/20 text-chart-3',
  admin: 'bg-chart-5/20 text-chart-5',
  employee: 'bg-muted text-muted-foreground',
}

const roleLabels: Record<string, string> = {
  architect: 'Architect',
  'domain-owner': 'Domain Owner',
  governance: 'Governance',
  admin: 'Admin',
  employee: 'Employee',
}

export default function UsersPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  const filteredUsers = mockUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.department.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <AppShell
      title="Users"
      actions={
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation to add a new user to OntoIndex.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email address</label>
                <Input type="email" placeholder="user@organization.nl" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <Select defaultValue="employee">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="domain-owner">Domain Owner</SelectItem>
                    <SelectItem value="architect">Architect</SelectItem>
                    <SelectItem value="governance">Governance Board</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Department</label>
                <Input placeholder="e.g., Enterprise Architecture" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setInviteDialogOpen(false)}>
                <Mail className="mr-2 h-4 w-4" />
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">{mockUsers.length}</p>
              <p className="text-sm text-muted-foreground">Total Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {mockUsers.filter((u) => u.status === 'active').length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {mockUsers.filter((u) => u.role === 'architect').length}
              </p>
              <p className="text-sm text-muted-foreground">Architects</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-2xl font-bold">
                {mockUsers.filter((u) => u.status === 'invited').length}
              </p>
              <p className="text-sm text-muted-foreground">Pending Invites</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Users Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {user.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-xs', roleColors[user.role])}>
                      {roleLabels[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.department}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        user.status === 'active'
                          ? 'bg-status-approved/20 text-status-approved'
                          : 'bg-status-draft/20 text-status-draft'
                      )}
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.lastActive}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Shield className="mr-2 h-4 w-4" />
                          Change Role
                        </DropdownMenuItem>
                        <DropdownMenuItem>View Activity</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          Deactivate User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  )
}
