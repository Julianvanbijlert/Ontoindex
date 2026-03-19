import { describe, expect, it } from "vitest";

import { getWorkflowNodeStyle, getWorkflowStatusMeta } from "@/lib/workflow-status";

describe("workflow-status", () => {
  it("returns distinct labels and node colors for each workflow status", () => {
    expect(getWorkflowStatusMeta("draft").label).toBe("Draft");
    expect(getWorkflowStatusMeta("approved").label).toBe("Approved");
    expect(getWorkflowNodeStyle("draft").background).not.toBe(getWorkflowNodeStyle("approved").background);
    expect(getWorkflowNodeStyle("in_review").border).not.toBe(getWorkflowNodeStyle("rejected").border);
  });
});

