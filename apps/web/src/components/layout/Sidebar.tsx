import { Button } from "@ui"
import {
  Antenna,
  Gauge,
  MessageSquareText,
  Network,
  Radio,
  Settings as SettingsIcon,
  Shuffle,
} from "lucide-react"
import { NavLink } from "react-router"

import { useAuth } from "@/store/auth"

import styles from "./Sidebar.module.scss"

const NAV = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/sources", label: "Sources", icon: Antenna, end: false },
  { to: "/pipelines", label: "Pipelines", icon: Shuffle, end: false },
  { to: "/channels", label: "Channels", icon: Radio, end: false },
  { to: "/prompts", label: "Prompts", icon: MessageSquareText, end: false },
  { to: "/proxies", label: "Proxies", icon: Network, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
]

export function Sidebar() {
  const logout = useAuth((state) => state.logout)

  return (
    <nav className={styles.sidebar}>
      <div className={styles.brand}>Autoposting</div>

      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            isActive ? `${styles.link} ${styles.active}` : styles.link
          }
        >
          <Icon size={16} />
          {label}
        </NavLink>
      ))}

      <div className={styles.footer}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </div>
    </nav>
  )
}
