export class WorkflowError extends Error {
  constructor(message, { code = "WORKFLOW_ERROR", status = 500, details = null, type = "system" } = {}) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.type = type;
  }
}

export class BusinessError extends WorkflowError {
  constructor(message, { code = "BUSINESS_ERROR", status = 400, details = null } = {}) {
    super(message, { code, status, details, type: "business" });
    this.name = "BusinessError";
  }
}

export function normalizeWorkflowError(error) {
  if (error instanceof WorkflowError) {
    return {
      type: error.type,
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details || null,
    };
  }

  return {
    type: "system",
    code: "INTERNAL_ERROR",
    message: "Workflow execution failed.",
    status: 500,
    details: String(error?.message || error || "Unknown error"),
  };
}
