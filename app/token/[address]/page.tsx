import { Suspense } from "react"
import { Header } from "@/components/layout/header"
import { TokenDashboard } from "@/components/token/token-dashboard"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"

interface TokenPageProps {
  params: Promise<{ address: string }>
}

export default async function TokenPage({ params }: TokenPageProps) {
  const { address } = await params

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      <div className="px-3 sm:px-4 lg:px-6 py-4">
        <div className="max-w-[1920px] mx-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[60vh]">
                <div className="spinner" />
              </div>
            }
          >
            <TokenDashboard address={address} />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
