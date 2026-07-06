'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/')
        router.refresh()
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        })
        if (error) throw error
        // 이메일 확인이 꺼져 있으면 즉시 세션 발급 → 홈으로
        if (data.session) {
          router.push('/')
          router.refresh()
        } else {
          setInfo('가입 완료. 이메일 확인이 켜져 있으면 메일 인증 후 로그인하세요.')
          setMode('login')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <img src="/logoblack.png" alt="GA CRM" className={styles.logo} />
        <p className={styles.subtitle}>
          {mode === 'login' ? '담당자 로그인' : '담당자 계정 만들기'}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label className={styles.field}>
              <span className={styles.label}>이름</span>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
              />
            </label>
          )}

          <label className={styles.field}>
            <span className={styles.label}>이메일</span>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>비밀번호</span>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}
          {info && <p className={styles.info}>{info}</p>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? '처리 중…' : mode === 'login' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button
          className={styles.toggle}
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'login'
            ? '계정이 없으신가요? 회원가입'
            : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  )
}
