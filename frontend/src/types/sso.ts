export interface GoogleSSOConfig {
  client_id: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface UpdateGoogleSSOConfigRequest {
  client_id: string
  client_secret: string
  enabled?: boolean
}

export interface MicrosoftSSOConfig {
  tenant_id: string
  client_id: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface UpdateMicrosoftSSOConfigRequest {
  tenant_id: string
  client_id: string
  client_secret: string
  enabled?: boolean
}

interface OktaSSOConfig {
  tenant_id: string
  client_id: string
  groups_claim_name: string
  default_role: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface UpdateOktaSSOConfigRequest {
  tenant_id: string
  client_id: string
  client_secret: string
  groups_claim_name: string
  default_role: string
  enabled: boolean
}
