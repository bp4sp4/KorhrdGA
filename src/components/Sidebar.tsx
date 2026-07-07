'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './Sidebar.module.css'

type NavItem = { href: string; label: string; icon: React.ReactNode }

const ICONS = {
  home: (
    <path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />
  ),
  student: (
    <path d="M22 10 12 5 2 10l10 5 10-5ZM6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5" />
  ),
  prospect: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6" />
  ),
  sales: (
    <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />
  ),
  admin: (
    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7" />
  ),
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export default function Sidebar({
  displayName,
  isAdmin,
}: {
  displayName: string
  isAdmin: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const base: NavItem[] = [
    { href: '/students', label: '학습자 신규', icon: <Icon>{ICONS.student}</Icon> },
    { href: '/customers', label: '가망관리', icon: <Icon>{ICONS.prospect}</Icon> },
    { href: '/sales', label: '매출파일', icon: <Icon>{ICONS.sales}</Icon> },
  ]

  const nav: NavItem[] = isAdmin
    ? [
        { href: '/', label: '홈', icon: <Icon>{ICONS.home}</Icon> },
        ...base,
        { href: '/admin', label: '관리자', icon: <Icon>{ICONS.admin}</Icon> },
      ]
    : base

  return (
    <aside className={styles.sidebar}>
      <Link href={isAdmin ? '/' : '/students'} className={styles.brand}>
        <img src="/logoblack.png" alt="GA CRM" className={styles.brandLogo} />
      </Link>

      <nav className={styles.nav}>
        {nav.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? styles.navActive : styles.navLink}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <span className={styles.userName}>{displayName}</span>
          <span className={isAdmin ? styles.badgeAdmin : styles.badgeAgent}>
            {isAdmin ? '관리자' : '담당자'}
          </span>
        </div>
        <button className={styles.logout} type="button" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
    </aside>
  )
}
