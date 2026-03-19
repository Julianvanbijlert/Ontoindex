(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/Prototype/Ontoindex_v0_artyom/lib/mock-data.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "analyticsData",
    ()=>analyticsData,
    "concepts",
    ()=>concepts,
    "currentUser",
    ()=>currentUser,
    "domains",
    ()=>domains,
    "importSources",
    ()=>importSources,
    "ontologies",
    ()=>ontologies,
    "statusOptions",
    ()=>statusOptions,
    "users",
    ()=>users,
    "workflowItems",
    ()=>workflowItems
]);
const users = [
    {
        id: 'u1',
        name: 'Anna van Dijk',
        email: 'a.vandijk@ministry.nl',
        role: 'architect',
        department: 'Enterprise Architecture',
        avatar: 'https://i.pravatar.cc/150?u=a042581f4e29026704d'
    },
    {
        id: 'u2',
        name: 'Viewer',
        email: 'viewer@ministry.nl',
        role: 'employee',
        department: 'General Staff',
        avatar: 'https://i.pravatar.cc/150?u=a04258a2462d826712d'
    }
];
const currentUser = users[0];
const concepts = [
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
        tags: [
            'customer',
            'legal',
            'contract',
            'MIM'
        ],
        relatedConcepts: [
            {
                id: 'c2',
                term: 'Customer Role',
                relation: 'has role'
            },
            {
                id: 'c3',
                term: 'Agreement',
                relation: 'party to'
            },
            {
                id: 'c4',
                term: 'Product Offering',
                relation: 'subscribes to'
            }
        ]
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
        tags: [
            'customer',
            'role',
            'authorization'
        ],
        relatedConcepts: [
            {
                id: 'c1',
                term: 'Customer Legal Entity',
                relation: 'role of'
            },
            {
                id: 'c5',
                term: 'Permission',
                relation: 'grants'
            }
        ]
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
        tags: [
            'legal',
            'contract',
            'compliance'
        ],
        relatedConcepts: [
            {
                id: 'c1',
                term: 'Customer Legal Entity',
                relation: 'has party'
            },
            {
                id: 'c4',
                term: 'Product Offering',
                relation: 'covers'
            }
        ]
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
        tags: [
            'product',
            'pricing',
            'catalog'
        ],
        relatedConcepts: [
            {
                id: 'c1',
                term: 'Customer Legal Entity',
                relation: 'offered to'
            },
            {
                id: 'c3',
                term: 'Agreement',
                relation: 'part of'
            }
        ]
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
        tags: [
            'security',
            'authorization',
            'access-control'
        ],
        relatedConcepts: [
            {
                id: 'c2',
                term: 'Customer Role',
                relation: 'associated with'
            }
        ]
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
        tags: [
            'privacy',
            'GDPR',
            'personal-data',
            'compliance'
        ],
        relatedConcepts: [
            {
                id: 'c1',
                term: 'Customer Legal Entity',
                relation: 'may be'
            }
        ]
    },
    {
        id: 'c7',
        term: 'Worker',
        shortDefinition: 'An individual providing labor to the organization.',
        fullDefinition: 'A worker is any person who performs labor for the organization, regardless of the specific contract type. This includes employees, contractors, and temporary staff.',
        examples: [
            'Full-time employee',
            'Freelance consultant'
        ],
        domain: 'Human Resources',
        ontology: 'Arbeidsvoorwaarden',
        status: 'approved',
        owner: 'Tom Visser',
        ownerRole: 'domain-owner',
        lastUpdated: '2026-03-10',
        procedures: 2,
        policies: 3,
        systems: 2,
        tags: [
            'hr',
            'personnel'
        ],
        relatedConcepts: [
            {
                id: 'c9',
                term: 'Workercontract',
                relation: 'has contract'
            }
        ],
        comments: []
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
        tags: [
            'hr',
            'synonym'
        ],
        relatedConcepts: [
            {
                id: 'c7',
                term: 'Worker',
                relation: 'synonym of'
            }
        ],
        comments: []
    },
    {
        id: 'c9',
        term: 'Workercontract',
        shortDefinition: 'The legal agreement governing a worker\'s employment.',
        fullDefinition: 'A workercontract (arbeidsovereenkomst) specifies the terms, conditions, and trial length of a worker\'s employment. The standard trial length is 2 months, but it can vary based on the specific collective agreement.',
        examples: [
            'Permanent contract',
            'Temporary 1-year contract'
        ],
        domain: 'Human Resources',
        ontology: 'Arbeidsvoorwaarden',
        status: 'approved',
        owner: 'Tom Visser',
        ownerRole: 'domain-owner',
        lastUpdated: '2026-02-28',
        procedures: 5,
        policies: 2,
        systems: 1,
        tags: [
            'hr',
            'contract',
            'trial-length'
        ],
        relatedConcepts: [
            {
                id: 'c7',
                term: 'Worker',
                relation: 'applies to'
            }
        ],
        comments: []
    }
];
const workflowItems = [
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
                timestamp: '2026-03-15 14:30'
            }
        ],
        previousVersion: 'A specific product or service available for purchase.',
        proposedVersion: 'A specific product or service available for customers to purchase or subscribe to.'
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
        proposedVersion: 'An authorization granted to a user or role to perform specific actions within a system or process.'
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
                timestamp: '2026-03-14 10:15'
            }
        ],
        proposedVersion: 'A formal commitment between a service provider and customer defining the expected level of service.'
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
                timestamp: '2026-03-12 09:00'
            }
        ],
        proposedVersion: 'Mark as synonym of Customer Legal Entity'
    }
];
const ontologies = [
    {
        id: 'o1',
        name: 'Core Business Ontology',
        domain: 'Enterprise',
        owner: 'Jan de Vries',
        conceptCount: 127,
        lastUpdated: '2026-03-15',
        standard: 'MIM 2.0',
        description: 'The foundational ontology covering core business concepts including customers, products, and agreements.'
    },
    {
        id: 'o2',
        name: 'IT Governance Ontology',
        domain: 'IT',
        owner: 'Lisa van der Berg',
        conceptCount: 84,
        lastUpdated: '2026-03-17',
        standard: 'MIM 2.0',
        description: 'Definitions related to IT systems, security, and technical architecture.'
    },
    {
        id: 'o3',
        name: 'GDPR Compliance Ontology',
        domain: 'Legal',
        owner: 'Emma de Groot',
        conceptCount: 56,
        lastUpdated: '2026-03-01',
        standard: 'NL-SBB',
        description: 'Privacy and data protection concepts aligned with GDPR requirements.'
    },
    {
        id: 'o4',
        name: 'HR Domain Ontology',
        domain: 'Human Resources',
        owner: 'Tom Visser',
        conceptCount: 43,
        lastUpdated: '2026-02-20',
        standard: 'MIM 2.0',
        description: 'Employee, organization, and workforce management concepts.'
    },
    {
        id: 'o5',
        name: 'Arbeidsvoorwaarden',
        domain: 'Human Resources',
        owner: 'Tom Visser',
        conceptCount: 15,
        lastUpdated: '2026-03-18',
        standard: 'MIM 2.0',
        description: 'Terms of employment and workforce definitions.'
    }
];
const importSources = [
    {
        id: 'i1',
        name: 'HR Policies SharePoint',
        type: 'sharepoint',
        lastImport: '2026-03-10',
        itemsImported: 156,
        draftConcepts: 23
    },
    {
        id: 'i2',
        name: 'Architecture Wiki (Notion)',
        type: 'notion',
        lastImport: '2026-03-14',
        itemsImported: 89,
        draftConcepts: 12
    },
    {
        id: 'i3',
        name: 'ERP Glossary Export',
        type: 'csv',
        lastImport: '2026-03-05',
        itemsImported: 234,
        draftConcepts: 45
    },
    {
        id: 'i4',
        name: 'Policy Documents',
        type: 'word',
        lastImport: '2026-03-01',
        itemsImported: 67,
        draftConcepts: 8
    }
];
const analyticsData = {
    totalConcepts: 310,
    byStatus: {
        approved: 245,
        'in-review': 32,
        draft: 28,
        deprecated: 5
    },
    topSearchQueries: [
        {
            query: 'customer',
            count: 342
        },
        {
            query: 'agreement',
            count: 256
        },
        {
            query: 'product',
            count: 198
        },
        {
            query: 'permission',
            count: 167
        },
        {
            query: 'data subject',
            count: 145
        }
    ],
    noResultQueries: [
        {
            query: 'invoice',
            count: 45
        },
        {
            query: 'supplier',
            count: 32
        },
        {
            query: 'payment terms',
            count: 28
        }
    ],
    topViewedConcepts: [
        {
            id: 'c1',
            term: 'Customer Legal Entity',
            views: 1234
        },
        {
            id: 'c3',
            term: 'Agreement',
            views: 987
        },
        {
            id: 'c6',
            term: 'Data Subject',
            views: 876
        },
        {
            id: 'c2',
            term: 'Customer Role',
            views: 654
        },
        {
            id: 'c4',
            term: 'Product Offering',
            views: 543
        }
    ],
    recentActivity: [
        {
            type: 'view',
            term: 'Customer Legal Entity',
            time: '5 min ago'
        },
        {
            type: 'edit',
            term: 'Product Offering',
            time: '2 hours ago'
        },
        {
            type: 'approve',
            term: 'Data Subject',
            time: '1 day ago'
        },
        {
            type: 'view',
            term: 'Agreement',
            time: '1 day ago'
        }
    ]
};
const domains = [
    'All domains',
    'Customer Management',
    'Legal & Contracts',
    'Product Management',
    'Security & Access',
    'Privacy & Compliance',
    'Human Resources',
    'IT',
    'Enterprise'
];
const statusOptions = [
    'draft',
    'in-review',
    'approved',
    'rejected',
    'deprecated'
];
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Prototype/Ontoindex_v0_artyom/lib/app-context.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AppProvider",
    ()=>AppProvider,
    "useAppContext",
    ()=>useAppContext
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/lib/mock-data.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature(), _s1 = __turbopack_context__.k.signature();
'use client';
;
;
const AppContext = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["createContext"])(undefined);
function AppProvider({ children }) {
    _s();
    const [isMounted, setIsMounted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [currentUser, setCurrentUser] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [users] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["users"]);
    const [concepts, setConcepts] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["concepts"]);
    const [ontologies, setOntologies] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ontologies"]);
    const [workflows, setWorkflows] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["workflowItems"]);
    const [imports, setImports] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["importSources"]);
    const [favourites, setFavourites] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([]);
    // Load from local storage on mount to simulate persistence across page reloads (if desired)
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AppProvider.useEffect": ()=>{
            setIsMounted(true);
            const storedUser = localStorage.getItem('ontoindex_user');
            if (storedUser) {
                const user = users.find({
                    "AppProvider.useEffect.user": (u)=>u.id === storedUser
                }["AppProvider.useEffect.user"]);
                if (user) setCurrentUser(user);
            } else {
                setCurrentUser(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentUser"]);
                localStorage.setItem('ontoindex_user', __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$lib$2f$mock$2d$data$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["currentUser"].id);
            }
            const storedFavs = localStorage.getItem('ontoindex_favs');
            if (storedFavs) {
                try {
                    setFavourites(JSON.parse(storedFavs));
                } catch (e) {}
            }
        }
    }["AppProvider.useEffect"], [
        users
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "AppProvider.useEffect": ()=>{
            if (isMounted) {
                localStorage.setItem('ontoindex_favs', JSON.stringify(favourites));
            }
        }
    }["AppProvider.useEffect"], [
        favourites,
        isMounted
    ]);
    const login = (userId)=>{
        const user = users.find((u)=>u.id === userId);
        if (user) {
            setCurrentUser(user);
            localStorage.setItem('ontoindex_user', user.id);
        }
    };
    const logout = ()=>{
        setCurrentUser(null);
        localStorage.removeItem('ontoindex_user');
    };
    const addConcept = (concept)=>{
        setConcepts((prev)=>[
                concept,
                ...prev
            ]);
    };
    const updateConcept = (updated)=>{
        setConcepts((prev)=>prev.map((c)=>c.id === updated.id ? updated : c));
    };
    const addComment = (conceptId, content)=>{
        if (!currentUser) return;
        setConcepts((prev)=>prev.map((c)=>{
                if (c.id === conceptId) {
                    const newComment = {
                        id: `cmt-${Date.now()}`,
                        author: currentUser.name,
                        authorRole: currentUser.role,
                        content,
                        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
                    };
                    return {
                        ...c,
                        comments: [
                            ...c.comments || [],
                            newComment
                        ]
                    };
                }
                return c;
            }));
    };
    const addWorkflow = (workflow)=>{
        setWorkflows((prev)=>[
                workflow,
                ...prev
            ]);
    };
    const updateWorkflowStatus = (id, status)=>{
        setWorkflows((prev)=>prev.map((w)=>w.id === id ? {
                    ...w,
                    status
                } : w));
    };
    const toggleFavourite = (id)=>{
        setFavourites((prev)=>{
            if (prev.includes(id)) return prev.filter((f)=>f !== id);
            return [
                ...prev,
                id
            ];
        });
    };
    const isFavourite = (id)=>favourites.includes(id);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(AppContext.Provider, {
        value: {
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
        },
        children: children
    }, void 0, false, {
        fileName: "[project]/Prototype/Ontoindex_v0_artyom/lib/app-context.tsx",
        lineNumber: 136,
        columnNumber: 5
    }, this);
}
_s(AppProvider, "ob6Ijil9j4s+AMb8EkeE8OTHvNM=");
_c = AppProvider;
function useAppContext() {
    _s1();
    const context = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useContext"])(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
}
_s1(useAppContext, "b9L3QQ+jgeyIrH0NfHrJ8nn7VMU=");
var _c;
__turbopack_context__.k.register(_c, "AppProvider");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/navigation.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {

module.exports = __turbopack_context__.r("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/client/components/navigation.js [app-client] (ecmascript)");
}),
"[project]/Prototype/Ontoindex_v0_artyom/node_modules/@vercel/analytics/dist/next/index.mjs [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Analytics",
    ()=>Analytics2
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
// src/nextjs/index.tsx
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
// src/nextjs/utils.ts
var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/navigation.js [app-client] (ecmascript)");
"use client";
;
;
// package.json
var name = "@vercel/analytics";
var version = "1.6.1";
// src/queue.ts
var initQueue = ()=>{
    if (window.va) return;
    window.va = function a(...params) {
        (window.vaq = window.vaq || []).push(params);
    };
};
// src/utils.ts
function isBrowser() {
    return typeof window !== "undefined";
}
function detectEnvironment() {
    try {
        const env = ("TURBOPACK compile-time value", "development");
        if ("TURBOPACK compile-time truthy", 1) {
            return "development";
        }
    } catch (e) {}
    return "production";
}
function setMode(mode = "auto") {
    if (mode === "auto") {
        window.vam = detectEnvironment();
        return;
    }
    window.vam = mode;
}
function getMode() {
    const mode = isBrowser() ? window.vam : detectEnvironment();
    return mode || "production";
}
function isDevelopment() {
    return getMode() === "development";
}
function computeRoute(pathname, pathParams) {
    if (!pathname || !pathParams) {
        return pathname;
    }
    let result = pathname;
    try {
        const entries = Object.entries(pathParams);
        for (const [key, value] of entries){
            if (!Array.isArray(value)) {
                const matcher = turnValueToRegExp(value);
                if (matcher.test(result)) {
                    result = result.replace(matcher, `/[${key}]`);
                }
            }
        }
        for (const [key, value] of entries){
            if (Array.isArray(value)) {
                const matcher = turnValueToRegExp(value.join("/"));
                if (matcher.test(result)) {
                    result = result.replace(matcher, `/[...${key}]`);
                }
            }
        }
        return result;
    } catch (e) {
        return pathname;
    }
}
function turnValueToRegExp(value) {
    return new RegExp(`/${escapeRegExp(value)}(?=[/?#]|$)`);
}
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function getScriptSrc(props) {
    if (props.scriptSrc) {
        return props.scriptSrc;
    }
    if (isDevelopment()) {
        return "https://va.vercel-scripts.com/v1/script.debug.js";
    }
    if (props.basePath) {
        return `${props.basePath}/insights/script.js`;
    }
    return "/_vercel/insights/script.js";
}
// src/generic.ts
function inject(props = {
    debug: true
}) {
    var _a;
    if (!isBrowser()) return;
    setMode(props.mode);
    initQueue();
    if (props.beforeSend) {
        (_a = window.va) == null ? void 0 : _a.call(window, "beforeSend", props.beforeSend);
    }
    const src = getScriptSrc(props);
    if (document.head.querySelector(`script[src*="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    script.dataset.sdkn = name + (props.framework ? `/${props.framework}` : "");
    script.dataset.sdkv = version;
    if (props.disableAutoTrack) {
        script.dataset.disableAutoTrack = "1";
    }
    if (props.endpoint) {
        script.dataset.endpoint = props.endpoint;
    } else if (props.basePath) {
        script.dataset.endpoint = `${props.basePath}/insights`;
    }
    if (props.dsn) {
        script.dataset.dsn = props.dsn;
    }
    script.onerror = ()=>{
        const errorMessage = isDevelopment() ? "Please check if any ad blockers are enabled and try again." : "Be sure to enable Web Analytics for your project and deploy again. See https://vercel.com/docs/analytics/quickstart for more information.";
        console.log(`[Vercel Web Analytics] Failed to load script from ${src}. ${errorMessage}`);
    };
    if (isDevelopment() && props.debug === false) {
        script.dataset.debug = "false";
    }
    document.head.appendChild(script);
}
function pageview({ route, path }) {
    var _a;
    (_a = window.va) == null ? void 0 : _a.call(window, "pageview", {
        route,
        path
    });
}
// src/react/utils.ts
function getBasePath() {
    if (typeof __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"] === "undefined" || typeof __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env === "undefined") {
        return void 0;
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.REACT_APP_VERCEL_OBSERVABILITY_BASEPATH;
}
// src/react/index.tsx
function Analytics(props) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Analytics.useEffect": ()=>{
            var _a;
            if (props.beforeSend) {
                (_a = window.va) == null ? void 0 : _a.call(window, "beforeSend", props.beforeSend);
            }
        }
    }["Analytics.useEffect"], [
        props.beforeSend
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Analytics.useEffect": ()=>{
            inject({
                framework: props.framework || "react",
                basePath: props.basePath ?? getBasePath(),
                ...props.route !== void 0 && {
                    disableAutoTrack: true
                },
                ...props
            });
        }
    }["Analytics.useEffect"], []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "Analytics.useEffect": ()=>{
            if (props.route && props.path) {
                pageview({
                    route: props.route,
                    path: props.path
                });
            }
        }
    }["Analytics.useEffect"], [
        props.route,
        props.path
    ]);
    return null;
}
;
var useRoute = ()=>{
    const params = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useParams"])();
    const searchParams = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useSearchParams"])();
    const path = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    if (!params) {
        return {
            route: null,
            path
        };
    }
    const finalParams = Object.keys(params).length ? params : Object.fromEntries(searchParams.entries());
    return {
        route: computeRoute(path, finalParams),
        path
    };
};
function getBasePath2() {
    if (typeof __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"] === "undefined" || typeof __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env === "undefined") {
        return void 0;
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].env.NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH;
}
// src/nextjs/index.tsx
function AnalyticsComponent(props) {
    const { route, path } = useRoute();
    return /* @__PURE__ */ __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].createElement(Analytics, {
        path,
        route,
        ...props,
        basePath: getBasePath2(),
        framework: "next"
    });
}
function Analytics2(props) {
    return /* @__PURE__ */ __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].createElement(__TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Suspense"], {
        fallback: null
    }, /* @__PURE__ */ __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["default"].createElement(AnalyticsComponent, {
        ...props
    }));
}
;
 //# sourceMappingURL=index.mjs.map
}),
"[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
/**
 * @license React
 * react-jsx-dev-runtime.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */ "use strict";
"production" !== ("TURBOPACK compile-time value", "development") && function() {
    function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type) return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch(type){
            case REACT_FRAGMENT_TYPE:
                return "Fragment";
            case REACT_PROFILER_TYPE:
                return "Profiler";
            case REACT_STRICT_MODE_TYPE:
                return "StrictMode";
            case REACT_SUSPENSE_TYPE:
                return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
                return "SuspenseList";
            case REACT_ACTIVITY_TYPE:
                return "Activity";
            case REACT_VIEW_TRANSITION_TYPE:
                return "ViewTransition";
        }
        if ("object" === typeof type) switch("number" === typeof type.tag && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof){
            case REACT_PORTAL_TYPE:
                return "Portal";
            case REACT_CONTEXT_TYPE:
                return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
                return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
                var innerType = type.render;
                type = type.displayName;
                type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
                return type;
            case REACT_MEMO_TYPE:
                return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
                innerType = type._payload;
                type = type._init;
                try {
                    return getComponentNameFromType(type(innerType));
                } catch (x) {}
        }
        return null;
    }
    function testStringCoercion(value) {
        return "" + value;
    }
    function checkKeyStringCoercion(value) {
        try {
            testStringCoercion(value);
            var JSCompiler_inline_result = !1;
        } catch (e) {
            JSCompiler_inline_result = !0;
        }
        if (JSCompiler_inline_result) {
            JSCompiler_inline_result = console;
            var JSCompiler_temp_const = JSCompiler_inline_result.error;
            var JSCompiler_inline_result$jscomp$0 = "function" === typeof Symbol && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            JSCompiler_temp_const.call(JSCompiler_inline_result, "The provided key is an unsupported type %s. This value must be coerced to a string before using it here.", JSCompiler_inline_result$jscomp$0);
            return testStringCoercion(value);
        }
    }
    function getTaskName(type) {
        if (type === REACT_FRAGMENT_TYPE) return "<>";
        if ("object" === typeof type && null !== type && type.$$typeof === REACT_LAZY_TYPE) return "<...>";
        try {
            var name = getComponentNameFromType(type);
            return name ? "<" + name + ">" : "<...>";
        } catch (x) {
            return "<...>";
        }
    }
    function getOwner() {
        var dispatcher = ReactSharedInternals.A;
        return null === dispatcher ? null : dispatcher.getOwner();
    }
    function UnknownOwner() {
        return Error("react-stack-top-frame");
    }
    function hasValidKey(config) {
        if (hasOwnProperty.call(config, "key")) {
            var getter = Object.getOwnPropertyDescriptor(config, "key").get;
            if (getter && getter.isReactWarning) return !1;
        }
        return void 0 !== config.key;
    }
    function defineKeyPropWarningGetter(props, displayName) {
        function warnAboutAccessingKey() {
            specialPropKeyWarningShown || (specialPropKeyWarningShown = !0, console.error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://react.dev/link/special-props)", displayName));
        }
        warnAboutAccessingKey.isReactWarning = !0;
        Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: !0
        });
    }
    function elementRefGetterWithDeprecationWarning() {
        var componentName = getComponentNameFromType(this.type);
        didWarnAboutElementRef[componentName] || (didWarnAboutElementRef[componentName] = !0, console.error("Accessing element.ref was removed in React 19. ref is now a regular prop. It will be removed from the JSX Element type in a future release."));
        componentName = this.props.ref;
        return void 0 !== componentName ? componentName : null;
    }
    function ReactElement(type, key, props, owner, debugStack, debugTask) {
        var refProp = props.ref;
        type = {
            $$typeof: REACT_ELEMENT_TYPE,
            type: type,
            key: key,
            props: props,
            _owner: owner
        };
        null !== (void 0 !== refProp ? refProp : null) ? Object.defineProperty(type, "ref", {
            enumerable: !1,
            get: elementRefGetterWithDeprecationWarning
        }) : Object.defineProperty(type, "ref", {
            enumerable: !1,
            value: null
        });
        type._store = {};
        Object.defineProperty(type._store, "validated", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: 0
        });
        Object.defineProperty(type, "_debugInfo", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: null
        });
        Object.defineProperty(type, "_debugStack", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugStack
        });
        Object.defineProperty(type, "_debugTask", {
            configurable: !1,
            enumerable: !1,
            writable: !0,
            value: debugTask
        });
        Object.freeze && (Object.freeze(type.props), Object.freeze(type));
        return type;
    }
    function jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStack, debugTask) {
        var children = config.children;
        if (void 0 !== children) if (isStaticChildren) if (isArrayImpl(children)) {
            for(isStaticChildren = 0; isStaticChildren < children.length; isStaticChildren++)validateChildKeys(children[isStaticChildren]);
            Object.freeze && Object.freeze(children);
        } else console.error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
        else validateChildKeys(children);
        if (hasOwnProperty.call(config, "key")) {
            children = getComponentNameFromType(type);
            var keys = Object.keys(config).filter(function(k) {
                return "key" !== k;
            });
            isStaticChildren = 0 < keys.length ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
            didWarnAboutKeySpread[children + isStaticChildren] || (keys = 0 < keys.length ? "{" + keys.join(": ..., ") + ": ...}" : "{}", console.error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', isStaticChildren, children, keys, children), didWarnAboutKeySpread[children + isStaticChildren] = !0);
        }
        children = null;
        void 0 !== maybeKey && (checkKeyStringCoercion(maybeKey), children = "" + maybeKey);
        hasValidKey(config) && (checkKeyStringCoercion(config.key), children = "" + config.key);
        if ("key" in config) {
            maybeKey = {};
            for(var propName in config)"key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        children && defineKeyPropWarningGetter(maybeKey, "function" === typeof type ? type.displayName || type.name || "Unknown" : type);
        return ReactElement(type, children, maybeKey, getOwner(), debugStack, debugTask);
    }
    function validateChildKeys(node) {
        isValidElement(node) ? node._store && (node._store.validated = 1) : "object" === typeof node && null !== node && node.$$typeof === REACT_LAZY_TYPE && ("fulfilled" === node._payload.status ? isValidElement(node._payload.value) && node._payload.value._store && (node._payload.value._store.validated = 1) : node._store && (node._store.validated = 1));
    }
    function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
    }
    var React = __turbopack_context__.r("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)"), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy"), REACT_ACTIVITY_TYPE = Symbol.for("react.activity"), REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"), REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, hasOwnProperty = Object.prototype.hasOwnProperty, isArrayImpl = Array.isArray, createTask = console.createTask ? console.createTask : function() {
        return null;
    };
    React = {
        react_stack_bottom_frame: function(callStackForError) {
            return callStackForError();
        }
    };
    var specialPropKeyWarningShown;
    var didWarnAboutElementRef = {};
    var unknownOwnerDebugStack = React.react_stack_bottom_frame.bind(React, UnknownOwner)();
    var unknownOwnerDebugTask = createTask(getTaskName(UnknownOwner));
    var didWarnAboutKeySpread = {};
    exports.Fragment = REACT_FRAGMENT_TYPE;
    exports.jsxDEV = function(type, config, maybeKey, isStaticChildren) {
        var trackActualOwner = 1e4 > ReactSharedInternals.recentlyCreatedOwnerStacks++;
        if (trackActualOwner) {
            var previousStackTraceLimit = Error.stackTraceLimit;
            Error.stackTraceLimit = 10;
            var debugStackDEV = Error("react-stack-top-frame");
            Error.stackTraceLimit = previousStackTraceLimit;
        } else debugStackDEV = unknownOwnerDebugStack;
        return jsxDEVImpl(type, config, maybeKey, isStaticChildren, debugStackDEV, trackActualOwner ? createTask(getTaskName(type)) : unknownOwnerDebugTask);
    };
}();
}),
"[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)", ((__turbopack_context__, module, exports) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$Prototype$2f$Ontoindex_v0_artyom$2f$node_modules$2f$next$2f$dist$2f$build$2f$polyfills$2f$process$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = /*#__PURE__*/ __turbopack_context__.i("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/build/polyfills/process.js [app-client] (ecmascript)");
'use strict';
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
else {
    module.exports = __turbopack_context__.r("[project]/Prototype/Ontoindex_v0_artyom/node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js [app-client] (ecmascript)");
}
}),
]);

//# sourceMappingURL=Prototype_Ontoindex_v0_artyom_01d4baa7._.js.map