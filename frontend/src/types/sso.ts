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
