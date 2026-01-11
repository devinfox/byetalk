'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

interface ImportJob {
  id: string
  file_name: string
  total_rows: number
  processed_rows: number
  successful_rows: number
  failed_rows: number
  duplicate_rows: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  created_at: string
}

export function ImportProgressBar() {
  const [activeJobs, setActiveJobs] = useState<ImportJob[]>([])
  const [dismissedJobs, setDismissedJobs] = useState<Set<string>>(new Set())
  const [isVisible, setIsVisible] = useState(false)

  const fetchActiveJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/leads/import')
      if (!response.ok) return

      const data = await response.json()
      const jobs = data.jobs || []

      // Filter to show only recent jobs (last 10 minutes) that are processing or recently completed
      const recentJobs = jobs.filter((job: ImportJob) => {
        const createdAt = new Date(job.created_at)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
        return createdAt > tenMinutesAgo && !dismissedJobs.has(job.id)
      })

      setActiveJobs(recentJobs)
      setIsVisible(recentJobs.length > 0)
    } catch (error) {
      console.error('Error fetching import jobs:', error)
    }
  }, [dismissedJobs])

  useEffect(() => {
    // Initial fetch
    fetchActiveJobs()

    // Poll every 2 seconds for active jobs
    const interval = setInterval(fetchActiveJobs, 2000)

    return () => clearInterval(interval)
  }, [fetchActiveJobs])

  const dismissJob = (jobId: string) => {
    setDismissedJobs(prev => new Set([...prev, jobId]))
  }

  const dismissAll = () => {
    const allJobIds = activeJobs.map(job => job.id)
    setDismissedJobs(prev => new Set([...prev, ...allJobIds]))
  }

  if (!isVisible || activeJobs.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {activeJobs.map((job) => {
        const progress = job.total_rows > 0
          ? Math.round((job.processed_rows / job.total_rows) * 100)
          : 0

        const isComplete = job.status === 'completed'
        const isFailed = job.status === 'failed'
        const isProcessing = job.status === 'processing'

        return (
          <div
            key={job.id}
            className="glass-card p-4 rounded-xl shadow-2xl border border-white/10 animate-in slide-in-from-right duration-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {isProcessing && (
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                  </div>
                )}
                {isComplete && (
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                )}
                {isFailed && (
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {isProcessing && 'Importing leads...'}
                    {isComplete && 'Import complete!'}
                    {isFailed && 'Import failed'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {job.file_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => dismissJob(job.id)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            {isProcessing && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{job.processed_rows.toLocaleString()} / {job.total_rows.toLocaleString()} rows</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Completion stats */}
            {isComplete && (
              <div className="mt-3 flex gap-3 text-xs">
                <span className="text-green-400">
                  {job.successful_rows.toLocaleString()} imported
                </span>
                {job.duplicate_rows > 0 && (
                  <span className="text-yellow-400">
                    {job.duplicate_rows.toLocaleString()} duplicates
                  </span>
                )}
                {job.failed_rows > 0 && (
                  <span className="text-red-400">
                    {job.failed_rows.toLocaleString()} failed
                  </span>
                )}
              </div>
            )}

            {/* Error message */}
            {isFailed && job.error_message && (
              <p className="mt-2 text-xs text-red-400">
                {job.error_message}
              </p>
            )}
          </div>
        )
      })}

      {activeJobs.length > 1 && (
        <button
          onClick={dismissAll}
          className="text-xs text-gray-500 hover:text-white transition-colors text-right"
        >
          Dismiss all
        </button>
      )}
    </div>
  )
}
