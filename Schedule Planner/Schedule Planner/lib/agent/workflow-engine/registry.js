import { createTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/createTaskWorkflow";
import { detectRiskWorkflow } from "@/lib/agent/workflow-engine/workflows/detectRiskWorkflow";
import { deleteTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/deleteTaskWorkflow";
import { planDayWorkflow } from "@/lib/agent/workflow-engine/workflows/planDayWorkflow";
import { planWeekWorkflow } from "@/lib/agent/workflow-engine/workflows/planWeekWorkflow";
import { queryDataWorkflow } from "@/lib/agent/workflow-engine/workflows/queryDataWorkflow";
import { rescheduleChainWorkflow } from "@/lib/agent/workflow-engine/workflows/rescheduleChainWorkflow";
import { updateTaskWorkflow } from "@/lib/agent/workflow-engine/workflows/updateTaskWorkflow";

const WORKFLOW_REGISTRY = {
  create_task: createTaskWorkflow,
  update_task: updateTaskWorkflow,
  delete_task: deleteTaskWorkflow,
  query_data: queryDataWorkflow,
  plan_day: planDayWorkflow,
  plan_week: planWeekWorkflow,
  detect_risk: detectRiskWorkflow,
  reschedule_chain: rescheduleChainWorkflow,
};

export function getWorkflowByIntent(intent) {
  return WORKFLOW_REGISTRY[intent] || null;
}

export function listSupportedWorkflowIntents() {
  return Object.keys(WORKFLOW_REGISTRY);
}
