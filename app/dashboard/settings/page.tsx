import { createClient, getCurrentUser } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Settings, User, Shield } from 'lucide-react'
import GladiatorAvatarUpload from './gladiator-avatar-upload'

export default async function SettingsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
          <Settings className="w-6 h-6 text-yellow-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400">Manage your account and preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Section */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Profile</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <p className="text-white font-medium">{user.first_name} {user.last_name}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <p className="text-white font-medium">{user.email}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Role</label>
              <p className="text-white font-medium capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        {/* Gladiator Avatar Section */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-semibold text-white uppercase tracking-wide">Scoreboard Avatar</h2>
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Upload your custom gladiator avatar to display on the sales scoreboard.
            This will be shown when you&apos;re in the top 3!
          </p>

          <GladiatorAvatarUpload
            userId={user.id}
            currentAvatar={user.gladiator_avatar}
          />
        </div>
      </div>
    </div>
  )
}
