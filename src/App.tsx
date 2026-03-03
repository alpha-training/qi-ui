import Sidebar from './components/sidebar/Sidebar'
import ControlPage from './pages/ControlPage'
import { ControlProvider } from './context/ControlContext'
import ConnectionDropdown from './components/ConnectionDropdown'

export default function App() {
  return (
    <ControlProvider>
      <div className="flex h-screen bg-[#0d1117] text-zinc-100 overflow-hidden" style={{ fontFamily: "'Sora', sans-serif" }}>
        <Sidebar />
        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* Top header bar */}
          <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0f1117]">
            <span className="text-white font-bold text-xl">Control</span>
            <ConnectionDropdown />
          </header>

          <ControlPage />
        </main>
      </div>
    </ControlProvider>
  )
}