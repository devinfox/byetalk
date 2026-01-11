export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export interface LeadImportJob {
  id: string
  file_name: string
  file_size: number | null
  total_rows: number
  processed_rows: number
  successful_rows: number
  failed_rows: number
  duplicate_rows: number
  status: ImportStatus
  error_message: string | null
  field_mapping: Record<string, string>
  default_status: string
  default_owner_id: string | null
  default_campaign_id: string | null
  skip_duplicates: boolean
  duplicate_check_fields: string[]
  created_by: string
  organization_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface LeadImportError {
  id: string
  import_job_id: string
  row_number: number
  row_data: Record<string, unknown>
  error_message: string
  created_at: string
}

export interface FieldMapping {
  csvColumn: string
  leadField: string
}

// Available lead fields for mapping
export const LEAD_FIELDS = [
  { value: 'first_name', label: 'First Name', required: false },
  { value: 'last_name', label: 'Last Name', required: false },
  { value: 'email', label: 'Email', required: false },
  { value: 'phone', label: 'Phone', required: false },
  { value: 'phone_secondary', label: 'Secondary Phone', required: false },
  { value: 'address_line1', label: 'Address Line 1', required: false },
  { value: 'address_line2', label: 'Address Line 2', required: false },
  { value: 'city', label: 'City', required: false },
  { value: 'state', label: 'State', required: false },
  { value: 'zip_code', label: 'Zip Code', required: false },
  { value: 'country', label: 'Country', required: false },
  { value: 'source_type', label: 'Source Type', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: 'utm_source', label: 'UTM Source', required: false },
  { value: 'utm_medium', label: 'UTM Medium', required: false },
  { value: 'utm_campaign', label: 'UTM Campaign', required: false },
] as const

export type LeadFieldName = typeof LEAD_FIELDS[number]['value']
