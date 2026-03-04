import { ThemeProvider } from './context/ThemeContext'
import { ControlProvider } from './context/ControlContext'
import Sidebar from './components/sidebar/Sidebar'
import ControlPage from './pages/ControlPage'
import ConnectionDropdown from './components/ConnectionDropdown'

export default function App() {
  return (
    <ThemeProvider>
      <ControlProvider>
        <div className="flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden" style={{ fontFamily: "'Sora', sans-serif" }}>
          <Sidebar />
          <main className="flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* Top header bar */}
            <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
              <span className="font-bold text-xl text-[var(--text-primary)]">Control</span>
              <ConnectionDropdown />
            </header>

            <ControlPage />
          </main>
        </div>
      </ControlProvider>
    </ThemeProvider>
  )
}
