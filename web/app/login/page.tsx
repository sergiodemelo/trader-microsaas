'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Se já estiver logado, não faz sentido mostrar login
  useEffect(() => {
    async function checkSession() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          setErrorMsg(error.message)
          setCheckingSession(false)
          return
        }

        if (data.session) {
          router.push('/')
          return
        }

        setCheckingSession(false)
      } catch (err: any) {
        setErrorMsg(err?.message ?? 'Erro ao verificar sessão.')
        setCheckingSession(false)
      }
    }

    checkSession()
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    setLoading(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    router.push('/')
  }

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm opacity-70">Carregando...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md border rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-4">Login</h1>

        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Senha</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {errorMsg && (
            <div className="text-sm text-red-600 whitespace-pre-wrap">
              {errorMsg}
            </div>
          )}

          <button
            className="w-full bg-black text-white rounded px-3 py-2 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}