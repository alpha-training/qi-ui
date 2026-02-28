import Sidebar from './components/sidebar/Sidebar'
import ControlPage from './pages/ControlPage'
import { ControlProvider } from './context/ControlContext'

export default function App() {
  return (
    <ControlProvider>
      <div className="flex h-screen bg-[#0d1117] text-zinc-100 overflow-hidden">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top header bar */}
          <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0f1117] shrink-0">
            <div /> {/* left spacer — page sets its own title */}
            <div className="flex items-center gap-6 text-sm text-zinc-400">
              <span className="hover:text-white cursor-pointer transition-colors">Workspace</span>
              <span className="hover:text-white cursor-pointer transition-colors">ENV</span>
              <span className="text-xs bg-white/5 border border-white/10 rounded px-2 py-0.5">⌘K</span>
            </div>
          </header>

          <ControlPage />
        </main>
      </div>
    </ControlProvider>
  )
}