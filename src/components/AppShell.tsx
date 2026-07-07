import Sidebar from './Sidebar'
import styles from './AppShell.module.css'

export default function AppShell({
  displayName,
  isAdmin,
  children,
}: {
  displayName: string
  isAdmin: boolean
  children: React.ReactNode
}) {
  return (
    <div className={styles.shell}>
      <Sidebar displayName={displayName} isAdmin={isAdmin} />
      <main className={styles.main}>{children}</main>
    </div>
  )
}
