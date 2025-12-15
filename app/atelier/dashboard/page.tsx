import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <p className="text-gray-400">
        Welcome to The Atelier dashboard. Use the API at{' '}
        <code className="px-2 py-1 bg-gray-800 rounded text-sm text-blue-400">
          /api/atelier/dashboard
        </code>{' '}
        to fetch dashboard data.
      </p>
    </div>
  )
}
