NAMESPACE = 'ace-local'
CHART_PATH = './deploy/charts/ace-local-infra'

optional_resources = [
    'prometheus',
    'loki',
    'victoria-metrics',
    'victoria-logs',
    'victoria-traces',
    'tempo',
    'otel-collector',
    'grafana',
    'telemetrygen',
    'elasticsearch',
    'clickhouse',
    'alertmanager',
    'vmalert',
]

config.define_string_list('enable', args=True)
cfg = config.parse()

requested = cfg.get('enable', [])
unknown = [name for name in requested if name not in optional_resources]
if len(unknown) > 0:
    fail('Unsupported values for --enable: {}. Supported: {}'.format(', '.join(unknown), ', '.join(optional_resources)))

enabled_resources = ['namespace', 'postgres', 'valkey', 'backend', 'frontend']
for name in optional_resources:
    if name in requested:
        enabled_resources.append(name)

config.set_enabled_resources(enabled_resources)

# Colima with k3s shares the Docker daemon, so images built locally are already
# available to the cluster. allow_k8s_contexts permits Tilt to deploy to it.
allow_k8s_contexts('colima')

docker_build(
    'ace-backend',
    '.',
    dockerfile='backend/Dockerfile',
)

docker_build(
    'ace-telemetrygen',
    'backend',
    dockerfile='backend/cmd/seed-correlated/Dockerfile',
)

local_resource(
    'namespace',
    cmd='kubectl create namespace ace-local --dry-run=client -o yaml | kubectl apply -f -',
    labels=['infra'],
)


def deploy_chart_resource(resource_name, values_key, port_forwards=None, labels=None, resource_deps=None):
    if port_forwards == None:
        port_forwards = []
    if labels == None:
        labels = ['infra']
    if resource_deps == None:
        resource_deps = ['namespace']

    rendered = helm(
        CHART_PATH,
        name='ace-local-{}'.format(resource_name),
        namespace=NAMESPACE,
        set=['{}.enabled=true'.format(values_key)],
    )
    k8s_yaml(rendered)
    k8s_resource(
        resource_name,
        labels=labels,
        port_forwards=port_forwards,
        resource_deps=resource_deps,
    )


deploy_chart_resource('postgres', 'postgres', ['5432:5432'])
deploy_chart_resource('valkey', 'valkey', ['6379:6379'])
deploy_chart_resource('prometheus', 'prometheus', ['9090:9090'])
deploy_chart_resource('loki', 'loki', ['3100:3100'])
deploy_chart_resource('victoria-metrics', 'victoriaMetrics', ['8428:8428'])
deploy_chart_resource('victoria-logs', 'victoriaLogs', ['9428:9428'])
deploy_chart_resource('victoria-traces', 'victoriaTraces', ['10428:10428'])
deploy_chart_resource('tempo', 'tempo', ['3200:3200'])
# otel-collector needs to know which datasource services are enabled
# so its config template can generate the right exporters and pipelines.
otel_set = ['otelCollector.enabled=true']
datasource_values_map = {
    'victoria-metrics': 'victoriaMetrics',
    'victoria-logs': 'victoriaLogs',
    'victoria-traces': 'victoriaTraces',
    'prometheus': 'prometheus',
    'loki': 'loki',
    'tempo': 'tempo',
    'elasticsearch': 'elasticsearch',
    'clickhouse': 'clickhouse',
}
for res_name, val_key in datasource_values_map.items():
    if res_name in requested:
        otel_set.append('{}.enabled=true'.format(val_key))

otel_rendered = helm(
    CHART_PATH,
    name='ace-local-otel-collector',
    namespace=NAMESPACE,
    set=otel_set,
)
# Filter to only otel-collector resources (the render also outputs other enabled services)
otel_filtered = []
for obj in decode_yaml_stream(otel_rendered):
    name = obj.get('metadata', {}).get('name', '')
    if 'otel-collector' in name:
        otel_filtered.append(encode_yaml(obj))
k8s_yaml(otel_filtered)
k8s_resource(
    'otel-collector',
    labels=['infra'],
    port_forwards=['4317:4317', '4318:4318'],
    resource_deps=['namespace'],
)
deploy_chart_resource('grafana', 'grafana', ['3000:3000'])
deploy_chart_resource('telemetrygen', 'telemetrygen', [])
deploy_chart_resource('elasticsearch', 'elasticsearch', ['9200:9200'])
deploy_chart_resource('clickhouse', 'clickhouse', ['8123:8123', '9000:9000'])
deploy_chart_resource('alertmanager', 'alertmanager', ['9093:9093'])
deploy_chart_resource('vmalert', 'vmalert', ['8880:8880'])
deploy_chart_resource(
    'backend',
    'backend',
    ['8080:8080'],
    labels=['app'],
    resource_deps=['namespace', 'postgres', 'valkey'],
)

local_resource(
    'frontend',
    serve_cmd='make frontend',
    resource_deps=['backend'],
    labels=['app'],
    links=['http://localhost:5173'],
)
