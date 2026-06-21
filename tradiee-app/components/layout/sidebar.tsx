'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useSidebar } from './sidebar-context'
import {
  LayoutDashboard, Users, FileText, Briefcase, Calendar,
  Clock, Receipt, BarChart3, Settings, Wrench, Package,
  MessageSquare, CheckSquare, Map, ClipboardList, ChevronLeft, ChevronRight,
  Truck, ShoppingCart, FileMinus, Globe
} from 'lucide-react'

// Top-level item shown above the groups
const home = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }

const groups = [
  {
    label: 'Customers & Jobs',
    items: [
      { href: '/enquiries', label: 'Enquiries', icon: MessageSquare },
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/quotes', label: 'Quotes', icon: FileText },
      { href: '/jobs', label: 'Jobs', icon: Briefcase },
      { href: '/jobs/map', label: 'Job Map', icon: Map },
      { href: '/schedule', label: 'Schedule', icon: Calendar },
      { href: '/timesheets', label: 'Timesheets', icon: Clock },
      { href: '/invoices', label: 'Invoices', icon: Receipt },
      { href: '/forms', label: 'Forms', icon: ClipboardList },
      { href: '/todos', label: 'To-Do', icon: CheckSquare },
    ],
  },
  {
    label: 'Suppliers & Orders',
    items: [
      { href: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCart },
      { href: '/bills', label: 'Bills', icon: FileMinus },
      { href: '/suppliers', label: 'Suppliers', icon: Truck },
      { href: '/price-list', label: 'Price List', icon: Package },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3 },
      { href: '/website', label: 'Website', icon: Globe },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  if (href === '/jobs') return pathname === '/jobs' || (pathname.startsWith('/jobs/') && !pathname.startsWith('/jobs/map'))
  return pathname.startsWith(href)
}

// Field staff get a focused nav — no sales/financial/procurement pages.
const STAFF_HREFS = new Set(['/dashboard', '/jobs', '/jobs/map', '/schedule', '/timesheets', '/forms', '/todos', '/settings'])

export function Sidebar({ isStaff = false }: { isStaff?: boolean }) {
  const pathname = usePathname()
  const { collapsed, setCollapsed } = useSidebar()
  const visibleGroups = isStaff
    ? groups.map(g => ({ ...g, items: g.items.filter(i => STAFF_HREFS.has(i.href)) })).filter(g => g.items.length > 0)
    : groups

  return (
    // Hidden on mobile; icon-only on md (tablet); full on lg (desktop) unless toggled
    <aside className={cn(
      'hidden md:flex fixed inset-y-0 left-0 bg-gray-900 flex-col z-40 transition-all duration-200',
      collapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-gray-800 shrink-0',
        collapsed ? 'justify-center px-0' : 'px-5 justify-between'
      )}>
        {collapsed ? (
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
            <Wrench className="h-4 w-4 text-white" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
                <Wrench className="h-4 w-4 text-white" />
              </div>
              <span className="text-white font-semibold text-sm truncate">IndustryForms</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {(() => {
          const renderLink = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) => {
            const active = isActive(pathname, href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg text-sm transition-colors',
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
                    active
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && label}
                </Link>
              </li>
            )
          }
          return (
            <>
              <ul className="space-y-0.5">{renderLink(home)}</ul>
              {visibleGroups.map(group => (
                <div key={group.label} className="mt-4">
                  {collapsed
                    ? <div className="mx-2 mb-1.5 border-t border-gray-800" />
                    : <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{group.label}</p>
                  }
                  <ul className="space-y-0.5">{group.items.map(renderLink)}</ul>
                </div>
              ))}
            </>
          )
        })()}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="p-2 border-t border-gray-800">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex justify-center text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  )
}
