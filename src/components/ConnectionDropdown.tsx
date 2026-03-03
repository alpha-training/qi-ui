import { useState, useEffect, useRef } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { Connection } from '../types'

const STORAGE_KEY = 'qi_connections'
const ACTIVE_KEY = 'qi_active_connection'

type FormState = {
  host: string
  port: string
  name: string
  username: string
  password: string
}

const emptyForm: FormState = { host: '', port: '', name: '', username: '', password: '' }

function loadConnections(): Connection[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

export default function ConnectionDropdown() {
  const [connections, setConnections] = useState<Connection[]>(loadConnections)
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_KEY))
  const [isOpen, setIsOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
  }, [connections])

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [activeId])

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

  const activeConn = connections.find(c => c.id === activeId)
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
    })
    setShowForm(true)
  }

  function handleDelete(id: string) {
    setConnections(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  function handleSave() {
    if (!form.host.trim() || !form.port.trim()) return
    const portNum = parseInt(form.port, 10)
    if (isNaN(portNum)) return

    if (editingId) {
      setConnections(prev =>
        prev.map(c =>
          c.id === editingId
            ? {
                ...c,
                host: form.host.trim(),
                port: portNum,
                name: form.name.trim() || undefined,
                username: form.username.trim() || undefined,
                password: form.password || undefined,
              }
            : c
        )
      )
    } else {
      const newConn: Connection = {
        id: crypto.randomUUID(),
        host: form.host.trim(),
        port: portNum,
        ...(form.name.trim() && { name: form.name.trim() }),
        ...(form.username.trim() && { username: form.username.trim() }),
        ...(form.password && { password: form.password }),
      }
      setConnections(prev => [...prev, newConn])
      setActiveId(newConn.id)
    }

    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const formFields = [
    { key: 'host',     label: 'Host',     placeholder: 'localhost',   required: true,  type: 'text'     },
    { key: 'port',     label: 'Port',     placeholder: '8000',        required: true,  type: 'number'   },
    { key: 'name',     label: 'Name',     placeholder: 'dev',         required: false, type: 'text'     },
    { key: 'username', label: 'Username', placeholder: 'optional',    required: false, type: 'text'     },
    { key: 'password', label: 'Password', placeholder: 'optional',    required: false, type: 'password' },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors bg-white/5 border border-white/10 rounded px-3 py-1.5"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${activeConn ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
        <span className="font-mono">{label}</span>
        <svg
          className={`w-3 h-3 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#0f1117] border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">

          {connections.length === 0 && !showForm && (
            <div className="px-4 py-3 text-zinc-500 text-xs text-center">No connections yet</div>
          )}

          {connections.map(conn => {
            const connLabel = conn.name || `${conn.host}:${conn.port}`
            const sublabel = conn.name ? `${conn.host}:${conn.port}` : null
            const isActive = conn.id === activeId
            return (
              <div
                key={conn.id}
                className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer group transition-colors ${isActive ? 'bg-white/5' : 'hover:bg-white/5'}`}
                onClick={() => { setActiveId(conn.id); setIsOpen(false); setShowForm(false) }}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isActive ? 'text-white' : 'text-zinc-300'}`}>{connLabel}</div>
                  {sublabel && <div className="text-xs text-zinc-500 truncate font-mono">{sublabel}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => openEdit(conn)}
                    className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(conn.id)}
                    className="p-1 text-zinc-400 hover:text-red-400 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}

          {connections.length > 0 && <div className="border-t border-white/10" />}

          {showForm ? (
            <div className="px-3 py-3 space-y-2">
              <div className="text-xs font-medium text-zinc-400 mb-2">
                {editingId ? 'Edit connection' : 'New connection'}
              </div>
              {formFields.map(field => (
                <div key={field.key} className="flex items-center gap-2">
                  <label className="text-xs text-zinc-500 w-16 shrink-0">
                    {field.label}
                    {field.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.key as keyof FormState]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCancel}
                  className="flex-1 py-1.5 text-xs text-zinc-400 hover:text-white border border-white/10 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.host.trim() || !form.port.trim()}
                  className="flex-1 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editingId ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={openAdd}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
            >
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
