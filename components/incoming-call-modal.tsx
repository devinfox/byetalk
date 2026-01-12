'use client'

import { useEffect, useState } from 'react'
import { Phone, PhoneOff, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import type { IncomingCallInfo } from '@/lib/useTwilioDevice'

interface IncomingCallModalProps {
  callInfo: IncomingCallInfo
  onAnswer: (callerInfo?: { name: string; type: 'lead' | 'contact' | 'unknown'; id?: string }) => void
  onReject: () => void
}

interface CallerInfo {
  name: string
  type: 'lead' | 'contact' | 'unknown'
  id?: string
}

export function IncomingCallModal({ callInfo, onAnswer, onReject }: IncomingCallModalProps) {
  const [callerInfo, setCallerInfo] = useState<CallerInfo>({ name: 'Unknown Caller', type: 'unknown' })
  const [loading, setLoading] = useState(true)

  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
  }

  // Look up caller info from database
  useEffect(() => {
    const lookupCaller = async () => {
      const cleanNumber = callInfo.from.replace(/\D/g, '').slice(-10)
      if (cleanNumber.length < 7) {
        setLoading(false)
        return
      }

      const supabase = createClient()

      // Try to find in leads
      const { data: lead } = await supabase
        .from('leads')
        .select('id, first_name, last_name')
        .or(`phone.ilike.%${cleanNumber}%,phone_secondary.ilike.%${cleanNumber}%`)
        .limit(1)
        .single()

      if (lead) {
        setCallerInfo({
          name: `${lead.first_name} ${lead.last_name}`.trim() || 'Unknown Lead',
          type: 'lead',
          id: lead.id,
        })
        setLoading(false)
        return
      }

      // Try to find in contacts
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name')
        .or(`phone.ilike.%${cleanNumber}%,phone_secondary.ilike.%${cleanNumber}%`)
        .limit(1)
        .single()

      if (contact) {
        setCallerInfo({
          name: `${contact.first_name} ${contact.last_name}`.trim() || 'Unknown Contact',
          type: 'contact',
          id: contact.id,
        })
      }

      setLoading(false)
    }

    lookupCaller()
  }, [callInfo.from])

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-3xl p-8 shadow-2xl border border-white/10 min-w-[320px] animate-incoming-call">
        {/* Pulsing ring effect */}
        <div className="absolute inset-0 rounded-3xl animate-pulse-ring" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Caller Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-4 animate-bounce-subtle">
            <User className="w-12 h-12 text-white" />
          </div>

          {/* Caller Info */}
          <div className="text-center mb-6">
            <p className="text-xs text-green-400 uppercase tracking-widest mb-1 animate-pulse">
              Incoming Call
            </p>
            <h2 className="text-2xl font-semibold text-white mb-1">
              {loading ? 'Looking up...' : callerInfo.name}
            </h2>
            <p className="text-gray-400 text-lg font-mono">
              {formatPhoneNumber(callInfo.from)}
            </p>
            {callerInfo.type !== 'unknown' && (
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                callerInfo.type === 'lead'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {callerInfo.type === 'lead' ? 'Lead' : 'Contact'}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-8">
            {/* Reject */}
            <button
              onClick={onReject}
              className="group flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all transform hover:scale-110 shadow-lg shadow-red-500/30">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-gray-400 mt-2 group-hover:text-red-400 transition-colors">
                Decline
              </span>
            </button>

            {/* Answer */}
            <button
              onClick={() => onAnswer(callerInfo)}
              className="group flex flex-col items-center"
            >
              <div className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all transform hover:scale-110 shadow-lg shadow-green-500/30 animate-pulse-answer">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <span className="text-xs text-gray-400 mt-2 group-hover:text-green-400 transition-colors">
                Answer
              </span>
            </button>
          </div>
        </div>

        <style jsx>{`
          @keyframes incoming-call {
            0% {
              transform: scale(0.9);
              opacity: 0;
            }
            100% {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-incoming-call {
            animation: incoming-call 0.3s ease-out;
          }

          @keyframes pulse-ring {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
            }
            50% {
              box-shadow: 0 0 0 20px rgba(34, 197, 94, 0);
            }
          }
          .animate-pulse-ring {
            animation: pulse-ring 2s ease-in-out infinite;
          }

          @keyframes bounce-subtle {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-5px);
            }
          }
          .animate-bounce-subtle {
            animation: bounce-subtle 1s ease-in-out infinite;
          }

          @keyframes pulse-answer {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
            }
            50% {
              box-shadow: 0 0 0 15px rgba(34, 197, 94, 0);
            }
          }
          .animate-pulse-answer {
            animation: pulse-answer 1.5s ease-in-out infinite;
          }
        `}</style>
      </div>
    </div>
  )
}
