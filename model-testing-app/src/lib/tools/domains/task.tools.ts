import type { AtomicTool } from "../types";

export const TASK_TOOLS: AtomicTool[] = [
  // -------------------------------------------------------------------------
  // READ
  // -------------------------------------------------------------------------
  {
    name: "getTasks",
    domain: "task",
    action: "read",
    description:
      "Get user's tasks with optional filters for status, client, or project.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["todo", "in_progress", "completed", "cancelled"],
          description: "Filter tasks by status",
        },
        clientId: { type: "string", description: "Filter by client ID" },
        projectId: { type: "string", description: "Filter by project ID" },
      },
      required: [],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "tasks.getByUser" },
    contextRelevance: ["task", "client", "project"],
  },
  {
    name: "getTask",
    domain: "task",
    action: "read",
    description: "Get a specific task by its ID.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The ID of the task" },
      },
      required: ["taskId"],
    },
    requiresConfirmation: false,
    convexMapping: { type: "query", path: "tasks.get" },
    contextRelevance: ["task"],
  },

  // -------------------------------------------------------------------------
  // WRITE
  // -------------------------------------------------------------------------
  {
    name: "createTask",
    domain: "task",
    action: "write",
    description:
      "Create a new task with optional due date, priority, and client/project link.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title (required)" },
        description: { type: "string", description: "Task description" },
        notes: { type: "string", description: "Additional notes" },
        dueDate: {
          type: "string",
          description: "Due date (ISO timestamp)",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Task priority (default: medium)",
        },
        tags: {
          type: "string",
          description: "Comma-separated tags",
        },
        clientId: { type: "string", description: "Link to a client" },
        projectId: { type: "string", description: "Link to a project" },
        assignedTo: {
          type: "string",
          description: "User ID to assign the task to",
        },
      },
      required: ["title"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "tasks.create" },
    contextRelevance: ["task", "client", "project"],
  },
  {
    name: "updateTask",
    domain: "task",
    action: "write",
    description: "Update a task's title, description, status, priority, due date, etc.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The ID of the task to update" },
        title: { type: "string", description: "Updated title" },
        description: { type: "string", description: "Updated description" },
        notes: { type: "string", description: "Updated notes" },
        dueDate: { type: "string", description: "Updated due date (ISO timestamp)" },
        status: {
          type: "string",
          enum: ["todo", "in_progress", "completed", "cancelled"],
          description: "Updated status",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "urgent"],
          description: "Updated priority",
        },
        clientId: { type: "string", description: "Updated client link" },
        projectId: { type: "string", description: "Updated project link" },
      },
      required: ["taskId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "tasks.update" },
    contextRelevance: ["task"],
  },
  {
    name: "completeTask",
    domain: "task",
    action: "write",
    description: "Mark a task as completed.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The ID of the task to complete" },
      },
      required: ["taskId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "tasks.complete" },
    contextRelevance: ["task"],
  },

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  {
    name: "deleteTask",
    domain: "task",
    action: "delete",
    description: "Delete a task.",
    parameters: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "The ID of the task to delete" },
      },
      required: ["taskId"],
    },
    requiresConfirmation: true,
    convexMapping: { type: "mutation", path: "tasks.remove" },
    contextRelevance: ["task"],
  },
];
