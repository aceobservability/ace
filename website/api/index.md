---
title: API Overview
---

# API Reference

Ace exposes a REST API at `http://localhost:8080/api`.

## Authentication

Most endpoints require a Bearer JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Obtain tokens via `POST /api/auth/login` or `POST /api/auth/register`. Tokens expire after 15 minutes. Use `POST /api/auth/refresh` with a refresh token to obtain a new access token.

## Organization scope

Many endpoints are scoped to an organization. These use path parameters like `/api/orgs/{orgId}/...`. The authenticated user must be a member of the organization to access these resources.

## Error format

Errors return a JSON body with an `error` field:

```json
{
  "error": "descriptive error message"
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 400  | Bad request (validation error, malformed input) |
| 401  | Unauthorized (missing or invalid token) |
| 403  | Forbidden (insufficient permissions) |
| 404  | Resource not found |
| 409  | Conflict (duplicate resource) |
| 429  | Rate limited |
| 500  | Internal server error |

## Routes

See the [full route reference](/api/routes) for all available endpoints.
