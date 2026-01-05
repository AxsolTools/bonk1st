"use client"

import { useState } from "react"
import { Network } from "lucide-react"
import { KOL_DATABASE } from "@/lib/kol-data"

interface Connection {
  from: string
  to: string
  strength: number
  type: "trade-together" | "copy" | "coordinate"
}

export function KOLNetworkGraph() {
  const verifiedKOLs = KOL_DATABASE.filter((k) => !k.isWashTrader).slice(0, 12)
  const [selectedKOL, setSelectedKOL] = useState<string | null>(null)

  // Mock connection data - who trades with who
  const connections: Connection[] = [
    { from: "Ansem", to: "Murad", strength: 85, type: "trade-together" },
    { from: "Ansem", to: "GCR", strength: 72, type: "trade-together" },
    { from: "Murad", to: "Hsaka", strength: 68, type: "coordinate" },
    { from: "GCR", to: "Cobie", strength: 45, type: "trade-together" },
    { from: "Pentoshi", to: "CL207", strength: 78, type: "coordinate" },
    { from: "Hsaka", to: "Loomdart", strength: 62, type: "copy" },
    { from: "CL207", to: "DegenSpartan", strength: 88, type: "trade-together" },
  ]

  const getKOLConnections = (name: string) => {
    return connections.filter((c) => c.from === name || c.to === name)
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/20 rounded-xl">
            <Network className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">KOL NETWORK</h2>
            <p className="text-xs text-neutral-500">See which KOLs trade together & coordinate</p>
          </div>
        </div>
      </div>

      {/* Network Visualization */}
      <div className="flex-1 p-6">
        <div className="h-full bg-[#080808] rounded-2xl border border-[#1a1a1a] p-6 relative overflow-hidden">
          {/* Center node visualization */}
          <div className="grid grid-cols-4 gap-6 h-full">
            {verifiedKOLs.map((kol) => {
              const kolConnections = getKOLConnections(kol.name)
              const isSelected = selectedKOL === kol.name
              const isConnected =
                selectedKOL && kolConnections.some((c) => c.from === selectedKOL || c.to === selectedKOL)

              return (
                <div
                  key={kol.id}
                  onClick={() => setSelectedKOL(isSelected ? null : kol.name)}
                  className={`bg-[#0a0a0a] rounded-xl p-4 border transition-all cursor-pointer ${
                    isSelected
                      ? "border-[#00ff88] shadow-lg shadow-[#00ff88]/20"
                      : isConnected
                        ? "border-purple-500/50"
                        : "border-[#1a1a1a] hover:border-[#333]"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={kol.avatar || "/placeholder.svg"}
                      alt={kol.name}
                      className="w-12 h-12 rounded-full bg-[#1a1a1a]"
                    />
                    <div>
                      <div className="font-bold text-white">{kol.name}</div>
                      <div className="text-xs text-neutral-500">@{kol.twitter}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">Coordination Score</span>
                      <span className="text-purple-400 font-bold">{kol.coordinationScore}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${kol.coordinationScore}%` }}
                      />
                    </div>
                  </div>

                  {kolConnections.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#1a1a1a]">
                      <div className="text-[10px] text-neutral-500 mb-2">TRADES WITH</div>
                      <div className="flex flex-wrap gap-1">
                        {kolConnections.slice(0, 3).map((conn, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                            {conn.from === kol.name ? conn.to : conn.from}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Connection Legend */}
          <div className="absolute bottom-4 left-4 flex items-center gap-4 bg-[#0a0a0a] px-4 py-2 rounded-lg border border-[#1a1a1a]">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-xs text-neutral-400">Trade Together</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs text-neutral-400">Copy</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-xs text-neutral-400">Coordinate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
