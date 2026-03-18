'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ShieldCheck, 
  User, 
  ArrowRight, 
  Lock, 
  Mail, 
  Plus 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppContext } from '@/lib/app-context'

export default function LoginPage() {
  const [view, setView] = useState<'login' | 'signup'>('login')
  const { login, users } = useAppContext()
  const router = useRouter()

  const handleLogin = (id: string) => {
    login(id)
    router.push('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-blue-600/20 blur-[120px]"></div>
        <div className="absolute -right-[10%] -bottom-[10%] h-[40%] w-[40%] rounded-full bg-purple-600/20 blur-[120px]"></div>
      </div>

      <Card className="relative z-10 w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-600/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white">
            {view === 'login' ? 'Welcome back' : 'Create an account'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {view === 'login' 
              ? 'Select a role to enter the platform' 
              : 'Join the OntoIndex knowledge network'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {view === 'login' ? (
            <div className="grid gap-3">
              {users.map((user) => (
                <Button 
                  key={user.id}
                  variant="outline" 
                  className="group relative h-auto flex-col items-start border-slate-700 bg-slate-800/40 p-4 text-left hover:border-indigo-500/50 hover:bg-slate-800"
                  onClick={() => handleLogin(user.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 group-hover:bg-indigo-600/20">
                        {user.role === 'architect' ? <ShieldCheck className="h-5 w-5 text-indigo-400" /> : <User className="h-5 w-5 text-slate-400" />}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{user.name}</div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider">{user.role}</div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-1 group-hover:text-indigo-400" />
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-slate-300">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input id="name" placeholder="John Doe" className="pl-10 border-slate-700 bg-slate-800/50 text-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input id="email" type="email" placeholder="name@company.com" className="pl-10 border-slate-700 bg-slate-800/50 text-white" />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-slate-300">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <Input id="password" type="password" className="pl-10 border-slate-700 bg-slate-800/50 text-white" />
                </div>
              </div>
              <Button 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white mt-4 shadow-lg shadow-indigo-600/20"
                onClick={() => handleLogin('u2')} // Default to viewer for new accounts
              >
                Create Account
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-slate-800 pt-6">
          <div className="text-center text-sm text-slate-400">
            {view === 'login' ? (
              <>
                Don't have an account?{' '}
                <button 
                  onClick={() => setView('signup')}
                  className="font-medium text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button 
                  onClick={() => setView('login')}
                  className="font-medium text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </div>
        </CardFooter>
      </Card>
      
      <div className="fixed bottom-8 left-0 right-0 text-center text-xs text-slate-500">
        &copy; 2026 OntoIndex Prototype. Premium Enterprise Architecture.
      </div>
    </div>
  )
}
