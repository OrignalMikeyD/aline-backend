'use client'

import { signOut } from '@/app/actions/auth'

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="px-3 py-1.5 text-sm text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md transition-colors"
    >
      Sign Out
    </button>
  )
}
