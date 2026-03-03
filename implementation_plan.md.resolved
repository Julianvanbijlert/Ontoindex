# OntoIndex Prototype Implementation Plan

## Problem Context
The user wants a modern, clickable prototype for an enterprise knowledge base web app called "OntoIndex". It aims to replace scattered documentation (Notion, ERPs) for large organizations with an ontology-grounded semantic search engine.

## Proposed Changes

### Component Architecture
We will use Vite + React + TailwindCSS to build a fast, responsive Desktop-centric Single Page Application.

- **`App.jsx`**: Main state controller to switch between views (Search, Analytics, Registry, Review Queue).
- **`components/Layout/`**
  - `Sidebar.jsx`: Left navigation, logo, active tab state.
  - `Topbar.jsx`: Global search bar and user profile dropdown.
- **`components/Views/`**
  - `SearchView.jsx`: Exact/Semantic toggle, filters, list of concepts.
  - `ConceptDetailView.jsx`: Tabs for Definition, Relations, Procedures & Policies, History.
  - `ReviewQueueView.jsx`: Table of items needing attention, side-by-side comparison drawer.
  - `ImportsView.jsx`: Cards for data sources, import details.
  - `AnalyticsView.jsx`: Lightweight dashboard.
- **`components/Shared/`**
  - `ConflictPanel.jsx`: Side-by-side comparison to resolve definition conflicts.
  - `Badge.jsx`, `Pill.jsx`: Consistent status UI.

### Design System
- **Font**: Inter (sans-serif)
- **Colors**: 
  - Backgrounds: Very dark slate/zinc for real dark mode (`bg-zinc-950`) or crisp white for light mode (we will default to a sleek dark mode akin to Linear).
  - Accents: Indigo/Blue for primary actions. Green for Approved, Yellow for In Review, Gray for Draft.
- **Interactions**: Hover states on rows, subtle scale transforms, smooth tab switching.

## Verification Plan
1. Local test via `npm run dev`.
2. Verify all 5 views can be navigated to via the sidebar.
3. Verify interactive elements (tabs, toggles) work purely through React state.
4. Provide the user with instructions to run the prototype locally out of the `scratch/ontoindex` folder.
