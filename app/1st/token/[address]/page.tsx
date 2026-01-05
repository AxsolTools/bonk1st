"use client"

import { Suspense } from "react"
import { TokenDashboard } from "@/components/token/token-dashboard"
import { useParams } from "next/navigation"

// BONK1ST Token Page - Uses existing TokenDashboard with gold theme from 1st layout
export default function First1stTokenPage() {
  const params = useParams()
  const address = params.address as string

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-4">
      <div className="max-w-[1920px] mx-auto">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <div className="w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <TokenDashboard address={address} />
        </Suspense>
      </div>
    </div>
  )
}

