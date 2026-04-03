'use client'

import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'

interface NavbarProps {
  email: string
}

export default function Navbar({ email }: NavbarProps) {
  const { signOut } = useClerk()

  // Show shortened email on small screens
  const shortEmail = email.split('@')[0]

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-base font-semibold text-gray-900 tracking-tight">
          Stratifi
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/transactions" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Transactions
          </Link>
          <span className="text-sm text-gray-500 hidden sm:block">{email}</span>
          <span className="text-sm text-gray-500 sm:hidden">{shortEmail}</span>
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
