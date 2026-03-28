import {
  LayoutDashboard,
  Calendar,
  ListChecks,
  ShoppingCart,
  Trophy,
  Music,
  Image,
  Settings,
  Timer as TimerIcon,
} from 'lucide-react';
import beaconIcon from '../assets/beacon-icon.svg';
import { ThemeSelector } from './ThemeSelector';

export type SidebarView = 'dashboard' | 'calendar' | 'chores' | 'grocery' | 'leaderboard' | 'music' | 'photos';

interface SidebarProps {
  activeView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  onOpenSettings: () => void;
  onToggleTimer?: () => void;
  timerOpen?: boolean;
}

const ICON_SIZE = 24;
const STROKE_WIDTH = 1.5;

interface NavItem {
  id: SidebarView;
  icon: React.ReactNode;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: <LayoutDashboard size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Dashboard' },
  { id: 'calendar', icon: <Calendar size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Calendar' },
  { id: 'chores', icon: <ListChecks size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Chores' },
  { id: 'grocery', icon: <ShoppingCart size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Grocery' },
  { id: 'leaderboard', icon: <Trophy size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Leaderboard' },
  { id: 'music', icon: <Music size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Music' },
  { id: 'photos', icon: <Image size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Photos' },
];

export function Sidebar({
  activeView,
  onChangeView,
  onOpenSettings,
  onToggleTimer,
  timerOpen = false,
}: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Beacon logo */}
      <div className="sidebar-logo">
        <img src={beaconIcon} alt="Beacon" width={32} height={32} />
      </div>

      {/* Main nav icons */}
      <div className="sidebar-nav-group">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-icon ${activeView === item.id ? 'sidebar-icon--active' : ''}`}
            onClick={() => onChangeView(item.id)}
            title={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="sidebar-divider" />

      {/* Bottom utility icons */}
      <div className="sidebar-nav-group sidebar-nav-group--bottom">
        {onToggleTimer && (
          <button
            type="button"
            className={`sidebar-icon ${timerOpen ? 'sidebar-icon--active' : ''}`}
            onClick={onToggleTimer}
            title="Timer"
            aria-label="Timer"
          >
            <TimerIcon size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
          </button>
        )}
        <button
          type="button"
          className="sidebar-icon"
          onClick={onOpenSettings}
          title="Family Settings"
          aria-label="Family Settings"
        >
          <Settings size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
        </button>
        <ThemeSelector />
      </div>
    </nav>
  );
}
