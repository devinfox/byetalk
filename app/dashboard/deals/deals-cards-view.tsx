'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  DollarSign,
  Trophy,
  Sparkles,
  X,
  Check,
} from 'lucide-react'
import type { Deal, User as UserType, DealType } from '@/types/database.types'
import confetti from 'canvas-confetti'

interface DealWithRelations extends Deal {
  owner: { id: string; first_name: string; last_name: string } | null
  contact: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null
}

interface DealsCardsViewProps {
  deals: DealWithRelations[]
  currentUser: UserType | null
}

// Helper to format deal type nicely
const formatDealType = (type: DealType): string => {
  const labels: Record<DealType, string> = {
    new_ira: 'New IRA',
    ira_rollover: 'IRA Rollover',
    ira_transfer: 'IRA Transfer',
    cash_purchase: 'Cash Purchase',
    additional_investment: 'Additional Investment',
    liquidation: 'Liquidation',
  }
  return labels[type] || type
}

// Helper to format metal type
const formatMetalType = (metal: string | null): string => {
  if (!metal) return 'Precious Metals'
  return metal.charAt(0).toUpperCase() + metal.slice(1)
}

export function DealsCardsView({ deals, currentUser }: DealsCardsViewProps) {
  const router = useRouter()
  const [closingDealId, setClosingDealId] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationName, setCelebrationName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  // Separate open and closed deals
  const openDeals = deals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost')
  const closedWonDeals = deals.filter(d => d.stage === 'closed_won')
  const closedLostDeals = deals.filter(d => d.stage === 'closed_lost')
  const allClosedDeals = [...closedWonDeals, ...closedLostDeals]

  // Calculate total closed amount (only won deals)
  const totalClosedAmount = closedWonDeals.reduce(
    (sum, d) => sum + (d.funded_amount || d.estimated_value || 0),
    0
  )

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const handleMarkDeal = (dealId: string) => {
    setClosingDealId(dealId)
    setShowConfirmModal(true)
  }

  const handleCloseDeal = async (outcome: 'won' | 'lost') => {
    if (!closingDealId || isUpdating) return

    setIsUpdating(true)

    try {
      const response = await fetch(`/api/deals/${closingDealId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Error closing deal:', result.error)
        alert(`Failed to close deal: ${result.error}`)
        setIsUpdating(false)
        return
      }
    } catch (err) {
      console.error('Error closing deal:', err)
      alert('Failed to close deal. Please try again.')
      setIsUpdating(false)
      return
    }

    setShowConfirmModal(false)
    setIsUpdating(false)

    if (outcome === 'won') {
      // Show celebration for won deals
      const employeeName = currentUser?.first_name || 'Champion'
      setCelebrationName(employeeName)
      setShowCelebration(true)

      // Fire confetti!
      fireConfetti()

      // Hide celebration after 3 seconds then refresh
      setTimeout(() => {
        setShowCelebration(false)
        setClosingDealId(null)
        router.refresh()
      }, 3000)
    } else {
      // For lost deals, just refresh immediately
      setClosingDealId(null)
      router.refresh()
    }
  }

  const handleCancelClose = () => {
    setShowConfirmModal(false)
    setClosingDealId(null)
  }

  const fireConfetti = () => {
    // Left side burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.6 },
      colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1'],
    })

    // Right side burst
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.9, y: 0.6 },
      colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1'],
    })

    // Center burst
    setTimeout(() => {
      confetti({
        particleCount: 150,
        spread: 100,
        origin: { x: 0.5, y: 0.5 },
        colors: ['#FFD700', '#FFA500', '#FF6347', '#00FF00', '#00CED1'],
      })
    }, 200)
  }

  return (
    <>
      {/* Open Deals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {openDeals.length === 0 ? (
          <div className="col-span-full glass-card p-12 text-center">
            <DollarSign className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No open deals</h3>
            <p className="text-gray-400 text-sm">Create a new deal to get started!</p>
          </div>
        ) : (
          openDeals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onMarkDeal={() => handleMarkDeal(deal.id)}
              formatCurrency={formatCurrency}
            />
          ))
        )}
      </div>

      {/* Closed Deals Section */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-4">
          <Trophy className="w-6 h-6 text-yellow-400" />
          <h2 className="text-xl font-semibold text-white">Closed Deals</h2>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-sm">{closedWonDeals.length} Won</span>
              <span className="text-gray-500">|</span>
              <span className="text-red-400 text-sm">{closedLostDeals.length} Lost</span>
            </div>
            <div className="glass-card px-4 py-2">
              <span className="text-gray-400 text-sm">Total Revenue: </span>
              <span className="text-yellow-400 font-bold text-lg">{formatCurrency(totalClosedAmount)}</span>
            </div>
          </div>
        </div>

        {allClosedDeals.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <p className="text-gray-500">No closed deals yet. Keep pushing!</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Deal
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Metal
                  </th>
                  <th className="text-left p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Account Type
                  </th>
                  <th className="text-right p-4 text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {allClosedDeals.map((deal) => {
                  const contactName = deal.contact
                    ? `${deal.contact.first_name} ${deal.contact.last_name}`
                    : deal.name
                  const isWon = deal.stage === 'closed_won'
                  return (
                    <tr key={deal.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        {isWon ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Won
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium border border-red-500/30">
                            <XCircle className="w-3.5 h-3.5" />
                            Lost
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="text-white">{contactName}</span>
                        <span className="text-gray-500 text-xs ml-2">#{deal.deal_number}</span>
                      </td>
                      <td className="p-4 text-gray-300">
                        {formatMetalType(deal.metal_type)}
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium border border-yellow-500/30">
                          {formatDealType(deal.deal_type)}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <span className={isWon ? 'text-green-400 font-semibold' : 'text-gray-500 line-through'}>
                          {formatCurrency(deal.funded_amount || deal.estimated_value || 0)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal - Now with Won/Lost options */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleCancelClose} />
          <div className="relative glass-card p-8 rounded-2xl max-w-md w-full text-center">
            <button
              onClick={handleCancelClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-yellow-400" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              Close this deal?
            </h3>
            <p className="text-gray-400 mb-6">
              Select the outcome for this deal
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleCancelClose}
                disabled={isUpdating}
                className="px-5 py-2.5 glass-button rounded-xl text-gray-300 hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCloseDeal('lost')}
                disabled={isUpdating}
                className="px-5 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {isUpdating ? 'Saving...' : 'Closed Lost'}
              </button>
              <button
                onClick={() => handleCloseDeal('won')}
                disabled={isUpdating}
                className="px-5 py-2.5 glass-button-gold rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {isUpdating ? 'Saving...' : 'Closed Won'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Celebration Modal */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative glass-card p-12 rounded-3xl text-center animate-bounce-in">
            <div className="absolute -top-6 left-1/2 -translate-x-1/2">
              <Sparkles className="w-12 h-12 text-yellow-400 animate-pulse" />
            </div>

            <h2 className="text-4xl font-bold text-white mb-2">
              GREAT JOB!
            </h2>
            <p className="text-3xl font-bold text-gold-gradient">
              {celebrationName}! 🎉
            </p>

            <div className="mt-4 flex justify-center gap-2">
              {['🏆', '💰', '⭐', '🎊', '💪'].map((emoji, i) => (
                <span
                  key={i}
                  className="text-3xl animate-bounce"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  {emoji}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

interface DealCardProps {
  deal: DealWithRelations
  onMarkDeal: () => void
  formatCurrency: (amount: number) => string
}

function DealCard({ deal, onMarkDeal, formatCurrency }: DealCardProps) {
  const contactName = deal.contact
    ? `${deal.contact.first_name} ${deal.contact.last_name}`
    : deal.name
  const amount = deal.funded_amount || deal.estimated_value || 0
  const metal = formatMetalType(deal.metal_type)

  return (
    <div className="glass-card p-5 relative group">
      {/* Mark as Closed button at top right */}
      <button
        onClick={onMarkDeal}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-lg transition-all border border-transparent hover:border-green-500/30"
        title="Mark as closed"
      >
        <Check className="w-4 h-4" />
        <span className="hidden group-hover:inline">Close</span>
      </button>

      {/* Main Content */}
      <div className="pr-16">
        <h3 className="text-lg font-semibold text-white mb-1">
          {contactName}
        </h3>
        <p className="text-gray-400 text-sm mb-3">
          <span className="text-yellow-400 font-bold text-lg">{formatCurrency(amount)}</span>
          {' '}investing into{' '}
          <span className="text-white font-medium">{metal}</span>
        </p>

        {/* Account Type Tag */}
        <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-xs font-medium border border-blue-500/30">
          {formatDealType(deal.deal_type)}
        </span>
      </div>

      {/* Deal Number */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <span className="text-gray-500 text-xs">Deal #{deal.deal_number}</span>
      </div>
    </div>
  )
}
