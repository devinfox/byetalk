'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, FileSpreadsheet, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface ImportJobWithStats {
  id: string
  file_name: string
  successful_rows: number
  created_at: string
  status: string
  lead_count: number
  queued_count: number
  is_turbo_enabled: boolean
}

export function TurboGroupsPanel() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [jobs, setJobs] = useState<ImportJobWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/turbo/queue/import-job')
      if (response.ok) {
        const data = await response.json()
        setJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Error fetching turbo import jobs:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const toggleTurbo = async (jobId: string, shouldEnable: boolean) => {
    setToggling(prev => ({ ...prev, [jobId]: true }))

    try {
      if (shouldEnable) {
        const response = await fetch('/api/turbo/queue/import-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ import_job_id: jobId }),
        })

        if (!response.ok) {
          console.error('Failed to enable turbo:', await response.text())
        }
      } else {
        const response = await fetch(`/api/turbo/queue/import-job?import_job_id=${jobId}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          console.error('Failed to disable turbo:', await response.text())
        }
      }

      // Refresh the list
      await fetchJobs()
    } catch (error) {
      console.error('Error toggling turbo:', error)
    } finally {
      setToggling(prev => {
        const next = { ...prev }
        delete next[jobId]
        return next
      })
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatFileName = (fileName: string) => {
    // Remove file extension and clean up
    const name = fileName.replace(/\.csv$/i, '')
    if (name.length > 30) {
      return name.substring(0, 27) + '...'
    }
    return name
  }

  if (loading) {
    return (
      <div className="glass-card">
        <div className="p-5 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
          <span className="text-gray-400">Loading turbo groups...</span>
        </div>
      </div>
    )
  }

  if (jobs.length === 0) {
    return null // Don't show panel if no import jobs exist
  }

  return (
    <div className="glass-card">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="text-left">
            <h3 className="text-white font-semibold">Turbo Mode Groups</h3>
            <p className="text-gray-400 text-sm">Toggle turbo calling by import batch</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">{jobs.length} groups</span>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-white/10">
          <div className="divide-y divide-white/5">
            {jobs.map(job => (
              <div
                key={job.id}
                className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileSpreadsheet className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate" title={job.file_name}>
                      {formatFileName(job.file_name)}
                    </p>
                    <p className="text-gray-500 text-sm">
                      {job.lead_count.toLocaleString()} leads with phone · {formatDate(job.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {job.is_turbo_enabled && (
                    <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-full">
                      {job.queued_count.toLocaleString()} queued
                    </span>
                  )}
                  <Switch
                    checked={job.is_turbo_enabled}
                    onCheckedChange={(checked) => toggleTurbo(job.id, checked)}
                    disabled={!!toggling[job.id]}
                    aria-label={`Toggle turbo mode for ${job.file_name}`}
                  />
                  {toggling[job.id] && (
                    <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
