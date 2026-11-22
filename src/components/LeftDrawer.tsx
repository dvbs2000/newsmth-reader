import {
  Flame,
  FolderTree,
  Keyboard,
  LogIn,
  LogOut,
  Mail,
  Search,
  Settings,
  Star,
  User,
} from 'lucide-react';
import { useAuth } from '../state/auth';
import { useRouter, type Route } from '../state/router';
import { useToast } from './Toast';

interface LeftDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts: () => void;
}

export function LeftDrawer({ open, onClose, onOpenShortcuts }: LeftDrawerProps) {
  const { route, navigate } = useRouter();
  const { status, unread, openLoginDialog, logout } = useAuth();
  const { showToast } = useToast();

  const go = (target: Route) => {
    navigate(target);
    onClose();
  };

  const account = status?.profile?.account;

  const navItems: Array<{
    key: Route['name'];
    label: string;
    icon: typeof Flame;
    badge?: number;
    target: Route;
  }> = [
    { key: 'home', label: '首页热点', icon: Flame, target: { name: 'home' } },
    { key: 'favorites', label: '收藏版面', icon: Star, target: { name: 'favorites' } },
    { key: 'sections', label: '分类分区', icon: FolderTree, target: { name: 'sections' } },
    {
      key: 'messages',
      label: '消息中心',
      icon: Mail,
      badge: unread.total > 0 ? unread.total : undefined,
      target: { name: 'messages' },
    },
    { key: 'search', label: '全站搜索', icon: Search, target: { name: 'search' } },
    { key: 'settings', label: '偏好设置', icon: Settings, target: { name: 'settings' } },
  ];

  return (
    <>
      <div
        className={`drawer-backdrop ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`drawer-panel ${open ? 'open' : ''}`}
        aria-label="主导航"
        aria-hidden={!open}
      >
        <div className="drawer-profile">
          <div className="drawer-brand">newsmth-reader</div>
          {status?.loggedIn && account ? (
            <div className="drawer-user-row">
              <button
                type="button"
                style={{ textAlign: 'left', flex: 1, minWidth: 0 }}
                onClick={() => go({ name: 'user', username: account.name })}
              >
                <div className="drawer-username">{account.name}</div>
                <div className="drawer-usernick">
                  {account.nick || status.profile?.title || '已登录'}
                </div>
              </button>
              <button
                type="button"
                className="icon-btn"
                title="退出登录"
                aria-label="退出登录"
                onClick={async () => {
                  await logout();
                  showToast('已退出水木账号');
                  onClose();
                }}
              >
                <LogOut size={16} strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <div className="drawer-user-row">
              <div>
                <div className="drawer-username">游客浏览</div>
                <div className="drawer-usernick">登录解锁收藏、发帖与私信</div>
              </div>
              <button
                type="button"
                className="chip-btn primary"
                onClick={() => {
                  onClose();
                  openLoginDialog();
                }}
              >
                <LogIn size={14} />
                登录
              </button>
            </div>
          )}
        </div>

        <nav className="drawer-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = route.name === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`drawer-item ${active ? 'active' : ''}`}
                onClick={() => go(item.target)}
              >
                <Icon size={17} strokeWidth={1.75} />
                <span>{item.label}</span>
                {item.badge ? <span className="drawer-badge">{item.badge}</span> : null}
              </button>
            );
          })}

          {status?.loggedIn && account ? (
            <button
              type="button"
              className={`drawer-item ${
                route.name === 'user' && route.username === account.name ? 'active' : ''
              }`}
              onClick={() => go({ name: 'user', username: account.name })}
            >
              <User size={17} strokeWidth={1.75} />
              <span>我的主页</span>
            </button>
          ) : null}
        </nav>

        <div className="drawer-footer">
          <button
            type="button"
            className="floor-action-btn"
            onClick={() => {
              onClose();
              onOpenShortcuts();
            }}
          >
            <Keyboard size={15} />
            <span>快捷键说明 (?)</span>
          </button>
          <span className="mono">local</span>
        </div>
      </aside>
    </>
  );
}
