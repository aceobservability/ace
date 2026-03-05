{{/*
Expand the name of the chart.
*/}}
{{- define "ace.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "ace.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ace.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "ace.labels" -}}
helm.sh/chart: {{ include "ace.chart" . }}
{{ include "ace.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "ace.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ace.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend labels.
*/}}
{{- define "ace.backend.labels" -}}
{{ include "ace.labels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{- define "ace.backend.selectorLabels" -}}
{{ include "ace.selectorLabels" . }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Frontend labels.
*/}}
{{- define "ace.frontend.labels" -}}
{{ include "ace.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{- define "ace.frontend.selectorLabels" -}}
{{ include "ace.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "ace.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ace.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database URL — built from subchart values or external config.
*/}}
{{- define "ace.databaseURL" -}}
{{- if .Values.externalDatabase.url }}
{{- .Values.externalDatabase.url }}
{{- else }}
{{- printf "postgres://%s:$(DATABASE_PASSWORD)@%s-postgresql:5432/%s?sslmode=disable" .Values.postgresql.auth.username (include "ace.fullname" .) .Values.postgresql.auth.database }}
{{- end }}
{{- end }}

{{/*
Valkey (Redis) URL.
*/}}
{{- define "ace.valkeyURL" -}}
{{- .Values.backend.valkey.url | default "" }}
{{- end }}

{{/*
OTLP endpoint for the backend to send traces.
*/}}
{{- define "ace.otlpEndpoint" -}}
{{- if .Values.backend.otlp.endpoint }}
{{- .Values.backend.otlp.endpoint }}
{{- else if .Values.victoriatraces.enabled }}
{{- printf "http://%s-vtraces-victoria-metrics-single-server:4318" (include "ace.fullname" .) }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}

{{/*
VictoriaMetrics query URL (for PROMETHEUS_URL env var).
*/}}
{{- define "ace.prometheusURL" -}}
{{- if .Values.backend.prometheus.url }}
{{- .Values.backend.prometheus.url }}
{{- else if (index .Values "victoria-metrics-k8s-stack" "enabled") }}
{{- printf "http://%s-vmetrics-victoria-metrics-k8s-stack-vmsingle:8429" (include "ace.fullname" .) }}
{{- else }}
{{- "http://localhost:9090" }}
{{- end }}
{{- end }}

{{/*
VictoriaLogs query URL (for backend datasource config).
*/}}
{{- define "ace.victoriaLogsURL" -}}
{{- if .Values.backend.victoriaLogs.url }}
{{- .Values.backend.victoriaLogs.url }}
{{- else if (index .Values "victoria-logs-single" "enabled") }}
{{- printf "http://%s-vlogs-victoria-logs-single-server:9428" (include "ace.fullname" .) }}
{{- else }}
{{- "" }}
{{- end }}
{{- end }}

{{/*
Image pull secrets helper.
*/}}
{{- define "ace.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}
