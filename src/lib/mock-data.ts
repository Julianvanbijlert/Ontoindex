
export interface Definition {
  id: string;
  title: string;
  description: string;
  content: string;
  example?: string;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'critical';
  ontology_id: string;
  tags: string[];
  view_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface Ontology {
  id: string;
  title: string;
  description: string;
  domain: string;
  status: string;
  version: string;
  created_at: string;
  updated_at: string;
}

export const MOCK_ONTOLOGIES: Ontology[] = [
  {
    id: "o1",
    title: "MIM Government Standards",
    description: "Metamodel for Information Modeling (MIM) standard definitions used in Dutch government.",
    domain: "Government",
    status: "published",
    version: "1.1.0",
    created_at: "2024-01-10T08:00:00Z",
    updated_at: "2024-03-15T10:30:00Z"
  },
  {
    id: "o2",
    title: "Finance & Accounting",
    description: "Core accounting principles and financial reporting standards.",
    domain: "Finance",
    status: "draft",
    version: "0.9.5",
    created_at: "2024-02-01T09:00:00Z",
    updated_at: "2024-03-18T14:20:00Z"
  },
  {
    id: "o3",
    title: "Technical Infrastructure",
    description: "Ontology for IT systems, cloud components and networking infrastructure.",
    domain: "IT",
    status: "published",
    version: "2.3.0",
    created_at: "2023-11-20T11:00:00Z",
    updated_at: "2024-03-10T09:15:00Z"
  }
];

export const MOCK_DEFINITIONS: Definition[] = [
  {
    id: "d1",
    title: "Gegevensgroep",
    description: "Een benoemde groepering van eigenschappen die gezamenlijk een betekenisvol deel van een objecttype beschijven.",
    content: "A Gegevensgroep (Data Group) in the MIM standard represents a logical grouping of attributes that belong together. It is used to structure information within an object type.",
    example: "Address details (Street, Number, Postal Code, City) as a data group within a Person object.",
    status: "approved",
    priority: "normal",
    ontology_id: "o1",
    tags: ["MIM", "Modelling", "Architecture"],
    view_count: 154,
    version: 1,
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-02-20T11:30:00Z"
  },
  {
    id: "d2",
    title: "Objecttype",
    description: "De typering van een groep objecten die binnen een domein als zodanig zijn te onderscheiden.",
    content: "An Object Type represents a class of things with shared characteristics. In MIM, this is the primary building block for information models.",
    example: "Person, Organization, Building, Vehicle.",
    status: "approved",
    priority: "high",
    ontology_id: "o1",
    tags: ["MIM", "Core", "NL-SBB"],
    view_count: 243,
    version: 2,
    created_at: "2024-01-15T10:05:00Z",
    updated_at: "2024-03-01T09:00:00Z"
  },
  {
    id: "d3",
    title: "Asset Depreciation",
    description: "The systematic allocation of the cost of a tangible asset over its useful life.",
    content: "Depreciation reflects the use or obsolescence of an asset. Common methods include straight-line and double-declining balance.",
    example: "A server bought for $3,000 with a life of 3 years depreciates $1,000 per year.",
    status: "in_review",
    priority: "normal",
    ontology_id: "o2",
    tags: ["Finance", "Accounting", "Assets"],
    view_count: 45,
    version: 1,
    created_at: "2024-02-05T14:00:00Z",
    updated_at: "2024-03-18T16:45:00Z"
  },
  {
    id: "d4",
    title: "Kubernetes Pod",
    description: "The smallest deployable unit of computing that you can create and manage in Kubernetes.",
    content: "A Pod is a group of one or more containers, with shared storage and network resources, and a specification for how to run the containers.",
    status: "approved",
    priority: "high",
    ontology_id: "o3",
    tags: ["DevOps", "Cloud", "K8s"],
    view_count: 89,
    version: 1,
    created_at: "2024-02-10T11:00:00Z",
    updated_at: "2024-02-28T13:10:00Z"
  },
  {
    id: "d5",
    title: "NL-SBB Attribute",
    description: "A property or characteristic of a concept as defined in the NL-SBB standard.",
    content: "Attributes provide detailed information about a concept in the NL-SBB taxonomy.",
    status: "draft",
    priority: "low",
    ontology_id: "o1",
    tags: ["Standards", "NL-SBB"],
    view_count: 12,
    version: 1,
    created_at: "2024-03-10T15:30:00Z",
    updated_at: "2024-03-10T15:30:00Z"
  }
];

export const MOCK_WORKFLOWS = [
  {
    id: "w1",
    entity_id: "d3",
    entity_title: "Asset Depreciation",
    entity_type: "definition",
    requested_by: "Artijom",
    status: "pending",
    type: "review",
    priority: "normal",
    created_at: "2024-03-18T16:45:00Z"
  },
  {
    id: "w2",
    entity_id: "d5",
    entity_title: "NL-SBB Attribute",
    entity_type: "definition",
    requested_by: "Julian",
    status: "pending",
    type: "approval",
    priority: "low",
    created_at: "2024-03-10T15:30:00Z"
  }
];
