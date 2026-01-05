import { Header } from "@/components/layout/header"
import { DiscoverContent } from "@/components/discovery/discover-content"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      {/* Main Content */}
      <section className="px-3 sm:px-4 lg:px-6 py-4">
        <div className="max-w-[1920px] mx-auto">
          <DiscoverContent />
        </div>
      </section>
    </main>
  )
}
