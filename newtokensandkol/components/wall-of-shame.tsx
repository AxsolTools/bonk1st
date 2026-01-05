"use client"
import { Skull, Ban } from "lucide-react"
import { getWashTraders } from "@/lib/kol-data"

export function WallOfShame() {
  const washTraders = getWashTraders()

  return (
    <div className="h-[50%] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] bg-[#080808]">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-red-500/20 rounded-lg">
            <Skull className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-white">WALL OF SHAME</h3>
            <p className="text-[10px] text-neutral-500">KOLs who dump on copy traders</p>
          </div>
        </div>
      </div>

      {/* Shame List */}
      <div className="flex-1 overflow-y-auto">
        {washTraders.map((kol) => (
          <div key={kol.id} className="p-4 border-b border-[#111] bg-red-500/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={kol.avatar || "/placeholder.svg"}
                    alt={kol.name}
                    className="w-12 h-12 rounded-full grayscale border-2 border-red-500/50 bg-[#1a1a1a]"
                  />
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <Ban className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{kol.name}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded font-bold">BLACKLIST</span>
                  </div>
                  <div className="text-xs text-neutral-500">@{kol.twitter}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black text-red-500">{kol.washScore}%</div>
                <div className="text-[10px] text-neutral-500">SCAM SCORE</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="text-red-500 font-bold">{kol.dumpOnFollowers}</div>
                <div className="text-[10px] text-neutral-500">Dumps</div>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="text-red-500 font-bold">{kol.copyTraders}</div>
                <div className="text-[10px] text-neutral-500">Victims</div>
              </div>
              <div className="bg-[#0a0a0a] rounded-lg p-2">
                <div className="text-red-500 font-bold">{kol.coordinationScore}%</div>
                <div className="text-[10px] text-neutral-500">Coord</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {["Pump & Dump", "Wash Trading", "Exit Liquidity"].slice(0, 2).map((tag) => (
                <span key={tag} className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
