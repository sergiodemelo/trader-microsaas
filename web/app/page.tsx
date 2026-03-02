'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabaseClient'
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
} from 'recharts'

type Monthly = {
  user_id: string
  plan_id: string
  total_result_brl: number
  objective_amount: number
  minimum_amount: number
  extra_amount: number
  pct_vs_objective: number
  pct_vs_minimum: number
  pct_vs_extra: number
}

type WeeklyRow = {
  user_id: string
  plan_id: string
  week_number: number
  total_result_brl: number
  objective_amount: number
  minimum_amount: number
  extra_amount: number
  weekly_objective_target: number
  weekly_minimum_target: number
  weekly_extra_target: number
}

type TradeRow = {
  id: string
  trade_date: string // YYYY-MM-DD
  result_brl: number
  result_points: number | null
}

function brl(value: number | null | undefined) {
  const v = Number(value ?? 0)
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function pct01(value: number | null | undefined) {
  const v = Number(value ?? 0)
  return `${(v * 100).toFixed(1)}%`
}

function clamp01(n: number) {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function statusForWeek(total: number, minTarget: number, objTarget: number) {
  if (total >= objTarget) return 'good'
  if (total >= minTarget) return 'warn'
  return 'bad'
}

function statusStyles(status: 'good' | 'warn' | 'bad') {
  if (status === 'good') return 'bg-green-50 border-green-200 text-green-800'
  if (status === 'warn') return 'bg-yellow-50 border-yellow-200 text-yellow-800'
  return 'bg-red-50 border-red-200 text-red-800'
}

function progressBarClass(status: 'good' | 'warn' | 'bad') {
  if (status === 'good') return 'bg-green-500'
  if (status === 'warn') return 'bg-yellow-500'
  return 'bg-red-500'
}

function parseISODate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function monthStartISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  return d.toISOString().slice(0, 10)
}

function nextMonthStartISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 1)
  return d.toISOString().slice(0, 10)
}

export default function Home() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [monthly, setMonthly] = useState<Monthly | null>(null)
  const [weekly, setWeekly] = useState<WeeklyRow[]>([])
  const [trades, setTrades] = useState<TradeRow[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setErrorMsg(null)
      setLoading(true)

      // 1) sessão
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
      if (sessionErr) {
        setErrorMsg(sessionErr.message)
        setLoading(false)
        return
      }

      const session = sessionData.session
      if (!session) {
        router.push('/login')
        setLoading(false)
        return
      }

      // 2) pega um plano ativo
      const { data: plan, error: planErr } = await supabase
        .from('plans')
        .select('id, created_at, month')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (planErr) {
        setErrorMsg(planErr.message)
        setLoading(false)
        return
      }

      if (!plan?.id) {
        setErrorMsg('Nenhum plano ativo encontrado. Importe um CSV (Profit) ou crie/ative um plano no Supabase.')
        setLoading(false)
        return
      }

      const planId = plan.id

      // 3) mensal
      const { data: monthlyData, error: monthlyErr } = await supabase
        .from('vw_monthly_summary')
        .select('*')
        .eq('plan_id', planId)
        .maybeSingle()

      if (monthlyErr) {
        setErrorMsg(monthlyErr.message)
        setLoading(false)
        return
      }

      // 4) semanal
      const { data: weeklyData, error: weeklyErr } = await supabase
        .from('vw_weekly_summary')
        .select('*')
        .eq('plan_id', planId)
        .order('week_number', { ascending: true })

      if (weeklyErr) {
        setErrorMsg(weeklyErr.message)
        setLoading(false)
        return
      }

      // 5) trades do mês do plano (para mini-cards)
      const start = (plan as any)?.month ?? monthStartISO(new Date())
      const end = nextMonthStartISO(parseISODate(start))

      const { data: tradesData, error: tradesErr } = await supabase
        .from('trades')
        .select('id, trade_date, result_brl, result_points')
        .eq('plan_id', planId)
        .gte('trade_date', start)
        .lt('trade_date', end)
        .order('trade_date', { ascending: true })

      if (tradesErr) {
        setErrorMsg(tradesErr.message)
        setLoading(false)
        return
      }

      setMonthly((monthlyData ?? null) as Monthly | null)
      setWeekly((weeklyData ?? []) as WeeklyRow[])
      setTrades((tradesData ?? []) as TradeRow[])
      setLoading(false)
    }

    load()
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const monthlyStatus = useMemo(() => {
    if (!monthly) return 'warn' as const
    const total = monthly.total_result_brl ?? 0
    const min = monthly.minimum_amount ?? 0
    const obj = monthly.objective_amount ?? 0
    return statusForWeek(total, min, obj)
  }, [monthly])

  const monthlyProgress = useMemo(() => {
    if (!monthly) return 0
    const obj = monthly.objective_amount ?? 0
    if (obj <= 0) return 0
    return clamp01((monthly.total_result_brl ?? 0) / obj)
  }, [monthly])

  // ===== Mini-cards (KPIs) =====
  const kpis = useMemo(() => {
    const totalTrades = trades.length
    const wins = trades.filter(t => (t.result_brl ?? 0) > 0).length
    const losses = trades.filter(t => (t.result_brl ?? 0) < 0).length
    const breakeven = trades.filter(t => (t.result_brl ?? 0) === 0).length

    const hitRate = totalTrades > 0 ? wins / totalTrades : 0

    const byDay = new Map<string, number>()
    for (const t of trades) {
      const d = t.trade_date
      byDay.set(d, (byDay.get(d) ?? 0) + Number(t.result_brl ?? 0))
    }

    let bestDay: { date: string; value: number } | null = null
    let worstDay: { date: string; value: number } | null = null
    for (const [date, value] of byDay.entries()) {
      if (!bestDay || value > bestDay.value) bestDay = { date, value }
      if (!worstDay || value < worstDay.value) worstDay = { date, value }
    }

    return { totalTrades, wins, losses, breakeven, hitRate, bestDay, worstDay }
  }, [trades])

  // ===== Dados do gráfico semanal =====
  const chartData = useMemo(() => {
    return weekly.map(w => ({
      week: `W${w.week_number}`,
      resultado: Number(w.total_result_brl ?? 0),
      meta: Number(w.weekly_objective_target ?? 0),
      minimo: Number(w.weekly_minimum_target ?? 0),
    }))
  }, [weekly])

  const yMax = useMemo(() => {
    const maxVal = Math.max(
      0,
      ...chartData.map(d => Math.max(d.resultado, d.meta, d.minimo))
    )
    // folga 10%
    return Math.ceil(maxVal * 1.1)
  }, [chartData])

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="text-sm opacity-70">Resumo do plano ativo</div>
        </div>

        <button className="border rounded px-3 py-2 hover:bg-gray-50" onClick={logout}>
          Sair
        </button>
      </div>

      {loading && <div>Carregando...</div>}

      {errorMsg && (
        <div className="text-red-600 whitespace-pre-wrap border border-red-200 bg-red-50 rounded p-4">
          {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && monthly && (
        <>
          {/* MINI-CARDS */}
          <section className="grid gap-4 md:grid-cols-4">
            <div className="border rounded p-4">
              <div className="text-xs opacity-70">Trades no mês</div>
              <div className="text-2xl font-semibold mt-1">{kpis.totalTrades}</div>
              <div className="text-xs opacity-70 mt-2">
                {kpis.wins} gain • {kpis.losses} loss • {kpis.breakeven} 0
              </div>
            </div>

            <div className="border rounded p-4">
              <div className="text-xs opacity-70">Taxa de acerto</div>
              <div className="text-2xl font-semibold mt-1">{pct01(kpis.hitRate)}</div>
              <div className="text-xs opacity-70 mt-2">wins / total</div>
            </div>

            <div className="border rounded p-4">
              <div className="text-xs opacity-70">Melhor dia</div>
              <div className="text-2xl font-semibold mt-1">
                {kpis.bestDay ? brl(kpis.bestDay.value) : '—'}
              </div>
              <div className="text-xs opacity-70 mt-2">{kpis.bestDay?.date ?? 'sem dados'}</div>
            </div>

            <div className="border rounded p-4">
              <div className="text-xs opacity-70">Pior dia</div>
              <div className="text-2xl font-semibold mt-1">
                {kpis.worstDay ? brl(kpis.worstDay.value) : '—'}
              </div>
              <div className="text-xs opacity-70 mt-2">{kpis.worstDay?.date ?? 'sem dados'}</div>
            </div>
          </section>

          {/* CARDS PRINCIPAIS */}
          <section className="grid gap-4 md:grid-cols-3">
            <div className={`border rounded p-4 ${statusStyles(monthlyStatus)}`}>
              <div className="text-sm opacity-80">Resultado do mês</div>
              <div className="text-3xl font-semibold mt-1">{brl(monthly.total_result_brl)}</div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs opacity-80">
                  <span>Progresso vs Objetivo</span>
                  <span>{pct01(monthly.pct_vs_objective)}</span>
                </div>
                <div className="h-2 bg-white/60 rounded mt-1 overflow-hidden">
                  <div
                    className={`h-2 ${progressBarClass(monthlyStatus)}`}
                    style={{ width: `${(monthlyProgress * 100).toFixed(1)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs opacity-80 mt-1">
                  <span>Meta: {brl(monthly.objective_amount)}</span>
                  <span>Mínimo: {brl(monthly.minimum_amount)}</span>
                </div>
              </div>
            </div>

            <div className="border rounded p-4">
              <div className="text-sm opacity-70">% vs Objetivo</div>
              <div className="text-3xl font-semibold mt-1">{pct01(monthly.pct_vs_objective)}</div>
              <div className="text-sm opacity-70 mt-2">Objetivo</div>
              <div className="text-xl font-semibold">{brl(monthly.objective_amount)}</div>
            </div>

            <div className="border rounded p-4">
              <div className="text-sm opacity-70">% vs Mínimo</div>
              <div className="text-3xl font-semibold mt-1">{pct01(monthly.pct_vs_minimum)}</div>
              <div className="text-sm opacity-70 mt-2">Mínimo</div>
              <div className="text-xl font-semibold">{brl(monthly.minimum_amount)}</div>
            </div>
          </section>

          {/* GRÁFICO SEMANAL */}
          <section className="border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Gráfico semanal</h2>
              <div className="text-xs opacity-70">Barras: resultado • Linha: meta • Linha pontilhada: mínimo</div>
            </div>

            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis domain={[0, yMax]} />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === 'resultado' || name === 'meta' || name === 'minimo') {
                        return [brl(Number(value)), name]
                      }
                      return [value, name]
                    }}
                  />
                  <Bar dataKey="resultado" />
                  <Line type="monotone" dataKey="meta" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="minimo" strokeDasharray="6 4" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* TABELA SEMANAL */}
          <section className="border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Semanas</h2>
              <div className="text-xs opacity-70">Verde: meta • Amarelo: mínimo • Vermelho: abaixo</div>
            </div>

            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Semana</th>
                    <th className="py-2 pr-4">Resultado</th>
                    <th className="py-2 pr-4">Meta</th>
                    <th className="py-2 pr-4">Mínimo</th>
                    <th className="py-2 pr-4">Extra</th>
                    <th className="py-2 pr-4">Progresso</th>
                  </tr>
                </thead>

                <tbody>
                  {weekly.map((w) => {
                    const st = statusForWeek(
                      w.total_result_brl ?? 0,
                      w.weekly_minimum_target ?? 0,
                      w.weekly_objective_target ?? 0
                    )

                    const obj = w.weekly_objective_target ?? 0
                    const prog = obj > 0 ? clamp01((w.total_result_brl ?? 0) / obj) : 0

                    return (
                      <tr key={w.week_number} className="border-b">
                        <td className="py-2 pr-4 font-medium">{w.week_number}</td>
                        <td className={`py-2 pr-4 font-semibold ${st === 'bad' ? 'text-red-600' : ''}`}>
                          {brl(w.total_result_brl)}
                        </td>
                        <td className="py-2 pr-4">{brl(w.weekly_objective_target)}</td>
                        <td className="py-2 pr-4">{brl(w.weekly_minimum_target)}</td>
                        <td className="py-2 pr-4">{brl(w.weekly_extra_target)}</td>
                        <td className="py-2 pr-4 w-64">
                          <div className="h-2 bg-gray-100 rounded overflow-hidden">
                            <div
                              className={`h-2 ${progressBarClass(st)}`}
                              style={{ width: `${(prog * 100).toFixed(1)}%` }}
                            />
                          </div>
                          <div className="text-xs opacity-70 mt-1">{pct01(prog)}</div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!loading && !errorMsg && (!weekly || weekly.length === 0) && (
        <div className="text-sm opacity-70">Sem trades no plano ativo ainda. Importe um CSV para preencher.</div>
      )}
    </main>
  )
}