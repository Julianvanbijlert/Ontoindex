'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { 
  User, 
  Concept, 
  Ontology, 
  WorkflowItem, 
  ImportSource,
  currentUser as defaultUser,
  concepts as initialConcepts,
  ontologies as initialOntologies,
  workflowItems as initialWorkflows,
  importSources as initialImports,
  users as initialUsers
} from './mock-data'

interface AppContextType {
  currentUser: User | null
  users: User[]
  login: (userId: string) => void
  logout: () => void
  
  concepts: Concept[]
  ontologies: Ontology[]
  workflows: WorkflowItem[]
  imports: ImportSource[]
  favourites: string[] // concept or ontology IDs
  
  addConcept: (concept: Concept) => void
  updateConcept: (concept: Concept) => void
  addComment: (conceptId: string, content: string) => void
  
  addWorkflow: (workflow: WorkflowItem) => void
  updateWorkflowStatus: (workflowId: string, status: string) => void
  
  toggleFavourite: (id: string) => void
  isFavourite: (id: string) => boolean
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [users] = useState<User[]>(initialUsers)
  
  const [concepts, setConcepts] = useState<Concept[]>(initialConcepts)
  const [ontologies, setOntologies] = useState<Ontology[]>(initialOntologies)
  const [workflows, setWorkflows] = useState<WorkflowItem[]>(initialWorkflows)
  const [imports, setImports] = useState<ImportSource[]>(initialImports)
  const [favourites, setFavourites] = useState<string[]>([])

  // Load from local storage on mount to simulate persistence across page reloads (if desired)
  useEffect(() => {
    setIsMounted(true)
    const storedUser = localStorage.getItem('ontoindex_user')
    if (storedUser) {
      const user = users.find(u => u.id === storedUser)
      if (user) setCurrentUser(user)
    } else {
      setCurrentUser(defaultUser)
      localStorage.setItem('ontoindex_user', defaultUser.id)
    }

    const storedFavs = localStorage.getItem('ontoindex_favs')
    if (storedFavs) {
      try {
        setFavourites(JSON.parse(storedFavs))
      } catch (e) {}
    }
  }, [users])

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('ontoindex_favs', JSON.stringify(favourites))
    }
  }, [favourites, isMounted])

  const login = (userId: string) => {
    const user = users.find(u => u.id === userId)
    if (user) {
      setCurrentUser(user)
      localStorage.setItem('ontoindex_user', user.id)
    }
  }

  const logout = () => {
    setCurrentUser(null)
    localStorage.removeItem('ontoindex_user')
  }

  const addConcept = (concept: Concept) => {
    setConcepts(prev => [concept, ...prev])
  }

  const updateConcept = (updated: Concept) => {
    setConcepts(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const addComment = (conceptId: string, content: string) => {
    if (!currentUser) return
    setConcepts(prev => prev.map(c => {
      if (c.id === conceptId) {
        const newComment = {
          id: `cmt-${Date.now()}`,
          author: currentUser.name,
          authorRole: currentUser.role,
          content,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
        }
        return { ...c, comments: [...(c.comments || []), newComment] }
      }
      return c
    }))
  }

  const addWorkflow = (workflow: WorkflowItem) => {
    setWorkflows(prev => [workflow, ...prev])
  }

  const updateWorkflowStatus = (id: string, status: any) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, status } : w))
  }

  const toggleFavourite = (id: string) => {
    setFavourites(prev => {
      if (prev.includes(id)) return prev.filter(f => f !== id)
      return [...prev, id]
    })
  }

  const isFavourite = (id: string) => favourites.includes(id)

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        login,
        logout,
        concepts,
        ontologies,
        workflows,
        imports,
        favourites,
        addConcept,
        updateConcept,
        addComment,
        addWorkflow,
        updateWorkflowStatus,
        toggleFavourite,
        isFavourite
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider')
  }
  return context
}
