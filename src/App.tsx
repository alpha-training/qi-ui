import { ThemeProvider } from './context/ThemeContext'
import { ControlProvider, useControl } from './context/ControlContext'
import Sidebar from './components/sidebar/Sidebar'
import ControlPage from './pages/ControlPage'
import ConnectionDropdown from './components/ConnectionDropdown'

function ApiStatus() {
  const { connected } = useControl()
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
        connected ? 'bg-emerald-400 shadow-[0_0_5px_#34d399]' : 'bg-zinc-600'
      }`} />
      <span className="text-xs text-[var(--text-dimmed)]">
        {connected ? 'API connected' : 'Offline'}
      </span>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ControlProvider>
        <div className="flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden" style={{ fontFamily: "'Sora', sans-serif" }}>
          <Sidebar />
          <main className="flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* Top header bar */}
            <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
              <div className="flex items-center gap-3">
                <span className="font-bold text-xl text-[var(--text-primary)]">Control</span>
                <ApiStatus />
              </div>
              <ConnectionDropdown />
            </header>

            <ControlPage />
          </main>
        </div>
      </ControlProvider>
    </ThemeProvider>
  )
}
