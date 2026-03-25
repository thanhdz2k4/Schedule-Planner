import { createTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/createTaskWorkflow";
import { deleteTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/deleteTaskWorkflow";
import { queryDataWorkflow } from "@/lib/agent/workflow-engine/workflows/queryDataWorkflow";
import { updateTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/updateTaskWorkflow";

const WORKFLOW_REGISTRY = {
  create_task: createTaskWorkflow,
  update_task: updateTaskWorkflow,
  delete_task: deleteTaskWorkflow,
  query_data: queryDataWorkflow,
};

export function getWorkflowByIntent(intent) {
  return WORKFLOW_REGISTRY[intent] || null;
}

export function listSupportedWorkflowIntents() {
  return Object.keys(WORKFLOW_REGISTRY);
}
