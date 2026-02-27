# Copilot MCP Tools — VictoriaMetrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add frontend-orchestrated MCP tool calling to the copilot chat so the LLM can query VictoriaMetrics metadata and write/run queries in the UI, with the copilot panel always visible across all pages.

**Architecture:** Frontend acts as MCP client — sends tool definitions to GitHub Copilot API via backend proxy, executes tool calls locally (data tools via backend REST, UI tools directly), loops until final text response. A `useQueryEditor` composable bridges copilot tools to page editors.

**Tech Stack:** Vue 3 + TypeScript (frontend), Go (backend), GitHub Copilot API (LLM)

---

### Task 1: Add VictoriaMetrics metadata methods to the Go datasource client

**Files:**
- Modify: `backend/internal/datasource/victoriametrics.go`

**Step 1: Add Labels, LabelValues, and MetricNames methods**

Add three methods to the existing `VictoriaMetricsClient`:

```go
// MetricNames returns all metric names, optionally filtered by search string.
func (c *VictoriaMetricsClient) MetricNames(ctx context.Context, search string) ([]string, error) {
	reqURL := fmt.Sprintf("%s/api/v1/label/__name__/values", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch metric names: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
		Error  string   `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("VictoriaMetrics error: %s", result.Error)
	}

	if search == "" {
		return result.Data, nil
	}

	var filtered []string
	searchLower := strings.ToLower(search)
	for _, name := range result.Data {
		if strings.Contains(strings.ToLower(name), searchLower) {
			filtered = append(filtered, name)
		}
	}
	return filtered, nil
}

// Labels returns all label names, optionally filtered to a specific metric.
func (c *VictoriaMetricsClient) Labels(ctx context.Context, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/labels", c.baseURL)
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch labels: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
		Error  string   `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("VictoriaMetrics error: %s", result.Error)
	}

	return result.Data, nil
}

// LabelValues returns values for a specific label, optionally filtered to a metric.
func (c *VictoriaMetricsClient) LabelValues(ctx context.Context, label string, metric string) ([]string, error) {
	params := url.Values{}
	if metric != "" {
		params.Set("match[]", metric)
	}

	reqURL := fmt.Sprintf("%s/api/v1/label/%s/values", c.baseURL, url.PathEscape(label))
	if len(params) > 0 {
		reqURL += "?" + params.Encode()
	}

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch label values: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
		Error  string   `json:"error,omitempty"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("VictoriaMetrics error: %s", result.Error)
	}

	return result.Data, nil
}
```

Note: `strings` import is needed — add it to the import block.

**Step 2: Commit**

```bash
git add backend/internal/datasource/victoriametrics.go
git commit -m "feat: add metadata methods to VictoriaMetrics client"
```

---

### Task 2: Add backend handler endpoints for metrics metadata

**Files:**
- Modify: `backend/internal/handlers/datasource.go`
- Modify: `backend/cmd/api/main.go`

**Step 1: Add MetricNames handler method**

Add a new handler method on `DataSourceHandler` after the existing `LabelValues` method (around line 1407). This handles `GET /api/datasources/{id}/metric-names?search=...`:

```go
// MetricNames returns metric names for a datasource (currently VictoriaMetrics and Prometheus)
func (h *DataSourceHandler) MetricNames(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.GetUserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		http.Error(w, `{"error":"invalid datasource id"}`, http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var ds models.DataSource
	err = h.pool.QueryRow(ctx,
		`SELECT id, organization_id, name, type, url, is_default, auth_type, auth_config, trace_id_field, linked_trace_datasource_id, created_at, updated_at
		 FROM datasources WHERE id = $1`, id,
	).Scan(&ds.ID, &ds.OrganizationID, &ds.Name, &ds.Type, &ds.URL, &ds.IsDefault, &ds.AuthType, &ds.AuthConfig, &ds.TraceIDField, &ds.LinkedTraceDatasourceID, &ds.CreatedAt, &ds.UpdatedAt)
	if err != nil {
		http.Error(w, `{"error":"datasource not found"}`, http.StatusNotFound)
		return
	}

	_, err = h.checkOrgMembership(ctx, userID, ds.OrganizationID)
	if err != nil {
		http.Error(w, `{"error":"not a member of this organization"}`, http.StatusForbidden)
		return
	}

	search := r.URL.Query().Get("search")

	var names []string
	switch ds.Type {
	case models.DataSourceVictoriaMetrics:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}
		names, err = client.MetricNames(ctx, search)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch metric names: " + err.Error()})
			return
		}
	case models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}
		names, err = client.MetricNames(ctx, search)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch metric names: " + err.Error()})
			return
		}
	default:
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "metric name discovery is only supported for Prometheus and VictoriaMetrics datasources"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}{
		Status: "success",
		Data:   names,
	})
}
```

**Step 2: Extend existing Labels handler to support VictoriaMetrics**

In the `Labels` method (line ~1277), add VictoriaMetrics cases to the switch statement. Before the `default:` case, add:

```go
	case models.DataSourceVictoriaMetrics, models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		metric := r.URL.Query().Get("metric")
		labels, err = client.Labels(ctx, metric)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch labels: " + err.Error()})
			return
		}
```

Also update the default error message from "label discovery is only supported for log datasources" to "label discovery is not supported for this datasource type".

**Step 3: Extend existing LabelValues handler to support VictoriaMetrics**

In the `LabelValues` method (line ~1364), add VictoriaMetrics cases before `default:`:

```go
	case models.DataSourceVictoriaMetrics, models.DataSourcePrometheus:
		client, err := datasource.NewVictoriaMetricsClient(ds.URL)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to create datasource client: " + err.Error()})
			return
		}

		metric := r.URL.Query().Get("metric")
		values, err = client.LabelValues(ctx, labelName, metric)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ErrorResponse{Status: "error", Error: "failed to fetch label values: " + err.Error()})
			return
		}
```

Also update the default error message similarly.

**Step 4: Register the new route in main.go**

In `backend/cmd/api/main.go`, add the metric-names route after the existing labels routes (after line 197):

```go
	mux.HandleFunc("GET /api/datasources/{id}/metric-names", auth.RequireAuth(jwtManager, dsHandler.MetricNames))
```

**Step 5: Verify it compiles**

Run: `cd /home/janhoon/projects/ace/backend && go build ./...`
Expected: No errors

**Step 6: Commit**

```bash
git add backend/internal/handlers/datasource.go backend/cmd/api/main.go
git commit -m "feat: add metric-names endpoint and extend labels for VictoriaMetrics"
```

---

### Task 3: Add frontend API functions for metrics metadata

**Files:**
- Modify: `frontend/src/api/datasources.ts`

**Step 1: Add fetchDataSourceMetricNames function**

Add after the `fetchDataSourceLabelValues` function (after line 540):

```typescript
export async function fetchDataSourceMetricNames(
  id: string,
  search?: string,
): Promise<string[]> {
  const params = new URLSearchParams()
  if (search) params.set('search', search)
  const qs = params.toString()

  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/metric-names${qs ? `?${qs}` : ''}`,
    { headers: getAuthHeaders() },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch metric names')
  }

  const body = (await response.json()) as LabelsResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch metric names')
  }

  return body.data || []
}
```

**Step 2: Update fetchDataSourceLabels to accept optional metric param**

Replace the existing `fetchDataSourceLabels` function to support a `metric` query param:

```typescript
export async function fetchDataSourceLabels(id: string, metric?: string): Promise<string[]> {
  const params = new URLSearchParams()
  if (metric) params.set('metric', metric)
  const qs = params.toString()

  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/labels${qs ? `?${qs}` : ''}`,
    { headers: getAuthHeaders() },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch labels')
  }

  const body = (await response.json()) as LabelsResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch labels')
  }

  return body.data || []
}
```

**Step 3: Update fetchDataSourceLabelValues to accept optional metric param**

Replace the existing `fetchDataSourceLabelValues` function:

```typescript
export async function fetchDataSourceLabelValues(
  id: string,
  labelName: string,
  metric?: string,
): Promise<string[]> {
  const params = new URLSearchParams()
  if (metric) params.set('metric', metric)
  const qs = params.toString()

  const response = await fetch(
    `${API_BASE}/api/datasources/${id}/labels/${encodeURIComponent(labelName)}/values${qs ? `?${qs}` : ''}`,
    { headers: getAuthHeaders() },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to fetch label values')
  }

  const body = (await response.json()) as LabelsResponse
  if (body.status === 'error') {
    throw new Error(body.error || 'Failed to fetch label values')
  }

  return body.data || []
}
```

**Step 4: Verify it compiles**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/api/datasources.ts`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/api/datasources.ts
git commit -m "feat: add metric-names API function and extend labels with metric filter"
```

---

### Task 4: Create useQueryEditor composable (editor bridge)

**Files:**
- Create: `frontend/src/composables/useQueryEditor.ts`

**Step 1: Create the composable**

```typescript
import { ref } from 'vue'

interface QueryEditorHandle {
  setQuery: (query: string) => void
  execute: () => void
  getQuery: () => string
}

const currentEditor = ref<QueryEditorHandle | null>(null)

export function useQueryEditor() {
  function register(handle: QueryEditorHandle) {
    currentEditor.value = handle
  }

  function unregister() {
    currentEditor.value = null
  }

  function setQuery(query: string): boolean {
    if (!currentEditor.value) return false
    currentEditor.value.setQuery(query)
    return true
  }

  function execute(): boolean {
    if (!currentEditor.value) return false
    currentEditor.value.execute()
    return true
  }

  function getQuery(): string {
    return currentEditor.value?.getQuery() ?? ''
  }

  function hasEditor(): boolean {
    return currentEditor.value !== null
  }

  return {
    register,
    unregister,
    setQuery,
    execute,
    getQuery,
    hasEditor,
  }
}
```

**Step 2: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/composables/useQueryEditor.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/composables/useQueryEditor.ts
git commit -m "feat: add useQueryEditor composable for copilot editor bridge"
```

---

### Task 5: Register Explore.vue with the query editor bridge

**Files:**
- Modify: `frontend/src/views/Explore.vue`

**Step 1: Import and register with useQueryEditor**

In the `<script setup>` block of `Explore.vue`, add the import:

```typescript
import { useQueryEditor } from '../composables/useQueryEditor'
```

Then add near the other composable calls at the top:

```typescript
const queryEditor = useQueryEditor()
```

**Step 2: Register the editor on mount, unregister on unmount**

In the existing `onMounted` (around line 198), add the registration:

```typescript
queryEditor.register({
  setQuery: (q: string) => { query.value = q },
  execute: () => { runQuery() },
  getQuery: () => query.value,
})
```

In the existing `onUnmounted` (around line 369), add:

```typescript
queryEditor.unregister()
```

**Step 3: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/views/Explore.vue`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/views/Explore.vue
git commit -m "feat: register Explore metrics editor with useQueryEditor bridge"
```

---

### Task 6: Update useCopilot to support tool calling loop

**Files:**
- Modify: `frontend/src/composables/useCopilot.ts`

**Step 1: Add tool-related types**

Add after the existing `CopilotModel` interface:

```typescript
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface ToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

type ChatRequestMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls: ToolCall[] }
  | ToolMessage
```

**Step 2: Replace the sendMessage method with a tool-aware version**

Replace the `sendMessage` async generator with `sendChatRequest` — a non-streaming function that returns the full response (needed for tool call parsing). The composable needs to support both streaming text responses and non-streaming tool call responses.

The new approach: switch from SSE streaming to a non-streaming JSON request when tools are present. This is because the tool_calls response format from the Copilot API is a complete JSON response, not streamed deltas.

```typescript
  async function sendChatRequest(
    datasourceType: string,
    datasourceName: string,
    messages: ChatRequestMessage[],
    tools?: ToolDefinition[],
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    const body: Record<string, unknown> = {
      datasource_type: datasourceType,
      datasource_name: datasourceName,
      model: selectedModel.value || undefined,
      messages,
    }
    if (tools && tools.length > 0) {
      body.tools = tools
      body.stream = false
    }

    const response = await fetch(`${API_BASE}/api/copilot/chat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error || `Copilot request failed (${response.status})`)
    }

    const contentType = response.headers.get('content-type') || ''

    // If SSE streaming response (no tools), collect all chunks
    if (contentType.includes('text/event-stream')) {
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6))
              const content = json.choices?.[0]?.delta?.content
              if (content) fullContent += content
            } catch {
              // skip malformed
            }
          }
        }
      }

      return { content: fullContent, toolCalls: [] }
    }

    // JSON response (with tools)
    const data = await response.json()
    const choice = data.choices?.[0]
    if (!choice) throw new Error('No response from model')

    return {
      content: choice.message?.content ?? null,
      toolCalls: choice.message?.tool_calls ?? [],
    }
  }
```

Keep the existing `sendMessage` streaming generator for backwards compatibility (the CopilotPanel still uses it for non-tool-calling messages when the model just streams text). But also export `sendChatRequest` for the tool loop.

**Step 3: Export the new function**

Add `sendChatRequest` to the return object of `useCopilot()`.

**Step 4: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/composables/useCopilot.ts`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/composables/useCopilot.ts
git commit -m "feat: add sendChatRequest with tool calling support to useCopilot"
```

---

### Task 7: Update backend Chat handler to pass through tools and support non-streaming

**Files:**
- Modify: `backend/internal/handlers/github_copilot.go`

**Step 1: Update copilotChatRequest struct**

Replace the existing `copilotChatRequest` struct to include tools and stream flag:

```go
type copilotChatRequest struct {
	DatasourceType string        `json:"datasource_type"`
	DatasourceName string        `json:"datasource_name"`
	Model          string        `json:"model,omitempty"`
	Messages       []interface{} `json:"messages"`
	Tools          []interface{} `json:"tools,omitempty"`
	Stream         *bool         `json:"stream,omitempty"`
}
```

Note: `Messages` changes from `[]chatMessage` to `[]interface{}` so it can pass through tool call messages and tool result messages transparently.

**Step 2: Update the Chat handler to pass through tools and respect stream flag**

In the `Chat` method, update the body construction (around line 703) to include tools and respect the stream flag:

```go
	shouldStream := true
	if req.Stream != nil {
		shouldStream = *req.Stream
	}

	body := map[string]interface{}{
		"model":    model,
		"stream":   shouldStream,
		"messages": messages,
	}
	if len(req.Tools) > 0 {
		body["tools"] = req.Tools
	}
```

Where `messages` is built: the current code creates `[]chatMessage` and prepends the system prompt. Since messages is now `[]interface{}`, update the message building to:

```go
	messages := make([]interface{}, 0, len(req.Messages)+1)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	messages = append(messages, req.Messages...)
```

**Step 3: Handle non-streaming response**

After the Copilot API call, check if the response is streaming or JSON. If non-streaming, just proxy the JSON directly:

```go
	if !shouldStream {
		// Non-streaming: proxy JSON response directly
		w.Header().Set("Content-Type", "application/json")
		io.Copy(w, resp.Body)
		return
	}

	// Stream the response back (existing code)
	w.Header().Set("Content-Type", "text/event-stream")
	// ... rest of existing streaming code
```

**Step 4: Verify it compiles**

Run: `cd /home/janhoon/projects/ace/backend && go build ./...`
Expected: No errors

**Step 5: Commit**

```bash
git add backend/internal/handlers/github_copilot.go
git commit -m "feat: pass through tools and support non-streaming in copilot chat handler"
```

---

### Task 8: Build the MCP tool definitions and executor

**Files:**
- Create: `frontend/src/composables/useCopilotTools.ts`

**Step 1: Create the tool definitions and execution logic**

```typescript
import { useRouter } from 'vue-router'
import {
  fetchDataSourceLabels,
  fetchDataSourceLabelValues,
  fetchDataSourceMetricNames,
} from '../api/datasources'
import type { ToolCall, ToolDefinition } from './useCopilot'
import { useQueryEditor } from './useQueryEditor'

export function getVictoriaMetricsTools(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_metrics',
        description:
          'List available metric names from VictoriaMetrics. Use this to discover what metrics exist before writing a query.',
        parameters: {
          type: 'object',
          properties: {
            search: {
              type: 'string',
              description: 'Optional search filter to narrow down metric names',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_labels',
        description:
          'List available label names from VictoriaMetrics. Optionally filter to labels for a specific metric.',
        parameters: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              description: 'Optional metric name to filter labels for',
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_label_values',
        description:
          'List values for a specific label from VictoriaMetrics. Optionally filter to values for a specific metric.',
        parameters: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: 'The label name to get values for (required)',
            },
            metric: {
              type: 'string',
              description: 'Optional metric name to filter label values for',
            },
          },
          required: ['label'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'write_query',
        description:
          'Write a MetricsQL query into the query editor on the current page. The user can then review it before running.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The MetricsQL query expression to write',
            },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_query',
        description:
          'Execute the query currently in the editor. Use after write_query to run the query and show results to the user.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ]
}

export function useCopilotToolExecutor(datasourceId: () => string) {
  const queryEditor = useQueryEditor()
  const router = useRouter()

  async function executeTool(
    toolCall: ToolCall,
  ): Promise<string> {
    const args = JSON.parse(toolCall.function.arguments || '{}')
    const dsId = datasourceId()

    switch (toolCall.function.name) {
      case 'get_metrics': {
        const metrics = await fetchDataSourceMetricNames(dsId, args.search)
        if (metrics.length === 0) return 'No metrics found'
        if (metrics.length > 100) {
          return `Found ${metrics.length} metrics. Showing first 100:\n${metrics.slice(0, 100).join('\n')}`
        }
        return metrics.join('\n')
      }

      case 'get_labels': {
        const labels = await fetchDataSourceLabels(dsId, args.metric)
        if (labels.length === 0) return 'No labels found'
        return labels.join('\n')
      }

      case 'get_label_values': {
        if (!args.label) return 'Error: label parameter is required'
        const values = await fetchDataSourceLabelValues(dsId, args.label, args.metric)
        if (values.length === 0) return `No values found for label "${args.label}"`
        if (values.length > 100) {
          return `Found ${values.length} values for "${args.label}". Showing first 100:\n${values.slice(0, 100).join('\n')}`
        }
        return values.join('\n')
      }

      case 'write_query': {
        if (!args.query) return 'Error: query parameter is required'
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query)
          return `Query written to editor: ${args.query}`
        }
        // Navigate to explore and write after navigation
        await router.push('/app/explore/metrics')
        // Wait for the editor to register after navigation
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (queryEditor.hasEditor()) {
          queryEditor.setQuery(args.query)
          return `Navigated to Explore and wrote query: ${args.query}`
        }
        return `Navigated to Explore but editor not ready. Query: ${args.query}`
      }

      case 'run_query': {
        if (queryEditor.hasEditor()) {
          queryEditor.execute()
          return 'Query executed'
        }
        return 'No query editor available to execute'
      }

      default:
        return `Unknown tool: ${toolCall.function.name}`
    }
  }

  return { executeTool }
}
```

**Step 2: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/composables/useCopilotTools.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/composables/useCopilotTools.ts
git commit -m "feat: add MCP tool definitions and executor for VictoriaMetrics"
```

---

### Task 9: Update CopilotPanel to use the tool calling loop

**Files:**
- Modify: `frontend/src/components/CopilotPanel.vue`

**Step 1: Update imports and props**

Replace `CopilotMessage` import to also import `ToolCall`:

```typescript
import { type CopilotMessage, type ToolCall, useCopilot } from '../composables/useCopilot'
```

Add imports for the tool composables:

```typescript
import { getVictoriaMetricsTools, useCopilotToolExecutor } from '../composables/useCopilotTools'
```

Update props — remove `onInsertQuery` since tools handle query insertion now. Add `datasourceId`:

```typescript
const props = defineProps<{
  datasourceType: string
  datasourceName: string
  datasourceId: string
}>()
```

Remove the `emit('close')` and the close emits definition (the panel is now always visible, controlled by parent toggle).

**Step 2: Set up tool executor**

Add after destructuring useCopilot:

```typescript
const { executeTool } = useCopilotToolExecutor(() => props.datasourceId)
```

**Step 3: Replace handleSend with tool-calling loop**

Replace the `handleSend` function with a version that uses `sendChatRequest` and loops on tool calls:

```typescript
const MAX_TOOL_ITERATIONS = 10

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  inputText.value = ''
  messages.value.push({ role: 'user', content: text })
  messages.value.push({ role: 'assistant', content: '' })
  const assistantIndex = messages.value.length - 1
  const assistantMsg = messages.value[assistantIndex]!

  const tools = props.datasourceType === 'victoriametrics'
    ? getVictoriaMetricsTools()
    : undefined

  // If no tools, use streaming as before
  if (!tools) {
    const chatMessages = messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))
    const generator = sendMessage(props.datasourceType, props.datasourceName, chatMessages)
    for await (const chunk of generator) {
      assistantMsg.content += chunk
    }
    if (error.value) {
      assistantMsg.content = assistantMsg.content || `Error: ${error.value}`
    }
    return
  }

  // Tool-calling loop
  isLoading.value = true
  error.value = null
  const chatHistory: Array<Record<string, unknown>> = messages.value.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }))

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const result = await sendChatRequest(
        props.datasourceType,
        props.datasourceName,
        chatHistory as Parameters<typeof sendChatRequest>[2],
        tools,
      )

      if (result.toolCalls.length === 0) {
        // Final text response
        assistantMsg.content = result.content || ''
        break
      }

      // Append the assistant message with tool calls to history
      chatHistory.push({
        role: 'assistant',
        content: result.content,
        tool_calls: result.toolCalls,
      })

      // Execute each tool call and append results
      for (const toolCall of result.toolCalls) {
        let toolResult: string
        try {
          toolResult = await executeTool(toolCall)
        } catch (e) {
          toolResult = `Error: ${e instanceof Error ? e.message : 'Tool execution failed'}`
        }
        chatHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        })
      }

      // Show progress in the UI
      const toolNames = result.toolCalls.map((tc) => tc.function.name).join(', ')
      assistantMsg.content += assistantMsg.content ? `\n\nUsing tools: ${toolNames}...` : `Using tools: ${toolNames}...`
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send message'
    assistantMsg.content = assistantMsg.content || `Error: ${error.value}`
  } finally {
    isLoading.value = false
  }
}
```

Also destructure `sendChatRequest` from useCopilot:

```typescript
const {
  // ... existing destructures
  sendChatRequest,
} = useCopilot()
```

**Step 4: Remove the Insert Query button and handleInsertQuery/extractCodeBlock/hasCodeBlock**

These are no longer needed — the `write_query` tool handles query insertion. Remove:
- `extractCodeBlock` function
- `handleInsertQuery` function
- `hasCodeBlock` function
- The "Insert query" button from the template

**Step 5: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/components/CopilotPanel.vue`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/components/CopilotPanel.vue
git commit -m "feat: add tool calling loop to CopilotPanel for VictoriaMetrics MCP"
```

---

### Task 10: Move CopilotPanel to app-level layout

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/views/Explore.vue`

**Step 1: Add CopilotPanel to App.vue**

Import the necessary composables and components:

```typescript
import { Sparkles } from 'lucide-vue-next'
import CopilotPanel from './components/CopilotPanel.vue'
import { useCopilot } from './composables/useCopilot'
import { useDatasource } from './composables/useDatasource'
import { useOrganization } from './composables/useOrganization'
```

Add state for copilot visibility and datasource context:

```typescript
const showCopilot = ref(false)
const { isConnected, hasCopilot } = useCopilot()
const { currentOrg } = useOrganization()
const { metricsDatasources, fetchDatasources } = useDatasource()
```

Add a computed for the active/default datasource:

```typescript
const copilotDatasource = computed(() => {
  const sources = metricsDatasources.value
  if (sources.length === 0) return null
  return sources.find((ds) => ds.is_default) || sources[0]
})
```

Watch org changes to fetch datasources:

```typescript
watch(() => currentOrg.value?.id, (orgId) => {
  if (orgId) fetchDatasources(orgId)
}, { immediate: true })
```

**Step 2: Update App.vue template**

Add a copilot toggle button in a top-right area and the CopilotPanel as a right sidebar:

```html
<template>
  <div class="relative flex min-h-screen w-full" :class="{ 'block': !showSidebar }">
    <Sidebar v-if="showSidebar" ref="sidebarRef" />
    <main
      class="min-h-screen flex-1 bg-surface-base transition-[margin-left] duration-200"
      :style="mainMargin"
    >
      <RouterView />
    </main>
    <CopilotPanel
      v-if="showCopilot && showSidebar && isConnected && hasCopilot && copilotDatasource"
      :datasource-type="copilotDatasource.type"
      :datasource-name="copilotDatasource.name"
      :datasource-id="copilotDatasource.id"
      @close="showCopilot = false"
    />
    <!-- Copilot toggle button (fixed position, bottom-right) -->
    <button
      v-if="showSidebar"
      class="fixed bottom-6 right-6 z-50 flex items-center justify-center h-12 w-12 rounded-full shadow-lg cursor-pointer border-none transition"
      :class="showCopilot ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface-raised text-text-secondary border border-border hover:bg-surface-overlay hover:text-text-primary'"
      @click="showCopilot = !showCopilot"
      title="Toggle AI assistant"
    >
      <Sparkles :size="20" />
    </button>
    <CookieConsentBanner />
  </div>
</template>
```

**Step 3: Remove CopilotPanel from Explore.vue**

In `Explore.vue`:
- Remove the CopilotPanel import
- Remove the `showCopilot` ref
- Remove the AI toggle button from the header
- Remove the `<CopilotPanel v-if="showCopilot" .../>` from the template

**Step 4: Verify lint passes**

Run: `cd /home/janhoon/projects/ace/frontend && npx biome check src/App.vue src/views/Explore.vue`
Expected: No errors

**Step 5: Commit**

```bash
git add frontend/src/App.vue frontend/src/views/Explore.vue
git commit -m "feat: move copilot panel to app-level layout for global visibility"
```

---

### Task 11: End-to-end manual testing

**Step 1: Start the dev environment**

Run: `cd /home/janhoon/projects/ace && make dev` (or however the local dev environment starts)

**Step 2: Verify copilot panel visibility**

- Navigate to different pages (Dashboards, Explore, Settings)
- Confirm the copilot toggle button is visible on all authenticated pages
- Confirm the panel opens/closes and persists across route changes

**Step 3: Verify tool calling with VictoriaMetrics**

- Select a VictoriaMetrics datasource
- Open the copilot panel
- Ask "What metrics are available?"
- Verify the model calls `get_metrics` and returns results
- Ask "Show me CPU usage over the last hour"
- Verify the model calls `write_query` to insert a query and `run_query` to execute it
- Verify the query appears in the Explore editor and results are displayed

**Step 4: Verify non-VM datasources still work**

- Switch to a Prometheus datasource
- Ask a question in the copilot
- Verify it uses the regular streaming text response (no tools)

**Step 5: Verify navigation context**

- Be on the Settings page with copilot open
- Ask "Write a query for node_cpu_seconds_total"
- Verify the `write_query` tool navigates to Explore and inserts the query
