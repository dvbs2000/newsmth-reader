import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CheckCheck, LogIn, PenSquare, Send, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { ModalDialog } from '../components/ModalDialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../state/auth';
import { useRouter } from '../state/router';
import type { AccountObj, ConversationItem, MessageObj, NotifyItem } from '../types/smth';
import { stripHtmlTags } from '../utils/content';
import { formatRelativeTime } from '../utils/format';

type MsgTab = 'mail' | 'reply' | 'at' | 'like';

export function MessagesPage() {
  const { status, unread, openLoginDialog, refreshUnread } = useAuth();
  const { navigate } = useRouter();
  const { showToast } = useToast();

  const [tab, setTab] = useState<MsgTab>('mail');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<{ id: string; name: string } | null>(null);
  const [messages, setMessages] = useState<MessageObj[]>([]);
  const [me, setMe] = useState<AccountObj | null>(null);
  const [replyText, setReplyText] = useState('');

  const [notifies, setNotifies] = useState<NotifyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newMailOpen, setNewMailOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [newBody, setNewBody] = useState('');

  const loadList = useCallback(async () => {
    if (!status?.loggedIn) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === 'mail') {
        const res = await api.getConversations(1);
        const list = (res.conversations || []).map((c, idx) => ({
          ...c,
          lastMessage: res.lastMessages?.[idx],
        }));
        setConversations(list);
      } else {
        const typeNum = tab === 'at' ? 1 : tab === 'reply' ? 2 : 3;
        const res = await api.getNotifications(typeNum, 0, 0);
        setNotifies(res.notifies || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载消息失败');
    } finally {
      setLoading(false);
    }
  }, [status?.loggedIn, tab]);

  useEffect(() => {
    setActiveSpeaker(null);
    void loadList();
  }, [loadList]);

  const openConversation = async (speakerId: string, speakerName: string) => {
    setActiveSpeaker({ id: speakerId, name: speakerName });
    setLoading(true);
    try {
      const res = await api.getConversationMessages(speakerId, 1);
      setMessages(res.messages || []);
      setMe(res.account || null);
      await api.markConversationRead(speakerId).catch(() => {});
      void refreshUnread();
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取对话失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInThread = async () => {
    if (!activeSpeaker || !replyText.trim()) return;
    try {
      await api.sendMessage(activeSpeaker.name, replyText.trim());
      setReplyText('');
      showToast('私信已发送');
      await openConversation(activeSpeaker.id, activeSpeaker.name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送失败');
    }
  };

  const handleSendNewMail = async () => {
    if (!newRecipient.trim() || !newBody.trim()) return;
    try {
      await api.sendMessage(newRecipient.trim(), newBody.trim());
      showToast(`已向 ${newRecipient.trim()} 发送私信`);
      setNewMailOpen(false);
      setNewRecipient('');
      setNewBody('');
      if (tab === 'mail') void loadList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '发送失败');
    }
  };

  if (!status?.loggedIn) {
    return (
      <div className="empty-state">
        <p style={{ marginBottom: 14 }}>登录后即可收发水木站内私信，查看回复、@我 与点赞提醒</p>
        <button type="button" className="btn btn-primary" onClick={openLoginDialog}>
          <LogIn size={15} />
          登录水木账号
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="subtabs">
        {(
          [
            ['mail', '站内私信', unread.mail],
            ['reply', '回复我的', unread.reply],
            ['at', '@我的', unread.at],
            ['like', '点赞', unread.like],
          ] as Array<[MsgTab, string, number]>
        ).map(([k, label, count]) => (
          <button
            key={k}
            type="button"
            className={`subtab ${tab === k ? 'active' : ''}`}
            onClick={() => setTab(k)}
          >
            {label}
            {count > 0 ? <span className="mono" style={{ marginLeft: 5, color: 'var(--accent)' }}>{count}</span> : null}
          </button>
        ))}
        <div className="subtabs-spacer" />
        {tab === 'mail' ? (
          <button type="button" className="chip-btn primary" onClick={() => setNewMailOpen(true)}>
            <PenSquare size={13} />
            写私信
          </button>
        ) : (
          <button
            type="button"
            className="chip-btn"
            onClick={async () => {
              const typeNum = tab === 'at' ? 1 : tab === 'reply' ? 2 : 3;
              await api.markAllNotifyRead(typeNum).catch(() => {});
              showToast('已全部标为已读');
              void loadList();
              void refreshUnread();
            }}
          >
            <CheckCheck size={13} />
            全部已读
          </button>
        )}
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {tab === 'mail' && activeSpeaker ? (
        <div style={{ paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setActiveSpeaker(null);
                void loadList();
              }}
            >
              <ArrowLeft size={13} />
              返回列表
            </button>
            <strong style={{ fontSize: '0.95rem' }}>{activeSpeaker.name}</strong>
          </div>

          {loading ? (
            <div className="empty-state">加载对话...</div>
          ) : (
            <div>
              {[...messages].reverse().map((m, idx) => {
                const isMine = Boolean(me?.id && m.senderId === me.id);
                return (
                  <div key={m.id || idx} className={`chat-bubble ${isMine ? 'mine' : ''}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.76rem',
                        color: 'var(--text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      <span>{isMine ? me?.name || '我' : activeSpeaker.name}</span>
                      <span className="tabular">{formatRelativeTime(m.sendTime)}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.6 }}>
                      {stripHtmlTags(m.body)}
                    </div>
                  </div>
                );
              })}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <input
                  className="text-input"
                  placeholder={`回复 ${activeSpeaker.name}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendInThread();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!replyText.trim()}
                  onClick={() => void handleSendInThread()}
                >
                  <Send size={14} />
                  发送
                </button>
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="empty-state">加载中...</div>
      ) : tab === 'mail' ? (
        conversations.length === 0 ? (
          <div className="empty-state">暂无站内私信</div>
        ) : (
          <ul className="feed-list">
            {conversations.map((c) => {
              const name = c.speaker?.name || c.speakerId;
              return (
                <li
                  key={c.speakerId}
                  className="topic-row"
                  onClick={() => void openConversation(c.speakerId, name)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong style={{ fontSize: '0.94rem' }}>{name}</strong>
                    {c.unread ? (
                      <span className="op-mark">{c.unread} 未读</span>
                    ) : null}
                    <span
                      className="tabular"
                      style={{ marginLeft: 'auto', fontSize: '0.76rem', color: 'var(--text-muted)' }}
                    >
                      {formatRelativeTime(c.lastMessage?.sendTime)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ minWidth: 28, height: 28 }}
                      title="删除会话"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!window.confirm(`确认删除与 ${name} 的私信会话？`)) return;
                        await api.deleteConversation(c.speakerId);
                        setConversations((prev) =>
                          prev.filter((item) => item.speakerId !== c.speakerId),
                        );
                        showToast('已删除会话');
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    {stripHtmlTags(c.lastMessage?.body || c.lastMessage?.subject || '点击查看对话')}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : notifies.length === 0 ? (
        <div className="empty-state">暂无提醒</div>
      ) : (
        <ul className="feed-list">
          {notifies.map((n) => {
            const actor = n.transactorName || n.transactor?.name || '用户';
            const topicId = n.target?.topicId || n.cause?.topicId;
            const subject = stripHtmlTags(n.target?.subject || n.cause?.subject || '查看帖子');
            const excerpt = stripHtmlTags(n.cause?.body || '');
            return (
              <li
                key={n.id}
                className={`topic-row ${n.status === 2 ? 'read' : ''}`}
                onClick={async () => {
                  await api.markNotifyRead(n.id).catch(() => {});
                  void refreshUnread();
                  if (topicId) {
                    navigate({ name: 'topic', topicId, subject });
                  }
                }}
              >
                <div className="topic-meta" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <strong style={{ color: 'var(--text)' }}>{actor}</strong>{' '}
                    {tab === 'at' ? '提到了你' : tab === 'reply' ? '回复了你' : '赞了你'}
                  </span>
                  <span>{formatRelativeTime(n.createTime)}</span>
                </div>
                <div className="topic-title" style={{ fontSize: '0.92rem' }}>
                  {subject}
                </div>
                {excerpt ? (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {excerpt.slice(0, 120)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ModalDialog open={newMailOpen} onClose={() => setNewMailOpen(false)} ariaLabel="发送新私信">
        <div className="dialog-head">
          <h2 className="dialog-title">写新私信</h2>
          <button type="button" className="icon-btn" onClick={() => setNewMailOpen(false)}>
            <X size={17} />
          </button>
        </div>
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label" htmlFor="mail-recipient">
              收件人水木 ID
            </label>
            <input
              id="mail-recipient"
              className="text-input"
              placeholder="输入对方英文 ID..."
              value={newRecipient}
              onChange={(e) => setNewRecipient(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="mail-body">
              内容
            </label>
            <textarea
              id="mail-body"
              className="text-area"
              placeholder="输入私信内容..."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
            />
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={() => setNewMailOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!newRecipient.trim() || !newBody.trim()}
            onClick={() => void handleSendNewMail()}
          >
            <Send size={14} />
            发送
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
