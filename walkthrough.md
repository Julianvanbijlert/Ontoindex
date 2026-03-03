# OntoIndex Prototype Walkthrough

I have built the initial interactive prototype for **OntoIndex**, focusing on a modern enterprise SaaS feel using Vite, React, and Tailwind CSS.

## Overview of Implementation
The application uses a Desktop-first layout with a consistent left sidebar and a global top search bar. Mock data has been wired up to allow navigating through the primary user flows.

### Global Search & Navigation
- The **Sidebar** provides quick access to all major modules (Search, Concepts, Review Queue, Imports, Analytics).
- The **Topbar** includes a global search input and user profile indicators, establishing context (e.g., showing the user is a Domain Owner).

### 1. Search View
The default landing view designed for employees.
- Includes a toggle between **Exact Keyword** and **Semantic Match** search modes.
- Filters allow narrowing hits by Domain, Status, and Type.
- Results show rich metadata including status pills, relational counts, and dependent document counts.

### 2. Concept Detail View
Clicking on a term (e.g., "Customer Legal Entity") opens the detail view with 4 functional tabs:
- **Definition**: Shows the core definition, expanded context, and Include/Exclude examples.
- **Relations**: Visualizes hierarchical or lateral relationships to other concepts.
- **Procedures & Policies**: Lists documents that depend on this concept to break down silos.
- **History**: An audit trail of changes, status updates, and comments.

### 3. Governance Review Queue
Designed for Architects and Domain Owners.
- A table lists all pending change requests with their age and type.
- Clicking a row opens a **Side-by-side Drawer** comparing the Current Approved Version with the Proposed Revision to facilitate merging and approvals.

### 4. Data Ingestion (Imports)
- Displays cards for configured data sources (SharePoint, Notion, CSV).
- Shows metrics on items parsed and drafts promoted.

### 5. Analytics Dashboard
- Provides a high-level view of system health, total concepts, and search volume.
- Highlights "Knowledge Gaps" (searches that returned zero results) to inform what concepts need to be defined next.

## Walkthrough Recording
Here is a recording of the browser subagent exploring the application:
![OntoIndex Browser Subagent Explore](file:///C:/Users/Artjom/.gemini/antigravity/brain/e05d33ed-dd87-4be7-9fdf-a86aa7c29abe/onto_index_preview_1772563161787.webp)

## Selected Screenshots
![Detail Definition Tab](file:///C:/Users/Artjom/.gemini/antigravity/brain/e05d33ed-dd87-4be7-9fdf-a86aa7c29abe/detail_definition_1772563294521.png)
![Detail Relations Tab](file:///C:/Users/Artjom/.gemini/antigravity/brain/e05d33ed-dd87-4be7-9fdf-a86aa7c29abe/detail_relations_1772563339123.png)
![Detail Procedures Tab](file:///C:/Users/Artjom/.gemini/antigravity/brain/e05d33ed-dd87-4be7-9fdf-a86aa7c29abe/detail_procedures_policies_1772563352101.png)
![Detail History Tab](file:///C:/Users/Artjom/.gemini/antigravity/brain/e05d33ed-dd87-4be7-9fdf-a86aa7c29abe/detail_history_1772563322630.png)

## Verification
I verified the functionality by spinning up the local dev server and using a browser subagent to click through the different views and tabs. The application is responsive, styling is consistent, and the interactive elements (tabs, toggles, sidebars) work as requested.

## Running Locally
To test this yourself locally, you can view the `scratch/ontoindex` directory and run:
```bash
npm run dev
```
