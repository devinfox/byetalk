'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Upload,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { LEAD_FIELDS } from '@/types/import.types'
import type { User, Campaign } from '@/types/database.types'

interface ImportLeadsModalProps {
  onClose: () => void
  users: Pick<User, 'id' | 'first_name' | 'last_name'>[]
  campaigns: Pick<Campaign, 'id' | 'name'>[]
  currentUserId?: string
}

type Step = 'upload' | 'mapping' | 'options' | 'importing' | 'complete'

interface PreviewData {
  headers: string[]
  totalRows: number
  sampleData: Record<string, string>[]
  suggestedMappings: Record<string, string>
  fileName: string
  fileSize: number
}

interface ImportResult {
  success: boolean
  totalRows: number
  successfulRows: number
  failedRows: number
  duplicateRows: number
}

export function ImportLeadsModal({ onClose, users, campaigns, currentUserId }: ImportLeadsModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Options
  const [listName, setListName] = useState('')
  const [defaultStatus, setDefaultStatus] = useState('new')
  const [defaultOwnerId, setDefaultOwnerId] = useState(currentUserId || '')
  const [defaultCampaignId, setDefaultCampaignId] = useState('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [duplicateCheckFields, setDuplicateCheckFields] = useState(['phone', 'email'])

  // Result
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile)
    setError(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/leads/import/preview', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to parse CSV')
      }

      const data = await response.json()
      setPreview(data)
      setFieldMapping(data.suggestedMappings || {})
      setStep('mapping')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      handleFileSelect(droppedFile)
    } else {
      setError('Please upload a CSV file')
    }
  }

  const handleImport = async () => {
    if (!file || !preview) return

    setStep('importing')
    setError(null)

    console.log('=== IMPORT STARTING ===')
    console.log('File:', file.name, 'Size:', file.size)
    console.log('Field mapping:', fieldMapping)
    console.log('List name:', listName)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fieldMapping', JSON.stringify(fieldMapping))
      formData.append('listName', listName)
      formData.append('defaultStatus', defaultStatus)
      formData.append('defaultOwnerId', defaultOwnerId)
      formData.append('defaultCampaignId', defaultCampaignId)
      formData.append('skipDuplicates', skipDuplicates.toString())
      formData.append('duplicateCheckFields', duplicateCheckFields.join(','))

      console.log('Sending request to /api/leads/import...')

      const response = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        const data = await response.json()
        console.log('Error response:', data)
        throw new Error(data.error || 'Import failed')
      }

      const data = await response.json()
      console.log('Success response:', data)

      // Import is processing in background - close modal and let progress bar show status
      if (data.status === 'pending' || data.status === 'processing') {
        // Refresh the leads list and close
        router.refresh()
        onClose()
      } else {
        // Small files may complete immediately
        setResult({
          success: true,
          totalRows: data.totalRows,
          successfulRows: data.successfulRows || 0,
          failedRows: data.failedRows || 0,
          duplicateRows: data.duplicateRows || 0,
        })
        setStep('complete')
      }
    } catch (err) {
      console.log('=== IMPORT ERROR ===')
      console.log('Error:', err)
      setError((err as Error).message)
      setStep('options')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-semibold text-white">Import Leads</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {step === 'upload' && 'Upload your CSV file'}
              {step === 'mapping' && 'Map CSV columns to lead fields'}
              {step === 'options' && 'Configure import options'}
              {step === 'importing' && 'Starting import...'}
              {step === 'complete' && 'Import complete'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center hover:border-yellow-500/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0]
                  if (selectedFile) handleFileSelect(selectedFile)
                }}
              />
              {loading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-12 h-12 text-yellow-400 animate-spin mb-4" />
                  <p className="text-gray-400">Parsing CSV file...</p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
                  <p className="text-white text-lg mb-2">Drag and drop your CSV file here</p>
                  <p className="text-gray-400 text-sm mb-4">or click to browse</p>
                  <p className="text-gray-500 text-xs">Supports files up to 50MB with up to 150,000 rows</p>
                </>
              )}
            </div>
          )}

          {/* Step 2: Field Mapping */}
          {step === 'mapping' && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <FileSpreadsheet className="w-8 h-8 text-yellow-400" />
                <div>
                  <p className="text-white font-medium">{preview.fileName}</p>
                  <p className="text-gray-400 text-sm">
                    {formatFileSize(preview.fileSize)} • {preview.totalRows.toLocaleString()} rows
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-gray-400">Map your CSV columns to lead fields:</p>
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="px-4 py-2 text-left text-xs text-gray-400 uppercase">CSV Column</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 uppercase">Sample Data</th>
                        <th className="px-4 py-2 text-left text-xs text-gray-400 uppercase">Map To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.headers.map((header, idx) => (
                        <tr key={header} className="border-t border-white/5">
                          <td className="px-4 py-3 text-white font-medium text-sm">{header}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm truncate max-w-[200px]">
                            {preview.sampleData[0]?.[header] || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="relative">
                              <select
                                value={fieldMapping[header] || ''}
                                onChange={(e) =>
                                  setFieldMapping((prev) => ({
                                    ...prev,
                                    [header]: e.target.value,
                                  }))
                                }
                                className="glass-select w-full text-sm appearance-none pr-8"
                              >
                                <option value="">-- Don't import --</option>
                                {LEAD_FIELDS.map((field) => (
                                  <option key={field.value} value={field.value}>
                                    {field.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Options */}
          {step === 'options' && (
            <div className="space-y-6">
              {/* List Name */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">List Name (Optional)</label>
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  placeholder={preview?.fileName?.replace(/\.csv$/i, '') || 'Enter a name for this list'}
                  className="glass-input w-full px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Give this list a friendly name. Defaults to file name if left empty.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Default Status</label>
                  <select
                    value={defaultStatus}
                    onChange={(e) => setDefaultStatus(e.target.value)}
                    className="glass-select w-full"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="qualified">Qualified</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Assign To</label>
                  <select
                    value={defaultOwnerId}
                    onChange={(e) => setDefaultOwnerId(e.target.value)}
                    className="glass-select w-full"
                  >
                    <option value="">-- Unassigned --</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.first_name} {user.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Campaign</label>
                  <select
                    value={defaultCampaignId}
                    onChange={(e) => setDefaultCampaignId(e.target.value)}
                    className="glass-select w-full"
                  >
                    <option value="">-- No Campaign --</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-white/10 text-yellow-500 focus:ring-yellow-500"
                  />
                  <span className="text-white">Skip duplicate leads</span>
                </label>

                {skipDuplicates && (
                  <div className="ml-7 space-y-2">
                    <p className="text-sm text-gray-400">Check duplicates by:</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={duplicateCheckFields.includes('phone')}
                          onChange={(e) =>
                            setDuplicateCheckFields((prev) =>
                              e.target.checked
                                ? [...prev, 'phone']
                                : prev.filter((f) => f !== 'phone')
                            )
                          }
                          className="w-4 h-4 rounded border-gray-600 bg-white/10 text-yellow-500 focus:ring-yellow-500"
                        />
                        <span className="text-gray-300 text-sm">Phone</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={duplicateCheckFields.includes('email')}
                          onChange={(e) =>
                            setDuplicateCheckFields((prev) =>
                              e.target.checked
                                ? [...prev, 'email']
                                : prev.filter((f) => f !== 'email')
                            )
                          }
                          className="w-4 h-4 rounded border-gray-600 bg-white/10 text-yellow-500 focus:ring-yellow-500"
                        />
                        <span className="text-gray-300 text-sm">Email</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {preview && (
                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Ready to import:</p>
                  <p className="text-white text-lg font-semibold">
                    {preview.totalRows.toLocaleString()} leads
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-16 h-16 text-yellow-400 animate-spin mb-6" />
              <p className="text-white text-lg mb-2">Importing leads...</p>
              <p className="text-gray-400 text-sm mb-4">This may take a minute for large files</p>
              {preview && (
                <p className="text-gray-500 text-xs">
                  Processing {preview.totalRows.toLocaleString()} rows
                </p>
              )}
            </div>
          )}

          {/* Step 5: Complete */}
          {step === 'complete' && result && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-semibold text-white mb-2">Import Complete!</h3>
              <p className="text-gray-400 mb-6">Your leads have been successfully imported</p>

              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-6">
                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-green-400">{result.successfulRows.toLocaleString()}</p>
                  <p className="text-sm text-gray-400">Imported</p>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-400">{result.duplicateRows.toLocaleString()}</p>
                  <p className="text-sm text-gray-400">Duplicates</p>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-red-400">{result.failedRows.toLocaleString()}</p>
                  <p className="text-sm text-gray-400">Failed</p>
                </div>
              </div>

              <button
                onClick={() => {
                  router.refresh()
                  onClose()
                }}
                className="glass-button-gold px-6 py-2"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'mapping' || step === 'options') && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
            <button
              onClick={() => setStep(step === 'mapping' ? 'upload' : 'mapping')}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => {
                if (step === 'mapping') {
                  setStep('options')
                } else {
                  handleImport()
                }
              }}
              disabled={step === 'mapping' && Object.values(fieldMapping).filter(Boolean).length === 0}
              className="flex items-center gap-2 glass-button-gold px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 'options' ? 'Start Import' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
