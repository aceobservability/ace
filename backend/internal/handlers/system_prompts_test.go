package handlers

import (
	"strings"
	"testing"
)

func TestSystemPromptsContainExpectedDatasources(t *testing.T) {
	expectedTypes := []string{
		"prometheus",
		"victoriametrics",
		"loki",
		"elasticsearch",
		"tempo",
	}

	for _, dsType := range expectedTypes {
		t.Run(dsType, func(t *testing.T) {
			if _, ok := SystemPrompts[dsType]; !ok {
				t.Errorf("SystemPrompts missing expected datasource type %q", dsType)
			}
		})
	}
}

func TestPrometheusPromptMentionsPromQL(t *testing.T) {
	prompt, ok := SystemPrompts["prometheus"]
	if !ok {
		t.Fatal("SystemPrompts missing prometheus entry")
	}
	if !strings.Contains(prompt, "PromQL") {
		t.Errorf("prometheus prompt does not mention PromQL; got: %q", prompt)
	}
}

func TestDefaultSystemPromptNotEmpty(t *testing.T) {
	if DefaultSystemPrompt == "" {
		t.Error("DefaultSystemPrompt must not be empty")
	}
}
