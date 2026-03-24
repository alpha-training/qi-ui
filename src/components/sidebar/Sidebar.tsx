import React from 'react'
import {
  LayoutGrid, Terminal, TrendingUp, BarChart2, Database,
  ShoppingCart, AlertTriangle, Settings,
} from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import type { AppPage } from '../../App'

const NAV: { icon: React.ElementType; label: string; page: AppPage | null }[] = [
  { icon: LayoutGrid,    label: 'Control',  page: 'control' },
  { icon: Terminal,      label: 'Query',    page: 'query'   },
  { icon: TrendingUp,    label: 'Strats',   page: null },
  { icon: BarChart2,     label: 'Charts',   page: null },
  { icon: Database,      label: 'Data',     page: null },
  { icon: ShoppingCart,  label: 'Orders',   page: null },
  { icon: AlertTriangle, label: 'Risk',     page: null },
  { icon: Settings,      label: 'Settings', page: null },
]

export default function Sidebar({ activePage, onNavigate }: { activePage: AppPage; onNavigate: (p: AppPage) => void }) {
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
        {NAV.map(({ icon: Icon, label, page }) => {
          const isActive = page === activePage
          const isEnabled = page !== null
          return (
            <div
              key={label}
              title={isEnabled ? undefined : 'Coming soon'}
              onClick={isEnabled ? () => onNavigate(page!) : undefined}
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-md text-sm w-full group/nav
                ${isActive
                  ? 'bg-[var(--primary)] text-white font-medium cursor-pointer'
                  : isEnabled
                    ? 'text-[var(--text-muted)] hover:bg-[var(--bg-hover-md)] hover:text-[var(--text-primary)] cursor-pointer transition-colors'
                    : 'text-[var(--text-muted)] font-light cursor-default opacity-35 hover:opacity-60 transition-opacity'
                }`}
            >
              <Icon size={16} />
              {label}
              {!isEnabled && (
                <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded bg-[var(--bg-dropdown)] border border-[var(--border)] text-xs text-[var(--text-dimmed)] whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity pointer-events-none z-50">
                  Coming soon
                </span>
              )}
            </div>
          )
        })}
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
