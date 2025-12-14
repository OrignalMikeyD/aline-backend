import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from './sign-out-button'

export default async function AtelierLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <span className="text-xl font-bold text-white">The Atelier</span>
              <span className="text-sm text-gray-400">by Persona iO</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">{user.email}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
