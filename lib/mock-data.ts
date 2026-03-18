export type Status = 'draft' | 'in-review' | 'approved' | 'rejected' | 'deprecated'
export type Priority = 'low' | 'normal' | 'high'
export type Role = 'architect' | 'domain-owner' | 'employee' | 'governance' | 'admin'
export type ConceptType = 'definition' | 'procedure' | 'policy'

export interface Concept {
  id: string
  term: string
  shortDefinition: string
  fullDefinition: string
  examples: string[]
  domain: string
  ontology: string
  status: Status
  owner: string
  ownerRole: Role
  lastUpdated: string
  procedures: number
  policies: number
  systems: number
  tags: string[]
  relatedConcepts: { id: string; term: string; relation: string }[]
  comments?: Comment[]
}

export interface WorkflowItem {
  id: string
  conceptId: string
  term: string
  type: ConceptType
  changeType: 'new' | 'update' | 'merge' | 'deprecate'
  requester: string
  requesterRole: Role
  age: string
  status: Status
  priority: Priority
  notes: Comment[]
  previousVersion?: string
  proposedVersion: string
}

export interface Comment {
  id: string
  author: string
  authorRole: Role
  content: string
  timestamp: string
}

export interface Ontology {
  id: string
  name: string
  domain: string
  owner: string
  conceptCount: number
  lastUpdated: string
  standard: string
  description: string
}

export interface ImportSource {
  id: string
  name: string
  type: 'sharepoint' | 'notion' | 'csv' | 'word' | 'api'
  lastImport: string
  itemsImported: number
  draftConcepts: number
}

export interface User {
  id: string
  name: string
  email: string
  role: Role
  department: string
  avatar?: string
}

export const users: User[] = [
  {
    id: 'u1',
    name: 'Anna van Dijk',
    email: 'a.vandijk@ministry.nl',
    role: 'architect',
    department: 'Enterprise Architecture',
    avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d',
  },
  {
    id: 'u2',
    name: 'Viewer',
    email: 'viewer@ministry.nl',
    role: 'employee',
    department: 'General Staff',
    avatar: 'https://i.pravatar.cc/150?u=a04258a2462d826712d',
  }
]

export const currentUser: User = users[0]

export const concepts: Concept[] = [
  {
    id: 'c1',
    term: 'Customer Legal Entity',
    shortDefinition: 'A legal entity that has entered into a contractual relationship with the organization as a customer.',
    fullDefinition: 'A Customer Legal Entity is a formally registered legal entity (such as a company, foundation, or governmental body) that has entered into one or more contractual agreements with the organization for the provision of products or services. This concept is central to customer relationship management, billing, and compliance reporting.',
    examples: [
      'Acme B.V. as a contracted client for banking services',
      'Municipality of Amsterdam as a government customer',
      'XYZ Foundation receiving consulting services'
    ],
    domain: 'Customer Management',
    ontology: 'Core Business Ontology',
    status: 'approved',
    owner: 'Jan de Vries',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-03-10',
    procedures: 3,
    policies: 2,
    systems: 4,
    tags: ['customer', 'legal', 'contract', 'MIM'],
    relatedConcepts: [
      { id: 'c2', term: 'Customer Role', relation: 'has role' },
      { id: 'c3', term: 'Agreement', relation: 'party to' },
      { id: 'c4', term: 'Product Offering', relation: 'subscribes to' },
    ],
  },
  {
    id: 'c2',
    term: 'Customer Role',
    shortDefinition: 'A specific function or capacity in which a customer interacts with the organization.',
    fullDefinition: 'Customer Role defines the various capacities in which a Customer Legal Entity may interact with the organization. A single customer may hold multiple roles simultaneously, such as being both a buyer and a beneficiary.',
    examples: [
      'Primary account holder',
      'Authorized signatory',
      'Beneficiary of services'
    ],
    domain: 'Customer Management',
    ontology: 'Core Business Ontology',
    status: 'approved',
    owner: 'Jan de Vries',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-03-08',
    procedures: 2,
    policies: 1,
    systems: 3,
    tags: ['customer', 'role', 'authorization'],
    relatedConcepts: [
      { id: 'c1', term: 'Customer Legal Entity', relation: 'role of' },
      { id: 'c5', term: 'Permission', relation: 'grants' },
    ],
  },
  {
    id: 'c3',
    term: 'Agreement',
    shortDefinition: 'A formal contract between the organization and one or more parties.',
    fullDefinition: 'An Agreement is a legally binding contract that defines the terms, conditions, and obligations between the organization and external parties (typically customers or partners). Agreements govern the provision of products and services.',
    examples: [
      'Master Service Agreement',
      'Product subscription contract',
      'Partnership agreement'
    ],
    domain: 'Legal & Contracts',
    ontology: 'Core Business Ontology',
    status: 'approved',
    owner: 'Maria Jansen',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-02-28',
    procedures: 5,
    policies: 4,
    systems: 6,
    tags: ['legal', 'contract', 'compliance'],
    relatedConcepts: [
      { id: 'c1', term: 'Customer Legal Entity', relation: 'has party' },
      { id: 'c4', term: 'Product Offering', relation: 'covers' },
    ],
  },
  {
    id: 'c4',
    term: 'Product Offering',
    shortDefinition: 'A specific product or service available for customers to purchase or subscribe to.',
    fullDefinition: 'A Product Offering represents a marketable package of features, terms, and pricing that customers can acquire. It encapsulates what is being sold and under what conditions.',
    examples: [
      'Premium Banking Package',
      'Enterprise Support Tier',
      'Basic Consulting Hours'
    ],
    domain: 'Product Management',
    ontology: 'Core Business Ontology',
    status: 'in-review',
    owner: 'Peter Bakker',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-03-15',
    procedures: 2,
    policies: 1,
    systems: 5,
    tags: ['product', 'pricing', 'catalog'],
    relatedConcepts: [
      { id: 'c1', term: 'Customer Legal Entity', relation: 'offered to' },
      { id: 'c3', term: 'Agreement', relation: 'part of' },
    ],
  },
  {
    id: 'c5',
    term: 'Permission',
    shortDefinition: 'An authorization granted to a user or role to perform specific actions.',
    fullDefinition: 'Permission represents a granular authorization that allows a user or role to perform specific actions within a system or process. Permissions are typically grouped into roles and assigned based on job functions.',
    examples: [
      'View customer data',
      'Approve transactions',
      'Edit product catalog'
    ],
    domain: 'Security & Access',
    ontology: 'IT Governance Ontology',
    status: 'draft',
    owner: 'Lisa van der Berg',
    ownerRole: 'architect',
    lastUpdated: '2026-03-17',
    procedures: 1,
    policies: 3,
    systems: 8,
    tags: ['security', 'authorization', 'access-control'],
    relatedConcepts: [
      { id: 'c2', term: 'Customer Role', relation: 'associated with' },
    ],
  },
  {
    id: 'c6',
    term: 'Data Subject',
    shortDefinition: 'An individual whose personal data is processed by the organization.',
    fullDefinition: 'Under GDPR and Dutch privacy law, a Data Subject is any identified or identifiable natural person whose personal data is being collected, stored, or processed by the organization. This includes customers, employees, and third parties.',
    examples: [
      'Customer providing personal details',
      'Employee in HR system',
      'Website visitor with cookies'
    ],
    domain: 'Privacy & Compliance',
    ontology: 'GDPR Compliance Ontology',
    status: 'approved',
    owner: 'Emma de Groot',
    ownerRole: 'governance',
    lastUpdated: '2026-03-01',
    procedures: 4,
    policies: 6,
    systems: 12,
    tags: ['privacy', 'GDPR', 'personal-data', 'compliance'],
    relatedConcepts: [
      { id: 'c1', term: 'Customer Legal Entity', relation: 'may be' },
    ],
  },
  {
    id: 'c7',
    term: 'Worker',
    shortDefinition: 'An individual providing labor to the organization.',
    fullDefinition: 'A worker is any person who performs labor for the organization, regardless of the specific contract type. This includes employees, contractors, and temporary staff.',
    examples: ['Full-time employee', 'Freelance consultant'],
    domain: 'Human Resources',
    ontology: 'Arbeidsvoorwaarden',
    status: 'approved',
    owner: 'Tom Visser',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-03-10',
    procedures: 2,
    policies: 3,
    systems: 2,
    tags: ['hr', 'personnel'],
    relatedConcepts: [
      { id: 'c9', term: 'Workercontract', relation: 'has contract' },
    ],
    comments: [],
  },
  {
    id: 'c8',
    term: 'Employee',
    shortDefinition: 'Synonym for worker.',
    fullDefinition: 'In our terminology, employee is synonymous with worker, though often used colloquially to refer strictly to those with internal permanent contracts.',
    examples: [],
    domain: 'Human Resources',
    ontology: 'Arbeidsvoorwaarden',
    status: 'deprecated',
    owner: 'Tom Visser',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-01-15',
    procedures: 0,
    policies: 0,
    systems: 0,
    tags: ['hr', 'synonym'],
    relatedConcepts: [
      { id: 'c7', term: 'Worker', relation: 'synonym of' },
    ],
    comments: [],
  },
  {
    id: 'c9',
    term: 'Workercontract',
    shortDefinition: 'The legal agreement governing a worker\'s employment.',
    fullDefinition: 'A workercontract (arbeidsovereenkomst) specifies the terms, conditions, and trial length of a worker\'s employment. The standard trial length is 2 months, but it can vary based on the specific collective agreement.',
    examples: ['Permanent contract', 'Temporary 1-year contract'],
    domain: 'Human Resources',
    ontology: 'Arbeidsvoorwaarden',
    status: 'approved',
    owner: 'Tom Visser',
    ownerRole: 'domain-owner',
    lastUpdated: '2026-02-28',
    procedures: 5,
    policies: 2,
    systems: 1,
    tags: ['hr', 'contract', 'trial-length'],
    relatedConcepts: [
      { id: 'c7', term: 'Worker', relation: 'applies to' },
    ],
    comments: [],
  },
]

export const workflowItems: WorkflowItem[] = [
  {
    id: 'w1',
    conceptId: 'c4',
    term: 'Product Offering',
    type: 'definition',
    changeType: 'update',
    requester: 'Peter Bakker',
    requesterRole: 'domain-owner',
    age: '2 days',
    status: 'in-review',
    priority: 'high',
    notes: [
      {
        id: 'n1',
        author: 'Peter Bakker',
        authorRole: 'domain-owner',
        content: 'Updated definition to align with new product catalog structure.',
        timestamp: '2026-03-15 14:30',
      },
    ],
    previousVersion: 'A specific product or service available for purchase.',
    proposedVersion: 'A specific product or service available for customers to purchase or subscribe to.',
  },
  {
    id: 'w2',
    conceptId: 'c5',
    term: 'Permission',
    type: 'definition',
    changeType: 'new',
    requester: 'Lisa van der Berg',
    requesterRole: 'architect',
    age: '1 day',
    status: 'draft',
    priority: 'normal',
    notes: [],
    proposedVersion: 'An authorization granted to a user or role to perform specific actions within a system or process.',
  },
  {
    id: 'w3',
    conceptId: 'c7',
    term: 'Service Level Agreement',
    type: 'definition',
    changeType: 'new',
    requester: 'Jan de Vries',
    requesterRole: 'domain-owner',
    age: '5 days',
    status: 'in-review',
    priority: 'low',
    notes: [
      {
        id: 'n2',
        author: 'Anna van Dijk',
        authorRole: 'architect',
        content: 'Please clarify how this relates to the existing Agreement concept.',
        timestamp: '2026-03-14 10:15',
      },
    ],
    proposedVersion: 'A formal commitment between a service provider and customer defining the expected level of service.',
  },
  {
    id: 'w4',
    conceptId: 'c8',
    term: 'Client',
    type: 'definition',
    changeType: 'merge',
    requester: 'Maria Jansen',
    requesterRole: 'domain-owner',
    age: '3 days',
    status: 'in-review',
    priority: 'high',
    notes: [
      {
        id: 'n3',
        author: 'Maria Jansen',
        authorRole: 'domain-owner',
        content: 'Proposing to merge "Client" into "Customer Legal Entity" as they refer to the same concept.',
        timestamp: '2026-03-12 09:00',
      },
    ],
    proposedVersion: 'Mark as synonym of Customer Legal Entity',
  },
]

export const ontologies: Ontology[] = [
  {
    id: 'o1',
    name: 'Core Business Ontology',
    domain: 'Enterprise',
    owner: 'Jan de Vries',
    conceptCount: 127,
    lastUpdated: '2026-03-15',
    standard: 'MIM 2.0',
    description: 'The foundational ontology covering core business concepts including customers, products, and agreements.',
  },
  {
    id: 'o2',
    name: 'IT Governance Ontology',
    domain: 'IT',
    owner: 'Lisa van der Berg',
    conceptCount: 84,
    lastUpdated: '2026-03-17',
    standard: 'MIM 2.0',
    description: 'Definitions related to IT systems, security, and technical architecture.',
  },
  {
    id: 'o3',
    name: 'GDPR Compliance Ontology',
    domain: 'Legal',
    owner: 'Emma de Groot',
    conceptCount: 56,
    lastUpdated: '2026-03-01',
    standard: 'NL-SBB',
    description: 'Privacy and data protection concepts aligned with GDPR requirements.',
  },
  {
    id: 'o4',
    name: 'HR Domain Ontology',
    domain: 'Human Resources',
    owner: 'Tom Visser',
    conceptCount: 43,
    lastUpdated: '2026-02-20',
    standard: 'MIM 2.0',
    description: 'Employee, organization, and workforce management concepts.',
  },
  {
    id: 'o5',
    name: 'Arbeidsvoorwaarden',
    domain: 'Human Resources',
    owner: 'Tom Visser',
    conceptCount: 15,
    lastUpdated: '2026-03-18',
    standard: 'MIM 2.0',
    description: 'Terms of employment and workforce definitions.',
  },
]

export const importSources: ImportSource[] = [
  {
    id: 'i1',
    name: 'HR Policies SharePoint',
    type: 'sharepoint',
    lastImport: '2026-03-10',
    itemsImported: 156,
    draftConcepts: 23,
  },
  {
    id: 'i2',
    name: 'Architecture Wiki (Notion)',
    type: 'notion',
    lastImport: '2026-03-14',
    itemsImported: 89,
    draftConcepts: 12,
  },
  {
    id: 'i3',
    name: 'ERP Glossary Export',
    type: 'csv',
    lastImport: '2026-03-05',
    itemsImported: 234,
    draftConcepts: 45,
  },
  {
    id: 'i4',
    name: 'Policy Documents',
    type: 'word',
    lastImport: '2026-03-01',
    itemsImported: 67,
    draftConcepts: 8,
  },
]

export const analyticsData = {
  totalConcepts: 310,
  byStatus: {
    approved: 245,
    'in-review': 32,
    draft: 28,
    deprecated: 5,
  },
  topSearchQueries: [
    { query: 'customer', count: 342 },
    { query: 'agreement', count: 256 },
    { query: 'product', count: 198 },
    { query: 'permission', count: 167 },
    { query: 'data subject', count: 145 },
  ],
  noResultQueries: [
    { query: 'invoice', count: 45 },
    { query: 'supplier', count: 32 },
    { query: 'payment terms', count: 28 },
  ],
  topViewedConcepts: [
    { id: 'c1', term: 'Customer Legal Entity', views: 1234 },
    { id: 'c3', term: 'Agreement', views: 987 },
    { id: 'c6', term: 'Data Subject', views: 876 },
    { id: 'c2', term: 'Customer Role', views: 654 },
    { id: 'c4', term: 'Product Offering', views: 543 },
  ],
  recentActivity: [
    { type: 'view', term: 'Customer Legal Entity', time: '5 min ago' },
    { type: 'edit', term: 'Product Offering', time: '2 hours ago' },
    { type: 'approve', term: 'Data Subject', time: '1 day ago' },
    { type: 'view', term: 'Agreement', time: '1 day ago' },
  ],
}

export const domains = [
  'All domains',
  'Customer Management',
  'Legal & Contracts',
  'Product Management',
  'Security & Access',
  'Privacy & Compliance',
  'Human Resources',
  'IT',
  'Enterprise',
]

export const statusOptions: Status[] = ['draft', 'in-review', 'approved', 'rejected', 'deprecated']
