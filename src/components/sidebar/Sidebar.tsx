import {
  LayoutGrid, TrendingUp, BarChart2, Database,
  ShoppingCart, AlertTriangle, ScrollText, Settings,
} from 'lucide-react'

const NAV = [
  { icon: LayoutGrid, label: 'Control',  active: true  },
  { icon: TrendingUp, label: 'Strats',   active: false },
  { icon: BarChart2,  label: 'Charts',   active: false },
  { icon: Database,   label: 'Data',     active: false },
  { icon: ShoppingCart,label:'Orders',   active: false },
  { icon: AlertTriangle,label:'Risk',    active: false },
  { icon: ScrollText, label: 'Logs',     active: false },
  { icon: Settings,   label: 'Settings', active: false },
]

export default function Sidebar() {
  return (
    <aside className="w-40 bg-[#0f1117] border-r border-white/10 flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
        <div className="w-7 h-7 rounded bg-blue-500 flex items-center justify-center text-white font-bold text-sm">α</div>
        <span className="text-white font-semibold text-base tracking-wide">qi</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left
              ${active
                ? 'bg-[#3b82f6] text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {/* Light mode toggle */}
      <div className="px-4 py-4 border-t border-white/10 flex items-center gap-2">
        <span className="text-zinc-500 text-xs">Light Mode</span>
        <div className="ml-auto w-9 h-5 bg-blue-600 rounded-full relative cursor-pointer">
          <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
        </div>
      </div>
    </aside>
  )
}