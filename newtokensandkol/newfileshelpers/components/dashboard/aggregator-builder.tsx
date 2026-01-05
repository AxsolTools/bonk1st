"use client"

import { useState } from "react"
import { DEFAULT_AGGREGATORS, type AggregatorFilter, type FilterCondition } from "@/lib/aggregator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Filter, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react"

const CONDITION_TYPES: { value: FilterCondition["type"]; label: string; unit: string }[] = [
  { value: "min_mc", label: "Min Market Cap", unit: "$" },
  { value: "max_mc", label: "Max Market Cap", unit: "$" },
  { value: "min_volume", label: "Min Volume 24h", unit: "$" },
  { value: "min_holders", label: "Min Holders", unit: "" },
  { value: "min_liquidity", label: "Min Liquidity", unit: "$" },
  { value: "max_age", label: "Max Age", unit: "min" },
  { value: "min_social_score", label: "Min Social Score", unit: "" },
  { value: "group_hits", label: "Group Hits", unit: "" },
  { value: "fresh_wallets", label: "Fresh Wallet Buys", unit: "" },
  { value: "dex_paid", label: "DEX Paid", unit: "" },
]

export function AggregatorBuilder() {
  const [aggregators, setAggregators] = useState<AggregatorFilter[]>(DEFAULT_AGGREGATORS)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newConditions, setNewConditions] = useState<FilterCondition[]>([])

  const toggleAggregator = (id: string) => {
    setAggregators((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)))
  }

  const deleteAggregator = (id: string) => {
    setAggregators((prev) => prev.filter((a) => a.id !== id))
  }

  const addCondition = () => {
    setNewConditions((prev) => [...prev, { type: "min_mc", operator: "gte", value: 0 }])
  }

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    setNewConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...updates } : c)))
  }

  const removeCondition = (index: number) => {
    setNewConditions((prev) => prev.filter((_, i) => i !== index))
  }

  const createAggregator = () => {
    if (!newName || newConditions.length === 0) return

    const newAggregator: AggregatorFilter = {
      id: `custom-${Date.now()}`,
      name: newName,
      description: newDescription,
      enabled: true,
      conditions: newConditions,
      createdAt: new Date(),
      matchCount: 0,
    }

    setAggregators((prev) => [...prev, newAggregator])
    setNewName("")
    setNewDescription("")
    setNewConditions([])
    setShowNewForm(false)
  }

  const formatValue = (value: number, type: FilterCondition["type"]) => {
    if (type.includes("mc") || type.includes("volume") || type.includes("liquidity")) {
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
      return `$${value}`
    }
    if (type === "max_age") return `${value} min`
    return value.toString()
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Filter className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Custom Aggregators</h2>
            <p className="text-xs text-muted-foreground">Define your own filters for plays</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNewForm(!showNewForm)}>
          <Plus className="mr-2 h-4 w-4" />
          New Filter
        </Button>
      </div>

      {/* New Aggregator Form */}
      {showNewForm && (
        <div className="border-b border-border bg-secondary/30 p-5">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-foreground">
                  Filter Name
                </Label>
                <Input
                  id="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., My Sniper Setup"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="desc" className="text-foreground">
                  Description
                </Label>
                <Input
                  id="desc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-foreground">Conditions</Label>
                <Button variant="outline" size="sm" onClick={addCondition}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {newConditions.map((condition, index) => (
                  <div key={index} className="flex items-center gap-2 rounded bg-secondary p-2">
                    <select
                      value={condition.type}
                      onChange={(e) => updateCondition(index, { type: e.target.value as FilterCondition["type"] })}
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                      {CONDITION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={condition.operator}
                      onChange={(e) =>
                        updateCondition(index, { operator: e.target.value as FilterCondition["operator"] })
                      }
                      className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                    >
                      <option value="gte">≥</option>
                      <option value="lte">≤</option>
                      <option value="eq">=</option>
                    </select>
                    <Input
                      type="number"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: Number(e.target.value) })}
                      className="w-32"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removeCondition(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewForm(false)}>
                Cancel
              </Button>
              <Button onClick={createAggregator} disabled={!newName || newConditions.length === 0}>
                Create Filter
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Aggregator List */}
      <div className="divide-y divide-border/50">
        {aggregators.map((agg) => (
          <div key={agg.id} className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Switch checked={agg.enabled} onCheckedChange={() => toggleAggregator(agg.id)} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn("font-medium", agg.enabled ? "text-foreground" : "text-muted-foreground")}>
                      {agg.name}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {agg.matchCount} matches
                    </Badge>
                  </div>
                  {agg.description && <p className="text-xs text-muted-foreground">{agg.description}</p>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedId(expandedId === agg.id ? null : agg.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {expandedId === agg.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => deleteAggregator(agg.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Expanded Conditions */}
            {expandedId === agg.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                {agg.conditions.map((c, i) => {
                  const condType = CONDITION_TYPES.find((t) => t.value === c.type)
                  return (
                    <Badge key={i} variant="secondary" className="font-mono text-xs">
                      {condType?.label} {c.operator === "gte" ? "≥" : c.operator === "lte" ? "≤" : "="}{" "}
                      {formatValue(c.value, c.type)}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
