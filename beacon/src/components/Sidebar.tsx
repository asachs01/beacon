import { useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ListChecks,
  ShoppingCart,
  ClipboardList,
  Trophy,
  Music,
  Image,
  Settings,
  Timer as TimerIcon,
  CloudSun,
  MoreHorizontal,
  X,
} from 'lucide-react';
import beaconIcon from '../assets/beacon-icon.svg';

export type SidebarView = 'dashboard' | 'calendar' | 'chores' | 'grocery' | 'tasks' | 'leaderboard' | 'music' | 'photos' | 'timer' | 'weather' | 'settings';

interface SidebarProps {
  activeView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  position?: 'left' | 'right' | 'bottom';
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
  { id: 'grocery', icon: <ShoppingCart size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Lists' },
  { id: 'tasks', icon: <ClipboardList size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Tasks' },
  { id: 'leaderboard', icon: <Trophy size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Leaderboard' },
  { id: 'music', icon: <Music size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Music' },
  { id: 'photos', icon: <Image size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Photos' },
  { id: 'timer', icon: <TimerIcon size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Timer' },
  { id: 'weather', icon: <CloudSun size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />, label: 'Weather' },
];

/** Items shown directly in the mobile bottom tab bar */
const MOBILE_TAB_IDS: SidebarView[] = ['dashboard', 'calendar', 'chores', 'music'];

export function Sidebar({
  activeView,
  onChangeView,
  position = 'left',
}: SidebarProps) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const mobileTabItems = NAV_ITEMS.filter((item) => MOBILE_TAB_IDS.includes(item.id));
  const mobileOverflowItems = NAV_ITEMS.filter((item) => !MOBILE_TAB_IDS.includes(item.id));

  const handleMobileNav = (view: SidebarView) => {
    onChangeView(view);
    setMobileMoreOpen(false);
  };

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        className={`sidebar sidebar--desktop sidebar--${position}`}
        aria-label="Main navigation"
        style={position === 'bottom' ? { display: 'none' } : undefined}
      >
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
          <button
            type="button"
            className={`sidebar-icon ${activeView === 'settings' ? 'sidebar-icon--active' : ''}`}
            onClick={() => onChangeView('settings')}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar (hidden on desktop via CSS) */}
      <nav className="mobile-tab-bar" aria-label="Main navigation">
        {mobileTabItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mobile-tab ${activeView === item.id ? 'mobile-tab--active' : ''}`}
            onClick={() => handleMobileNav(item.id)}
            aria-label={item.label}
          >
            {item.icon}
            <span className="mobile-tab-label">{item.label}</span>
          </button>
        ))}
        {/* More button */}
        <button
          type="button"
          className={`mobile-tab ${mobileMoreOpen ? 'mobile-tab--active' : ''}`}
          onClick={() => setMobileMoreOpen((prev) => !prev)}
          aria-label="More"
        >
          <MoreHorizontal size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
          <span className="mobile-tab-label">More</span>
        </button>

        {/* Overflow menu */}
        {mobileMoreOpen && (
          <>
            <div
              className="mobile-more-backdrop"
              onClick={() => setMobileMoreOpen(false)}
            />
            <div className="mobile-more-menu">
              <div className="mobile-more-header">
                <span className="mobile-more-title">More</span>
                <button
                  type="button"
                  className="mobile-more-close"
                  onClick={() => setMobileMoreOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={20} strokeWidth={2} />
                </button>
              </div>
              {mobileOverflowItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mobile-more-item ${activeView === item.id ? 'mobile-more-item--active' : ''}`}
                  onClick={() => handleMobileNav(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
              <button
                type="button"
                className={`mobile-more-item ${activeView === 'settings' ? 'mobile-more-item--active' : ''}`}
                onClick={() => handleMobileNav('settings')}
              >
                <Settings size={ICON_SIZE} strokeWidth={STROKE_WIDTH} />
                <span>Settings</span>
              </button>
            </div>
          </>
        )}
      </nav>
    </>
  );
}
