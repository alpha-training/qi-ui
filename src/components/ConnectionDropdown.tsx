import { useState, useEffect, useRef } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Connection } from '../types'
import { useConnectionContext } from '../context/ConnectionContext'

type FormState = {
  host: string
  port: string
  name: string
  username: string
  password: string
  connType: 'q' | 'api'
}

const emptyForm: FormState = { host: '', port: '', name: '', username: '', password: '', connType: 'q' }

const formFields = [
  { key: 'host',     label: 'Host',     placeholder: 'localhost', required: true,  type: 'text'     },
  { key: 'port',     label: 'Port',     placeholder: '8000',      required: true,  type: 'number'   },
  { key: 'name',     label: 'Name',     placeholder: 'optional',       required: false, type: 'text'     },
  { key: 'username', label: 'Username', placeholder: 'optional',  required: false, type: 'text'     },
  { key: 'password', label: 'Password', placeholder: 'optional',  required: false, type: 'password' },
]

export default function ConnectionDropdown() {
  const { connections, activeId, activeConn, setActiveId, addConnection, updateConnection, removeConnection } = useConnectionContext()
  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowForm(false)
        setEditingId(null)
        setForm(emptyForm)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = activeConn
    ? (activeConn.name || `${activeConn.host}:${activeConn.port}`)
    : 'Connect'

  function openAdd() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(conn: Connection) {
    setEditingId(conn.id)
    setForm({
      host: conn.host,
      port: String(conn.port),
      name: conn.name ?? '',
      username: conn.username ?? '',
      password: conn.password ?? '',
      connType: conn.type ?? 'q',
    })
    setShowForm(true)
  }

  function handleSave() {
    if (!form.host.trim() || !form.port.trim()) return
    const portNum = parseInt(form.port, 10)
    if (isNaN(portNum)) return

    const data = {
      host: form.host.trim(),
      port: portNum,
      type: form.connType,
      ...(form.name.trim() && { name: form.name.trim() }),
      ...(form.username.trim() && { username: form.username.trim() }),
      ...(form.password && { password: form.password }),
    }

    if (editingId) {
      updateConnection({ id: editingId, ...data })
    } else {
      addConnection(data)
    }

    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setIsOpen(false)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-hover-md)] border border-[var(--border)] rounded px-3 py-1.5"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${activeConn ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
        <span className="font-mono">{label}</span>
        <svg
          className={`w-3 h-3 text-[var(--text-dimmed)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg shadow-2xl z-50 overflow-hidden">

          {connections.length === 0 && !showForm && (
            <div className="px-4 py-3 text-[var(--text-dimmed)] text-xs text-center">No connections yet</div>
          )}

          {connections.map(conn => {
            const connLabel = conn.name || `${conn.host}:${conn.port}`
            const sublabel = conn.name ? `${conn.host}:${conn.port}` : null
            const isActive = conn.id === activeId
            return (
              <div
                key={conn.id}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer group transition-colors ${isActive ? 'bg-[var(--bg-hover-md)]' : 'hover:bg-[var(--bg-hover)]'}`}
                onClick={() => { setActiveId(conn.id); setIsOpen(false); setShowForm(false) }}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{connLabel}</div>
                  {sublabel && <div className="text-xs text-[var(--text-dimmed)] truncate font-mono">{sublabel}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(conn)} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors" title="Edit">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => removeConnection(conn.id)} className="p-1 text-[var(--text-muted)] hover:text-red-400 rounded transition-colors" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}

          {connections.length > 0 && <div className="border-t border-[var(--border)]" />}

          {showForm ? (
            <div className="px-3 py-3 space-y-2">
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                {editingId ? 'Edit connection' : 'New connection'}
              </div>

              {/* Connection type radio */}
              <div className="flex items-center gap-2 pb-1">
                <span className="text-xs text-[var(--text-dimmed)] w-16 shrink-0">Type</span>
                <div className="flex gap-3">
                  {(['q', 'api'] as const).map(t => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="connType"
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

              {formFields.map(field => (
                <div key={field.key} className="flex items-center gap-2">
                  <label className="text-xs text-[var(--text-dimmed)] w-16 shrink-0">
                    {field.label}
                    {field.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.key as keyof Omit<FormState, 'connType'>]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className="flex-1 bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={handleCancel} className="flex-1 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border)] rounded transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.host.trim() || !form.port.trim()}
                  className="flex-1 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingId ? 'Save' : 'Connect'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openAdd} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add connection
            </button>
          )}
        </div>
      )}
    </div>
  )
}
