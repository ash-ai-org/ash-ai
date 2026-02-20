---
sidebar_position: 2
title: Agents
---

# Agents

Agents are the deployable units in Ash. An agent is a directory on disk that contains a `CLAUDE.md` file and optional configuration. Deploying an agent registers it with the server so sessions can be created against it.

Deploying the same agent name again performs an upsert: the path is updated and the version is incremented.

## Agent Type

```typescript
interface Agent {
  id: string;          // UUID
  name: string;        // Unique agent name
  tenantId: string;    // Tenant that owns this agent
  version: number;     // Auto-incremented on each deploy
  path: string;        // Absolute path to agent directory on server
  createdAt: string;   // ISO 8601 timestamp
  updatedAt: string;   // ISO 8601 timestamp
}
```

---

## Deploy Agent

```
POST /api/agents
```

Registers or updates an agent. The agent directory must contain a `CLAUDE.md` file. If an agent with the same name already exists for this tenant, it is updated (upserted) and its version is incremented.

Relative paths are resolved against the server's data directory.

### Request

```json
{
  "name": "qa-bot",
  "path": "/home/user/agents/qa-bot"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Unique name for the agent |
| `path` | string | Yes | Path to the agent directory (must contain `CLAUDE.md`) |

### Response

**201 Created**

```json
{
  "agent": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "qa-bot",
    "tenantId": "default",
    "version": 1,
    "path": "/home/user/agents/qa-bot",
    "createdAt": "2025-06-15T10:30:00.000Z",
    "updatedAt": "2025-06-15T10:30:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `400` | Missing `name` or `path`, or directory does not contain `CLAUDE.md` |

```json
{
  "error": "Agent directory must contain CLAUDE.md",
  "statusCode": 400
}
```

---

## List Agents

```
GET /api/agents
```

Returns all agents belonging to the authenticated tenant.

### Request

No request body. No query parameters.

### Response

**200 OK**

```json
{
  "agents": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "qa-bot",
      "tenantId": "default",
      "version": 2,
      "path": "/home/user/agents/qa-bot",
      "createdAt": "2025-06-15T10:30:00.000Z",
      "updatedAt": "2025-06-16T14:00:00.000Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "name": "code-reviewer",
      "tenantId": "default",
      "version": 1,
      "path": "/home/user/agents/code-reviewer",
      "createdAt": "2025-06-16T09:00:00.000Z",
      "updatedAt": "2025-06-16T09:00:00.000Z"
    }
  ]
}
```

---

## Get Agent

```
GET /api/agents/:name
```

Returns a single agent by name.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Agent name |

### Response

**200 OK**

```json
{
  "agent": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "qa-bot",
    "tenantId": "default",
    "version": 2,
    "path": "/home/user/agents/qa-bot",
    "createdAt": "2025-06-15T10:30:00.000Z",
    "updatedAt": "2025-06-16T14:00:00.000Z"
  }
}
```

### Errors

| Status | Condition |
|---|---|
| `404` | Agent with the given name does not exist for this tenant |

```json
{
  "error": "Agent not found",
  "statusCode": 404
}
```

---

## Delete Agent

```
DELETE /api/agents/:name
```

Removes an agent registration. This does not terminate any active sessions using this agent.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Agent name |

### Response

**200 OK**

```json
{
  "ok": true
}
```

### Errors

| Status | Condition |
|---|---|
| `404` | Agent with the given name does not exist for this tenant |

```json
{
  "error": "Agent not found",
  "statusCode": 404
}
```
