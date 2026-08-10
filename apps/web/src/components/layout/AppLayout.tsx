import { Outlet } from "react-router"

import { Sidebar } from "./Sidebar"

import styles from "./AppLayout.module.scss"

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
