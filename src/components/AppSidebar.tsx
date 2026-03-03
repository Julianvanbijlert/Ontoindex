import { Search, Upload, BarChart3, Settings, BookOpen, GitCompare } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: Search, label: 'Search' },
  { to: '/browse', icon: BookOpen, label: 'Browse' },
  { to: '/compare', icon: GitCompare, label: 'Compare' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/sources', icon: BarChart3, label: 'Sources' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export const AppSidebar = () => {
  return (
    <aside className="fixed left-0 top-0 h-screen w-16 lg:w-56 bg-card border-r border-border flex flex-col z-50">
      <div className="p-3 lg:p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-hero flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-bold text-sm">A</span>
          </div>
          <span className="hidden lg:block font-semibold text-foreground tracking-tight">Axioma</span>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )
            }
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:block">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="hidden lg:block text-xs text-muted-foreground">
          v0.1.0 — MVP
        </div>
      </div>
    </aside>
  );
};
