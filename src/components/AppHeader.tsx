"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GuidePicker from "@/components/guide/GuidePicker";
import styles from "./AppHeader.module.css";

const NAV = [
  { href: "/students", label: "학습자 신규" },
  { href: "/customers", label: "가망관리" },
  { href: "/sales", label: "매출파일" },
];

export default function AppHeader({
  displayName,
  isAdmin,
}: {
  displayName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [guideOpen, setGuideOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = isAdmin
    ? [
        { href: "/", label: "홈" },
        ...NAV,
        { href: "/admin", label: "관리자" },
        { href: "/admin/reconcile", label: "정산대사" },
      ]
    : NAV;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href={isAdmin ? "/" : "/customers"} className={styles.brand}>
          <img src="/logoblack.png" alt="GA CRM" className={styles.brandLogo} />
        </Link>
        <nav className={styles.nav}>
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.navActive : styles.navLink}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={styles.right}>
        <button
          className={styles.guideBtn}
          type="button"
          onClick={() => setGuideOpen(true)}
          title="화면 사용법 가이드 다시 보기"
        >
          가이드
        </button>
        <span className={styles.user}>{displayName}</span>
        <button className={styles.logout} type="button" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
      <GuidePicker open={guideOpen} onClose={() => setGuideOpen(false)} />
    </header>
  );
}
