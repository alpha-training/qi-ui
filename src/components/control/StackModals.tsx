import { useState, useEffect, useRef } from 'react'
import { X, Copy, Trash2, Plus, AlertTriangle, Pencil } from 'lucide-react'

// ─── Shared modal shell ───────────────────────────────────────────────────────

function Modal({
  title, icon, onClose, children, width = 'w-96',
}: {
  title: string
  icon?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  width?: string
}) {
  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`${width} bg-[#0d1929] border border-white/10 rounded-2xl shadow-2xl flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {icon}
            <h2 className="text-white font-bold text-base">{title}</h2>
          </div>
          <button onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Shared input ─────────────────────────────────────────────────────────────

function ModalInput({
  value, onChange, onEnter, placeholder, error, autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  onEnter?: () => void
  placeholder?: string
  error?: string | null
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])

  return (
    <div className="space-y-1.5">
      <input
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className={`w-full bg-[#06111e] border rounded-lg px-4 py-2.5 text-sm text-white
          outline-none transition-colors placeholder:text-zinc-600
          ${error ? 'border-red-500/60 focus:border-red-500' : 'border-white/10 focus:border-blue-500'}`}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Shared footer buttons ────────────────────────────────────────────────────

function ModalFooter({
  onCancel, onConfirm, confirmLabel, confirmVariant = 'primary', disabled = false,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  disabled?: boolean
}) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <button onClick={onCancel}
        className="px-5 py-2 rounded-lg text-sm font-semibold border border-white/15 text-zinc-300
          hover:border-white/30 hover:text-white transition-all">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={disabled}
        className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
          disabled:opacity-40 disabled:cursor-not-allowed
          ${confirmVariant === 'danger'
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
        {confirmLabel}
      </button>
    </div>
  )
}

// ─── Add Stack Modal ──────────────────────────────────────────────────────────

export function AddStackModal({
  existingNames, onAdd, onClose,
}: {
  existingNames: string[]
  onAdd: (name: string, description: string, basePort: number) => void
  onClose: () => void
}) {
  const [name, setName]   = useState('')
  const [desc, setDesc]   = useState('')
  const [port, setPort]   = useState('9000')
  const [error, setError] = useState<string | null>(null)

  const validate = () => {
    if (!name.trim()) return 'Stack name is required'
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) return 'Only letters, numbers, _ and - allowed'
    if (existingNames.includes(name.trim())) return `"${name}" already exists`
    const p = parseInt(port)
    if (isNaN(p) || p < 1024 || p > 65535) return 'Port must be between 1024 and 65535'
    return null
  }

  const handleConfirm = () => {
    const err = validate()
    if (err) { setError(err); return }
    onAdd(name.trim(), desc.trim(), parseInt(port))
    onClose()
  }

  return (
    <Modal title="Add Stack" icon={<Plus size={16} className="text-blue-400" />} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Stack name *</label>
          <ModalInput value={name} onChange={v => { setName(v); setError(null) }}
            onEnter={handleConfirm} placeholder="e.g. Dev3" error={error} autoFocus />
        </div>
        <div>
          <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Description</label>
          <ModalInput value={desc} onChange={setDesc} placeholder="Optional description" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 font-medium mb-1.5 block">Base port</label>
          <ModalInput value={port} onChange={setPort} placeholder="9000" />
        </div>
        <ModalFooter onCancel={onClose} onConfirm={handleConfirm} confirmLabel="Create stack" />
      </div>
    </Modal>
  )
}

// ─── Clone Stack Modal ────────────────────────────────────────────────────────

export function CloneStackModal({
  sourceName, existingNames, onClone, onClose,
}: {
  sourceName: string
  existingNames: string[]
  onClone: (newName: string) => void
  onClose: () => void
}) {
  const [name, setName]   = useState(`${sourceName}_copy`)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (existingNames.includes(name.trim())) { setError(`"${name}" already exists`); return }
    onClone(name.trim())
    onClose()
  }

  return (
    <Modal title={`Clone "${sourceName}"`} icon={<Copy size={15} className="text-blue-400" />} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Creates a full copy of <span className="text-white font-medium">{sourceName}</span> with a new name.
        </p>
        <div>
          <label className="text-xs text-zinc-400 font-medium mb-1.5 block">New stack name *</label>
          <ModalInput value={name} onChange={v => { setName(v); setError(null) }}
            onEnter={handleConfirm} placeholder="New name" error={error} />
        </div>
        <ModalFooter onCancel={onClose} onConfirm={handleConfirm} confirmLabel="Clone stack" />
      </div>
    </Modal>
  )
}

// ─── Rename Stack Modal ───────────────────────────────────────────────────────

export function RenameStackModal({
  stackName, existingNames, onRename, onClose,
}: {
  stackName: string
  existingNames: string[]
  onRename: (newName: string) => void
  onClose: () => void
}) {
  const [name, setName]   = useState(stackName)
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('Name is required'); return }
    if (trimmed === stackName) { onClose(); return }
    if (existingNames.filter(n => n !== stackName).includes(trimmed)) {
      setError(`"${trimmed}" already exists`); return
    }
    onRename(trimmed)
    onClose()
  }

  return (
    <Modal title={`Rename "${stackName}"`} icon={<Pencil size={15} className="text-blue-400" />} onClose={onClose}>
      <div className="space-y-4">
        <ModalInput value={name} onChange={v => { setName(v); setError(null) }}
          onEnter={handleConfirm} placeholder="New name" error={error} />
        <ModalFooter onCancel={onClose} onConfirm={handleConfirm} confirmLabel="Rename" />
      </div>
    </Modal>
  )
}

// ─── Delete Stack Modal ───────────────────────────────────────────────────────

export function DeleteStackModal({
  stackName, onDelete, onClose,
}: {
  stackName: string
  onDelete: () => void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed === stackName

  return (
    <Modal
      title="Delete stack"
      icon={<Trash2 size={15} className="text-red-400" />}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
          <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">
            This will permanently delete <span className="font-bold text-white">{stackName}</span> and
            all its processes. This action cannot be undone.
          </p>
        </div>
        <div>
          <label className="text-xs text-zinc-400 font-medium mb-1.5 block">
            Type <span className="text-white font-mono">{stackName}</span> to confirm
          </label>
          <ModalInput value={typed} onChange={setTyped} onEnter={confirmed ? onDelete : undefined}
            placeholder={stackName} />
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={onDelete}
          confirmLabel="Delete permanently"
          confirmVariant="danger"
          disabled={!confirmed}
        />
      </div>
    </Modal>
  )
}