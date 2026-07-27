import type { TraceDatasource } from '@/types/datasource'
import {
  type AuthFields,
  type AuthType,
  type PatchAuth,
  inputClass,
  labelClass,
  sectionClass,
  selectClass,
} from '@/components/datasourceForm/formShared'

export type DataSourceTypeSectionsProps = {
  saveLoading: boolean
  isCloudWatchType: boolean
  isClickHouseType: boolean
  isElasticsearchType: boolean
  showLogCorrelation: boolean
  showAuthSettings: boolean
  authFields: AuthFields
  patchAuth: PatchAuth
  traceDatasources: TraceDatasource[]
}

export function DataSourceTypeSections({
  saveLoading,
  isCloudWatchType,
  isClickHouseType,
  isElasticsearchType,
  showLogCorrelation,
  showAuthSettings,
  authFields,
  patchAuth,
  traceDatasources,
}: DataSourceTypeSectionsProps) {
  return (
    <>
          {isCloudWatchType ? (
            <section className={sectionClass}>
              <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                CloudWatch Settings
              </h2>
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <div className="mb-4">
                  <label htmlFor="ds-cloudwatch-region" className={labelClass}>
                    AWS Region <span className="text-[var(--color-error)]">*</span>
                  </label>
                  <input
                    id="ds-cloudwatch-region"
                    data-testid="ds-cloudwatch-region-input"
                    value={authFields.cloudWatchRegion}
                    onChange={e => patchAuth({ cloudWatchRegion: e.target.value })}
                    type="text"
                    placeholder="us-east-1"
                    disabled={saveLoading}
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="ds-cloudwatch-namespace" className={labelClass}>
                    Metric Namespace (optional)
                  </label>
                  <input
                    id="ds-cloudwatch-namespace"
                    value={authFields.cloudWatchMetricNamespace}
                    onChange={e => patchAuth({ cloudWatchMetricNamespace: e.target.value })}
                    type="text"
                    placeholder="AWS/ECS"
                    disabled={saveLoading}
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label htmlFor="ds-cloudwatch-log-group" className={labelClass}>
                  Default Log Group (optional)
                </label>
                <input
                  id="ds-cloudwatch-log-group"
                  value={authFields.cloudWatchLogGroup}
                  onChange={e => patchAuth({ cloudWatchLogGroup: e.target.value })}
                  type="text"
                  placeholder="/aws/lambda/my-function"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
              <div className="mt-4 rounded-lg bg-[var(--color-surface-container-high)] p-4">
                <h3 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                  AWS Credentials (optional)
                </h3>
                <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                  <div className="mb-4">
                    <label htmlFor="ds-cloudwatch-access-key" className={labelClass}>
                      Access Key ID
                    </label>
                    <input
                      id="ds-cloudwatch-access-key"
                      value={authFields.cloudWatchAccessKeyId}
                      onChange={e => patchAuth({ cloudWatchAccessKeyId: e.target.value })}
                      type="text"
                      disabled={saveLoading}
                      autoComplete="off"
                      className={inputClass}
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="ds-cloudwatch-secret-key" className={labelClass}>
                      Secret Access Key
                    </label>
                    <input
                      id="ds-cloudwatch-secret-key"
                      value={authFields.cloudWatchSecretAccessKey}
                      onChange={e => patchAuth({ cloudWatchSecretAccessKey: e.target.value })}
                      type="password"
                      disabled={saveLoading}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="mb-0">
                  <label htmlFor="ds-cloudwatch-session-token" className={labelClass}>
                    Session Token
                  </label>
                  <input
                    id="ds-cloudwatch-session-token"
                    value={authFields.cloudWatchSessionToken}
                    onChange={e => patchAuth({ cloudWatchSessionToken: e.target.value })}
                    type="password"
                    disabled={saveLoading}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {isClickHouseType ? (
            <section className={sectionClass}>
              <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                ClickHouse Settings
              </h2>
              <div className="mb-0">
                <label htmlFor="ds-database" className={labelClass}>
                  Database (optional)
                </label>
                <input
                  id="ds-database"
                  data-testid="ds-database-input"
                  value={authFields.database}
                  onChange={e => patchAuth({ database: e.target.value })}
                  type="text"
                  placeholder="default"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
            </section>
          ) : null}

          {isElasticsearchType ? (
            <section className={sectionClass}>
              <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                Elasticsearch Settings
              </h2>
              <div className="mb-4">
                <label htmlFor="ds-elasticsearch-index" className={labelClass}>
                  Default Index Pattern (optional)
                </label>
                <input
                  id="ds-elasticsearch-index"
                  data-testid="ds-elasticsearch-index-input"
                  value={authFields.elasticsearchIndex}
                  onChange={e => patchAuth({ elasticsearchIndex: e.target.value })}
                  type="text"
                  placeholder="logs-*"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                <div className="mb-4">
                  <label htmlFor="ds-elasticsearch-time-field" className={labelClass}>
                    Timestamp Field (optional)
                  </label>
                  <input
                    id="ds-elasticsearch-time-field"
                    value={authFields.elasticsearchTimestampField}
                    onChange={e => patchAuth({ elasticsearchTimestampField: e.target.value })}
                    type="text"
                    placeholder="@timestamp"
                    disabled={saveLoading}
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="ds-elasticsearch-message-field" className={labelClass}>
                    Message Field (optional)
                  </label>
                  <input
                    id="ds-elasticsearch-message-field"
                    value={authFields.elasticsearchMessageField}
                    onChange={e => patchAuth({ elasticsearchMessageField: e.target.value })}
                    type="text"
                    placeholder="message"
                    disabled={saveLoading}
                    autoComplete="off"
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="mb-0">
                <label htmlFor="ds-elasticsearch-level-field" className={labelClass}>
                  Level Field (optional)
                </label>
                <input
                  id="ds-elasticsearch-level-field"
                  value={authFields.elasticsearchLevelField}
                  onChange={e => patchAuth({ elasticsearchLevelField: e.target.value })}
                  type="text"
                  placeholder="level"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
              </div>
            </section>
          ) : null}

          {showLogCorrelation ? (
            <section className={sectionClass}>
              <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                Log Correlation
              </h2>
              <div className="mb-4">
                <label htmlFor="ds-trace-id-field" className={labelClass}>
                  Trace ID Field
                </label>
                <input
                  id="ds-trace-id-field"
                  value={authFields.traceIdField}
                  onChange={e => patchAuth({ traceIdField: e.target.value })}
                  type="text"
                  placeholder="trace_id"
                  disabled={saveLoading}
                  autoComplete="off"
                  className={inputClass}
                />
                <p className="m-0 mt-1 text-xs text-[var(--color-outline)]">
                  The log field name that contains distributed trace IDs. Default: trace_id
                </p>
              </div>
              <div className="mb-0">
                <label htmlFor="ds-linked-trace-ds" className={labelClass}>
                  Linked Tracing Datasource (optional)
                </label>
                <select
                  id="ds-linked-trace-ds"
                  value={authFields.linkedTraceDatasourceId || ''}
                  disabled={saveLoading}
                  className={selectClass}
                  onChange={e =>
                    patchAuth({ linkedTraceDatasourceId: e.target.value || null })
                  }
                >
                  <option value="">None — disable trace linking</option>
                  {traceDatasources.map(td => (
                    <option key={td.id} value={td.id}>
                      {td.name} ({td.type})
                    </option>
                  ))}
                </select>
                <p className="m-0 mt-1 text-xs text-[var(--color-outline)]">
                  When a user clicks a trace ID in logs, they&apos;ll be taken to this tracing
                  datasource.
                </p>
              </div>
            </section>
          ) : null}

          {showAuthSettings ? (
            <section className={sectionClass}>
              <h2 className="mb-3 mt-0 text-sm font-semibold text-[var(--color-on-surface)]">
                Authentication
              </h2>
              <div className="mb-4">
                <label htmlFor="ds-auth-type" className={labelClass}>
                  Authentication
                </label>
                <select
                  id="ds-auth-type"
                  data-testid="ds-auth-type-select"
                  value={authFields.authType}
                  onChange={e => patchAuth({ authType: e.target.value as AuthType })}
                  disabled={saveLoading}
                  className={selectClass}
                >
                  <option value="none">None</option>
                  <option value="basic">Basic auth</option>
                  <option value="bearer">Bearer token</option>
                  <option value="api_key">API key</option>
                </select>
              </div>

              {authFields.authType === 'basic' ? (
                <div className="mt-4 rounded-lg bg-[var(--color-surface-container-high)] p-4">
                  <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                    <div className="mb-0">
                      <label htmlFor="ds-basic-username" className={labelClass}>
                        Username <span className="text-[var(--color-error)]">*</span>
                      </label>
                      <input
                        id="ds-basic-username"
                        data-testid="ds-basic-username-input"
                        value={authFields.basicUsername}
                        onChange={e => patchAuth({ basicUsername: e.target.value })}
                        type="text"
                        disabled={saveLoading}
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div className="mb-0">
                      <label htmlFor="ds-basic-password" className={labelClass}>
                        Password
                      </label>
                      <input
                        id="ds-basic-password"
                        data-testid="ds-basic-password-input"
                        value={authFields.basicPassword}
                        onChange={e => patchAuth({ basicPassword: e.target.value })}
                        type="password"
                        disabled={saveLoading}
                        autoComplete="new-password"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {authFields.authType === 'bearer' ? (
                <div className="mt-4 rounded-lg bg-[var(--color-surface-container-high)] p-4">
                  <div className="mb-0">
                    <label htmlFor="ds-bearer-token" className={labelClass}>
                      Bearer token <span className="text-[var(--color-error)]">*</span>
                    </label>
                    <input
                      id="ds-bearer-token"
                      data-testid="ds-bearer-token-input"
                      value={authFields.bearerToken}
                      onChange={e => patchAuth({ bearerToken: e.target.value })}
                      type="password"
                      disabled={saveLoading}
                      autoComplete="new-password"
                      className={inputClass}
                    />
                  </div>
                </div>
              ) : null}

              {authFields.authType === 'api_key' ? (
                <div className="mt-4 rounded-lg bg-[var(--color-surface-container-high)] p-4">
                  <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                    <div className="mb-0">
                      <label htmlFor="ds-api-header" className={labelClass}>
                        Header name
                      </label>
                      <input
                        id="ds-api-header"
                        data-testid="ds-api-header-input"
                        value={authFields.apiKeyHeader}
                        onChange={e => patchAuth({ apiKeyHeader: e.target.value })}
                        type="text"
                        disabled={saveLoading}
                        autoComplete="off"
                        className={inputClass}
                      />
                    </div>
                    <div className="mb-0">
                      <label htmlFor="ds-api-value" className={labelClass}>
                        API key <span className="text-[var(--color-error)]">*</span>
                      </label>
                      <input
                        id="ds-api-value"
                        data-testid="ds-api-value-input"
                        value={authFields.apiKeyValue}
                        onChange={e => patchAuth({ apiKeyValue: e.target.value })}
                        type="password"
                        disabled={saveLoading}
                        autoComplete="new-password"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

    </>
  )
}
