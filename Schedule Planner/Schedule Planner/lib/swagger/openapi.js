const PLANNER_STATE_SCHEMA = {
  type: "object",
  required: ["tasks", "goals"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "date", "start", "end", "status", "priority", "goalId"],
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          date: { type: "string", format: "date", example: "2026-03-30" },
          start: { type: "string", pattern: "^\\d{2}:\\d{2}$", example: "09:00" },
          end: { type: "string", pattern: "^\\d{2}:\\d{2}$", example: "10:00" },
          status: { type: "string", enum: ["todo", "doing", "done"] },
          priority: { type: "string", enum: ["high", "medium", "low"] },
          prioritySource: { type: "string", enum: ["manual", "rule", "ai"], nullable: true },
          goalId: { type: "string", nullable: true },
        },
      },
    },
    goals: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "target", "deadline"],
        properties: {
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          target: { type: "integer", minimum: 1 },
          deadline: { type: "string", format: "date" },
          completed: { type: "integer", minimum: 0, nullable: true },
        },
      },
    },
  },
};

const ROUTER_RESULT_SCHEMA = {
  type: "object",
  required: [
    "intent",
    "confidence",
    "entities",
    "need_clarification",
    "clarifying_question",
    "source",
    "context_for_next_turn",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "create_task",
        "update_task",
        "delete_task",
        "query_data",
        "set_goal",
        "plan_day",
        "plan_week",
        "detect_risk",
        "reschedule_chain",
        "configure_reminder",
        "connect_messenger",
      ],
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    entities: { type: "object", additionalProperties: true },
    need_clarification: { type: "boolean" },
    clarifying_question: { type: "string", nullable: true },
    source: { type: "string", enum: ["rule", "mistral"] },
    warning: { type: "string", nullable: true },
    context_for_next_turn: {
      type: "object",
      required: ["intent", "entities", "last_user_text", "last_agent_question"],
      properties: {
        intent: { type: "string" },
        entities: { type: "object", additionalProperties: true },
        last_user_text: { type: "string", nullable: true },
        last_agent_question: { type: "string", nullable: true },
      },
    },
  },
};

const WORKFLOW_RESULT_SCHEMA = {
  type: "object",
  required: ["ok", "intent", "logs", "run_id", "duration_ms"],
  properties: {
    ok: { type: "boolean" },
    intent: {
      type: "string",
      enum: [
        "create_task",
        "update_task",
        "delete_task",
        "query_data",
        "plan_day",
        "plan_week",
        "detect_risk",
        "reschedule_chain",
      ],
    },
    result: {
      type: "object",
      additionalProperties: true,
      nullable: true,
    },
    logs: {
      type: "array",
      items: {
        type: "object",
        required: ["step", "status", "started_at"],
        properties: {
          step: { type: "string" },
          status: { type: "string", enum: ["running", "success", "failed"] },
          started_at: { type: "string", format: "date-time" },
          finished_at: { type: "string", format: "date-time", nullable: true },
          duration_ms: { type: "integer", nullable: true },
          meta: { type: "object", additionalProperties: true, nullable: true },
          error: { type: "object", additionalProperties: true, nullable: true },
        },
      },
    },
    error: { type: "object", additionalProperties: true, nullable: true },
    run_id: { type: "string", format: "uuid", nullable: true },
    duration_ms: { type: "integer" },
  },
};

export function getOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Schedule Planner API",
      version: "1.0.0",
      description:
        "API docs cho Schedule Planner. Dùng để test Planner API và Agent Intent Router (Phase 2).",
    },
    servers: [{ url: "/", description: "Local server" }],
    paths: {
      "/api/planner": {
        get: {
          summary: "Lấy planner state hiện tại",
          operationId: "getPlannerState",
          responses: {
            "200": {
              description: "Planner state",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PlannerState" },
                },
              },
            },
            "500": {
              description: "Lỗi đọc dữ liệu",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
          },
        },
        put: {
          summary: "Ghi đè planner state",
          operationId: "putPlannerState",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PlannerState" },
              },
            },
          },
          responses: {
            "200": {
              description: "State sau khi lưu",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PlannerState" },
                },
              },
            },
            "400": {
              description: "Payload không hợp lệ",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
            "500": {
              description: "Lỗi ghi dữ liệu",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
          },
        },
      },
      "/api/agent/route": {
        post: {
          summary: "Router intent cho câu user (rule/mistral)",
          operationId: "postAgentRoute",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["text"],
                  properties: {
                    userId: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                      example: "00000000-0000-0000-0000-000000000001",
                    },
                    provider: {
                      type: "string",
                      enum: ["rule", "mistral", "auto"],
                      nullable: true,
                      description:
                        "Chọn engine router. Nếu bỏ trống thì lấy từ ROUTER_PROVIDER hoặc mặc định rule.",
                    },
                    text: {
                      type: "string",
                      example: "Tạo task họp sprint ngày 2026-03-30 lúc 09:00-10:00",
                    },
                    context: {
                      type: "object",
                      nullable: true,
                      description:
                        "Context của turn trước để xử lý follow-up ngắn kiểu 'kéo dài 1 tiếng...'.",
                      properties: {
                        intent: {
                          type: "string",
                          enum: [
                            "create_task",
                            "update_task",
                            "delete_task",
                            "query_data",
                            "set_goal",
                            "plan_day",
                            "plan_week",
                            "detect_risk",
                            "reschedule_chain",
                            "configure_reminder",
                            "connect_messenger",
                          ],
                          nullable: true,
                        },
                        entities: {
                          type: "object",
                          additionalProperties: true,
                          nullable: true,
                        },
                        last_user_text: { type: "string", nullable: true },
                        last_agent_question: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Kết quả classify intent",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RouterResult" },
                },
              },
            },
            "400": {
              description: "Thiếu text hoặc payload lỗi",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
            "500": {
              description: "Lỗi router",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
          },
        },
      },
      "/api/agent/workflow/execute": {
        post: {
          summary: "Execute workflow engine (Phase 3)",
          operationId: "postAgentWorkflowExecute",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId: {
                      type: "string",
                      format: "uuid",
                      nullable: true,
                      example: "00000000-0000-0000-0000-000000000001",
                    },
                    text: {
                      type: "string",
                      nullable: true,
                      example: "Tao task hop sprint ngay mai tu 09:00 den 10:00",
                    },
                    provider: {
                      type: "string",
                      enum: ["rule", "mistral", "auto"],
                      nullable: true,
                    },
                    context: {
                      type: "object",
                      nullable: true,
                      additionalProperties: true,
                    },
                    intent: {
                      type: "string",
                      enum: [
                        "create_task",
                        "update_task",
                        "delete_task",
                        "query_data",
                        "plan_day",
                        "plan_week",
                        "detect_risk",
                        "reschedule_chain",
                      ],
                      nullable: true,
                    },
                    entities: {
                      type: "object",
                      nullable: true,
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Workflow executed or needs clarification",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: true,
                    properties: {
                      ok: { type: "boolean" },
                      stage: { type: "string", nullable: true, enum: ["routing", "workflow"] },
                      route: { $ref: "#/components/schemas/RouterResult" },
                      execution: { $ref: "#/components/schemas/WorkflowResult" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Business validation error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
            "500": {
              description: "System error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorMessage" },
                },
              },
            },
          },
        },
      },
      "/api/openapi": {
        get: {
          summary: "Lấy OpenAPI schema JSON",
          operationId: "getOpenApiDocument",
          responses: {
            "200": {
              description: "OpenAPI document",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: true,
                  },
                },
              },
            },
          },
        },
      },
      "/api/docs": {
        get: {
          summary: "Swagger UI HTML",
          operationId: "getSwaggerHtml",
          responses: {
            "200": {
              description: "HTML page",
              content: {
                "text/html": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        PlannerState: PLANNER_STATE_SCHEMA,
        RouterResult: ROUTER_RESULT_SCHEMA,
        WorkflowResult: WORKFLOW_RESULT_SCHEMA,
        ErrorMessage: {
          type: "object",
          required: ["message"],
          properties: {
            message: { type: "string" },
          },
        },
      },
    },
  };
}
