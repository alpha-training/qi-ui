import {
  LayoutGrid, TrendingUp, BarChart2, Database,
  ShoppingCart, AlertTriangle, Settings,
} from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

const NAV = [
  { icon: LayoutGrid,    label: 'Control',  active: true  },
  { icon: TrendingUp,    label: 'Strats',   active: false },
  { icon: BarChart2,     label: 'Charts',   active: false },
  { icon: Database,      label: 'Data',     active: false },
  { icon: ShoppingCart,  label: 'Orders',   active: false },
  { icon: AlertTriangle, label: 'Risk',     active: false },
  { icon: Settings,      label: 'Settings', active: false },
]

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'

  return (
    <aside className="w-40 bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
        <img src="/qi-logo.svg" alt="qi" className="h-8" />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm w-full
              ${active
                ? 'bg-[#3b82f6] text-white font-medium cursor-pointer'
                : 'text-[var(--text-muted)] font-light cursor-default opacity-50'
              }`}
          >
            <Icon size={16} />
            {label}
          </div>
        ))}
      </nav>

      {/* Light / Dark toggle */}
      <div className="px-4 py-4 border-t border-[var(--border)] flex items-center gap-2">
        <span className="text-[var(--text-dimmed)] text-xs">{isLight ? 'Light' : 'Dark'}</span>
        <button
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className={`ml-auto w-9 h-5 rounded-full relative transition-colors
            ${isLight ? 'bg-blue-500' : 'bg-[var(--bg-toggle-off)]'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all
            ${isLight ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>
    </aside>
  )
}
