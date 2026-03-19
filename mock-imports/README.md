Use these files in the import dialog to test each import path:

- `definitions-valid.csv`: should succeed with 3 imported items.
- `definitions-with-warning.csv`: should succeed with 2 imported items and 1 warning for the empty title row.
- `definitions-invalid.csv`: should fail because it does not include a `title` column.
- `ontology-sample.ttl`: should fail with the current "coming soon" Turtle parser message.
- `spreadsheet-placeholder.xlsx`: should fail with the current Excel import message.

Folder:
- `C:\Users\julia\OneDrive\Documenten\Ontoindex\mock-imports`
