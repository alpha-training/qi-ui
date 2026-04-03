import { useState } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { ConnectionProvider, useConnectionContext } from './context/ConnectionContext'
import { ControlProvider, useControl } from './context/ControlContext'
import Sidebar from './components/sidebar/Sidebar'
import ControlPage from './pages/ControlPage'
import QueryPage from './pages/QueryPage'
import ConnectionDropdown from './components/ConnectionDropdown'
import { X, Wifi } from 'lucide-react'

export type AppPage = 'control' | 'query'

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
      {!connected && (
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-0.5"
          title="Reconnect"
        >
          Reconnect
        </button>
      )}
    </div>
  )
}

type OnboardingForm = { host: string; port: string; name: string; username: string; password: string; connType: 'q' | 'api' }
const emptyOnboarding: OnboardingForm = { host: 'localhost', port: '8000', name: '', username: '', password: '', connType: 'q' }
const onboardingFields = [
  { key: 'host',     label: 'Host',     placeholder: 'localhost', required: true,  type: 'text'     },
  { key: 'port',     label: 'Port',     placeholder: '8000',      required: true,  type: 'number'   },
  { key: 'name',     label: 'Name',     placeholder: 'optional',  required: false, type: 'text'     },
  { key: 'username', label: 'Username', placeholder: 'optional',  required: false, type: 'text'     },
  { key: 'password', label: 'Password', placeholder: 'optional',  required: false, type: 'password' },
] as const

function OnboardingModal() {
  const { showOnboarding, addConnection } = useConnectionContext()
  const [dismissed, setDismissed] = useState(false)
  const [form, setForm] = useState<OnboardingForm>(emptyOnboarding)

  if (!showOnboarding || dismissed) return null

  function handleConnect() {
    if (!form.host.trim() || !form.port.trim()) return
    const portNum = parseInt(form.port, 10)
    if (isNaN(portNum)) return
    addConnection({
      host: form.host.trim().toLowerCase(),
      port: portNum,
      type: form.connType,
      ...(form.name.trim() && { name: form.name.trim() }),
      ...(form.username.trim() && { username: form.username.trim() }),
      ...(form.password && { password: form.password }),
    })
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-96 bg-[var(--bg-modal)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <Wifi size={16} className="text-blue-400" />
            <h2 className="text-[var(--text-primary)] font-bold text-base">Connect to qi</h2>
          </div>
          <button onClick={() => setDismissed(true)}
            className="text-[var(--text-dimmed)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--bg-hover-md)]">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-[var(--text-dimmed)] mb-1">Add a connection to get started.</p>

          {/* Connection type */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-dimmed)] w-16 shrink-0">Type</span>
            <div className="flex gap-4">
              {(['q', 'api'] as const).map(t => (
                <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="onboarding-type"
                    value={t}
                    checked={form.connType === t}
                    onChange={() => setForm(f => ({ ...f, connType: t }))}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-[var(--text-secondary)] font-mono">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {onboardingFields.map(field => (
            <div key={field.key} className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-dimmed)] w-16 shrink-0">
                {field.label}
                {field.required && <span className="text-red-400">*</span>}
              </label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={form[field.key]}
                onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={() => setDismissed(true)}
              className="flex-1 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded-lg transition-colors">
              Skip for now
            </button>
            <button
              onClick={handleConnect}
              disabled={!form.host.trim() || !form.port.trim()}
              className="flex-1 py-2 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Connect
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const PAGE_TITLES: Record<AppPage, string> = { control: 'Control', query: 'Query' }

function AppShell() {
  const [page, setPage] = useState<AppPage>(() =>
    (localStorage.getItem('qi_active_page') as AppPage) ?? 'control'
  )
  const navigate = (p: AppPage) => { setPage(p); localStorage.setItem('qi_active_page', p) }
  return (
    <ControlProvider>
      <div className="flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden" style={{ fontFamily: "'Sora', sans-serif" }}>
        <Sidebar activePage={page} onNavigate={navigate} />
        <main className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <header className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-3">
              <span className="font-bold text-xl text-[var(--text-primary)]">{PAGE_TITLES[page]}</span>
              <ApiStatus />
            </div>
            <ConnectionDropdown />
          </header>
          {page === 'control' && <ControlPage />}
          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${page !== 'query' ? 'hidden' : ''}`}><QueryPage /></div>
        </main>
      </div>
      <OnboardingModal />
    </ControlProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ConnectionProvider>
        <AppShell />
      </ConnectionProvider>
    </ThemeProvider>
  )
}
