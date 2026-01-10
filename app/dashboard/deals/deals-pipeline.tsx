'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MoreHorizontal,
  User,
  DollarSign,
  Phone,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  ArrowRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { EditDealModal } from './edit-deal-modal'
import type { Deal, User as UserType, Campaign, DealStage } from '@/types/database.types'

interface DealWithRelations extends Deal {
  owner: { id: string; first_name: string; last_name: string } | null
  lead: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null
  campaign: { id: string; name: string; code: string | null } | null
}

interface DealsPipelineProps {
  deals: DealWithRelations[]
  users: Pick<UserType, 'id' | 'first_name' | 'last_name' | 'role'>[]
  campaigns: Pick<Campaign, 'id' | 'name' | 'code'>[]
  currentUser: UserType | null
}

const PIPELINE_STAGES: { key: DealStage; label: string; color: string; dotColor: string; description: string }[] = [
  {
    key: 'deal_opened',
    label: 'Deal Opened',
    color: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    dotColor: 'bg-blue-400',
    description: 'Customer has 100% intent. Dollar estimate set.'
  },
  {
    key: 'proposal_education',
    label: 'Proposal / Education',
    color: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
    dotColor: 'bg-purple-400',
    description: 'Brochure sent. Metals & custodian explained.'
  },
  {
    key: 'paperwork_sent',
    label: 'Paperwork Sent',
    color: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    dotColor: 'bg-amber-400',
    description: 'IRA/transfer paperwork delivered.'
  },
  {
    key: 'paperwork_complete',
    label: 'Paperwork Complete',
    color: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    description: 'Forms returned. Waiting on custodian.'
  },
  {
    key: 'funding_in_progress',
    label: 'Funding In Progress',
    color: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
    dotColor: 'bg-yellow-400',
    description: 'Money moving. Deal very likely to close.'
  },
]

const CLOSED_STAGES: { key: DealStage; label: string; color: string; dotColor: string; description: string }[] = [
  {
    key: 'closed_won',
    label: 'Closed - Won',
    color: 'from-green-500/20 to-green-600/10 border-green-500/30',
    dotColor: 'bg-green-400',
    description: 'Funds received. Commission eligible.'
  },
  {
    key: 'closed_lost',
    label: 'Closed - Lost',
    color: 'from-red-500/20 to-red-600/10 border-red-500/30',
    dotColor: 'bg-red-400',
    description: 'Did not fund.'
  },
]

export function DealsPipeline({
  deals,
  users,
  campaigns,
  currentUser,
}: DealsPipelineProps) {
  const router = useRouter()
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  // Group deals by stage
  const dealsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.key] = deals.filter(d => d.stage === stage.key)
    return acc
  }, {} as Record<DealStage, DealWithRelations[]>)

  const closedDeals = {
    closed_won: deals.filter(d => d.stage === 'closed_won'),
    closed_lost: deals.filter(d => d.stage === 'closed_lost'),
  }

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    const supabase = createClient()
    await supabase
      .from('deals')
      .update({
        stage: newStage,
        stage_entered_at: new Date().toISOString(),
      })
      .eq('id', dealId)

    router.refresh()
    setOpenMenuId(null)
  }

  const handleDelete = async (dealId: string) => {
    if (!confirm('Are you sure you want to delete this deal?')) return

    const supabase = createClient()
    await supabase
      .from('deals')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', dealId)

    router.refresh()
    setOpenMenuId(null)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const getStageValue = (stage: DealStage) => {
    const stageDeals = dealsByStage[stage] || []
    return stageDeals.reduce((sum, d) => sum + (d.estimated_value || 0), 0)
  }

  return (
    <>
      {/* Pipeline View */}
      <div className="glass-card overflow-hidden">
        {/* Stage Headers */}
        <div className="flex overflow-x-auto">
          {PIPELINE_STAGES.map((stage) => {
            const stageDeals = dealsByStage[stage.key] || []
            const stageValue = getStageValue(stage.key)
            return (
              <div
                key={stage.key}
                className="flex-shrink-0 w-72 border-r border-white/10 last:border-r-0"
              >
                {/* Stage Header */}
                <div className={`p-4 border-b border-white/10 bg-gradient-to-r ${stage.color}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${stage.dotColor} shadow-lg`} />
                    <span className="text-white font-medium text-sm uppercase tracking-wide">{stage.label}</span>
                    <span className="ml-auto bg-white/10 text-white px-2.5 py-0.5 rounded-full text-xs font-medium">
                      {stageDeals.length}
                    </span>
                  </div>
                  <p className="text-yellow-400 text-sm font-medium mt-2">{formatCurrency(stageValue)}</p>
                </div>

                {/* Stage Deals */}
                <div className="p-3 space-y-2 min-h-[400px] max-h-[600px] overflow-y-auto">
                  {stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onEdit={() => setEditingDeal(deal)}
                      onDelete={() => handleDelete(deal.id)}
                      onStageChange={(stage) => handleStageChange(deal.id, stage)}
                      openMenuId={openMenuId}
                      setOpenMenuId={setOpenMenuId}
                      formatCurrency={formatCurrency}
                      stages={PIPELINE_STAGES}
                    />
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Closed Deals Toggle */}
      <div className="mt-6">
        <button
          onClick={() => setShowClosed(!showClosed)}
          className="flex items-center gap-2 text-gray-400 hover:text-yellow-400 transition-colors"
        >
          <ChevronRight className={`w-4 h-4 transition-transform ${showClosed ? 'rotate-90' : ''}`} />
          <span className="uppercase tracking-wide text-sm">Closed Deals ({closedDeals.closed_won.length + closedDeals.closed_lost.length})</span>
        </button>

        {showClosed && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {CLOSED_STAGES.map((stage) => {
              const stageDeals = closedDeals[stage.key as 'closed_won' | 'closed_lost'] || []
              return (
                <div
                  key={stage.key}
                  className="glass-card overflow-hidden"
                >
                  <div className={`p-4 border-b border-white/10 bg-gradient-to-r ${stage.color}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${stage.dotColor} shadow-lg`} />
                      <span className="text-white font-medium uppercase tracking-wide">{stage.label}</span>
                      <span className="ml-auto bg-white/10 text-white px-2.5 py-0.5 rounded-full text-xs font-medium">
                        {stageDeals.length}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                    {stageDeals.map((deal) => (
                      <DealCard
                        key={deal.id}
                        deal={deal}
                        onEdit={() => setEditingDeal(deal)}
                        onDelete={() => handleDelete(deal.id)}
                        onStageChange={(stage) => handleStageChange(deal.id, stage)}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        formatCurrency={formatCurrency}
                        stages={PIPELINE_STAGES}
                        isClosed
                      />
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No deals
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingDeal && (
        <EditDealModal
          deal={editingDeal}
          users={users}
          campaigns={campaigns}
          onClose={() => setEditingDeal(null)}
        />
      )}
    </>
  )
}

interface DealCardProps {
  deal: DealWithRelations
  onEdit: () => void
  onDelete: () => void
  onStageChange: (stage: DealStage) => void
  openMenuId: string | null
  setOpenMenuId: (id: string | null) => void
  formatCurrency: (amount: number) => string
  stages: { key: DealStage; label: string; color: string }[]
  isClosed?: boolean
}

function DealCard({
  deal,
  onEdit,
  onDelete,
  onStageChange,
  openMenuId,
  setOpenMenuId,
  formatCurrency,
  stages,
  isClosed,
}: DealCardProps) {
  const currentStageIndex = stages.findIndex(s => s.key === deal.stage)
  const nextStage = stages[currentStageIndex + 1]

  return (
    <div className="glass-card-subtle p-3 hover:bg-white/10 transition-all duration-200 group rounded-xl">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/dashboard/deals/${deal.id}`}
          className="flex-1 min-w-0"
        >
          <p className="text-white font-medium text-sm truncate hover:text-yellow-400 transition-colors">
            {deal.name}
          </p>
          <p className="text-gray-500 text-xs">#{deal.deal_number}</p>
        </Link>
        <div className="relative">
          <button
            onClick={(e) => {
              e.preventDefault()
              setOpenMenuId(openMenuId === deal.id ? null : deal.id)
            }}
            className="p-1 text-gray-400 hover:text-yellow-400 rounded opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {openMenuId === deal.id && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpenMenuId(null)}
              />
              <div className="absolute right-0 top-6 z-20 w-48 glass-card rounded-xl shadow-xl py-1">
                <button
                  onClick={onEdit}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Deal
                </button>
                {!isClosed && nextStage && (
                  <button
                    onClick={() => onStageChange(nextStage.key)}
                    className="w-full px-3 py-2 text-left text-sm text-yellow-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Move to {nextStage.label}
                  </button>
                )}
                {!isClosed && (
                  <>
                    <div className="border-t border-white/10 my-1" />
                    <button
                      onClick={() => onStageChange('closed_won')}
                      className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                      Mark Won
                    </button>
                    <button
                      onClick={() => onStageChange('closed_lost')}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                      Mark Lost
                    </button>
                  </>
                )}
                <div className="border-t border-white/10 my-1" />
                <button
                  onClick={onDelete}
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10 flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Deal Info */}
      <div className="mt-2 space-y-1">
        {deal.lead && (
          <div className="flex items-center gap-1 text-gray-400 text-xs">
            <User className="w-3 h-3" />
            <span>{deal.lead.first_name} {deal.lead.last_name}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-yellow-400 text-sm font-medium">
          <DollarSign className="w-3 h-3" />
          <span>{formatCurrency(deal.funded_amount || deal.estimated_value || 0)}</span>
        </div>
      </div>

      {/* Owner */}
      {deal.owner && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-black text-[10px] font-bold">
              {deal.owner.first_name[0]}{deal.owner.last_name[0]}
            </div>
            <span className="text-gray-400 text-xs">
              {deal.owner.first_name} {deal.owner.last_name}
            </span>
          </div>
        </div>
      )}

      {/* Deal Type Badge */}
      <div className="mt-2">
        <span className="inline-block px-2 py-0.5 bg-white/10 text-gray-300 rounded-full text-xs capitalize border border-white/10">
          {deal.deal_type.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  )
}
