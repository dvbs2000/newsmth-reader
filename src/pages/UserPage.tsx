import { useEffect, useState } from 'react';
import { Mail, Send, X } from 'lucide-react';
import { api } from '../api/client';
import { ModalDialog } from '../components/ModalDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';
import { useRouter } from '../state/router';
import type { AccountObj, ArticleObj } from '../types/smth';
import { stripHtmlTags } from '../utils/content';
import { formatExactTime, formatRelativeTime } from '../utils/format';

interface UserPageProps {
  username: string;
}

export function UserPage({ username }: UserPageProps) {
  const { status, openLoginDialog } = useAuth();
  const { navigate } = useRouter();
  const { showToast } = useToast();

  const [account, setAccount] = useState<AccountObj | null>(null);
  const [title, setTitle] = useState('');
  const [score, setScore] = useState<number | undefined>(undefined);
  const [posts, setPosts] = useState<ArticleObj[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mailOpen, setMailOpen] = useState(false);
  const [mailBody, setMailBody] = useState('');

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getUserDetail(username),
      api.getUserPosts(username, 1).catch(() => ({ content: [] })),
    ])
      .then(([detail, postRes]) => {
        setAccount(detail.account || null);
        setTitle(detail.title || '');
        setScore(detail.newsmthScore?.total);
        setPosts(postRes.content || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载用户信息失败'))
      .finally(() => setLoading(false));
  }, [username]);

  const handleSendMail = async () => {
    if (!mailBody.trim()) return;
    try {
      await api.sendMessage(username, mailBody.trim());
      showToast(`已向 ${username} 发送私信`);
      setMailOpen(false);
      setMailBody('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送失败');
    }
  };

  if (loading) return <div className="empty-state">加载用户资料...</div>;
  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="thread-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h1 className="thread-subject" style={{ marginBottom: 4 }}>
              {account?.name || username}
            </h1>
            <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
              {account?.nick || ''} {title ? `· ${title}` : ''}
            </div>
          </div>

          <button
            type="button"
            className="chip-btn primary"
            onClick={() => {
              if (!status?.loggedIn) {
                openLoginDialog();
                showToast('发私信前请先登录');
                return;
              }
              setMailOpen(true);
            }}
          >
            <Mail size={14} />
            发私信
          </button>
        </div>

        <div className="topic-meta" style={{ marginTop: 12 }}>
          {account?.levelTitle ? <span>身份：{account.levelTitle}</span> : null}
          {score !== undefined ? <span>积分：{score}</span> : null}
          {account?.articleCount !== undefined ? <span>发文：{account.articleCount}</span> : null}
          {account?.fansCount !== undefined ? <span>粉丝：{account.fansCount}</span> : null}
          {account?.loginTime ? <span>最近登录：{formatExactTime(account.loginTime)}</span> : null}
        </div>
      </div>

      <div className="section-heading">近期动态 ({posts.length})</div>
      {posts.length === 0 ? (
        <div className="empty-state">暂无公开近期发文</div>
      ) : (
        <ul className="feed-list">
          {posts.map((art) => {
            const subject = stripHtmlTags(art.subject || art.topic?.subject || '(无标题)');
            const tid = art.topicId || art.topic?.id;
            return (
              <li
                key={art.id}
                className="topic-row"
                onClick={() => {
                  if (tid) {
                    navigate({ name: 'topic', topicId: tid, boardName: art.board?.name, subject });
                  }
                }}
              >
                <div className="topic-title">{subject}</div>
                <div className="topic-meta">
                  {art.board?.name ? (
                    <span className="board-pill">{art.board.title || art.board.name}</span>
                  ) : null}
                  <span>{formatRelativeTime(art.postTime)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ModalDialog open={mailOpen} onClose={() => setMailOpen(false)} ariaLabel={`给 ${username} 发私信`}>
        <div className="dialog-head">
          <h2 className="dialog-title">给 {username} 发私信</h2>
          <button type="button" className="icon-btn" onClick={() => setMailOpen(false)}>
            <X size={17} />
          </button>
        </div>
        <div className="dialog-body">
          <textarea
            className="text-area"
            placeholder="输入私信内容..."
            value={mailBody}
            onChange={(e) => setMailBody(e.target.value)}
          />
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => setMailOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!mailBody.trim()}
            onClick={() => void handleSendMail()}
          >
            <Send size={14} />
            发送
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
