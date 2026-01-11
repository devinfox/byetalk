'use client'

import { useState } from 'react'
import { Plus, Upload } from 'lucide-react'
import { CreateLeadButton } from './create-lead-button'
import { ImportLeadsModal } from './import-leads-modal'
import type { User, Campaign } from '@/types/database.types'

interface LeadsHeaderProps {
  users: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUserId?: string
}

export function LeadsHeader({ users, campaigns, currentUserId }: LeadsHeaderProps) {
  const [showImportModal, setShowImportModal] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-white tracking-wide">
            MANAGE <span className="text-gold-gradient font-semibold">LEADS</span>
          </h1>
          <p className="text-gray-400 mt-1">Track and convert your prospects</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 glass-card hover:bg-white/10 rounded-xl text-sm font-medium text-gray-300 hover:text-white transition-all"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <CreateLeadButton users={users} campaigns={campaigns} currentUserId={currentUserId} />
        </div>
      </div>

      {showImportModal && (
        <ImportLeadsModal
          onClose={() => setShowImportModal(false)}
          users={users}
          campaigns={campaigns}
          currentUserId={currentUserId}
        />
      )}
    </>
  )
}
