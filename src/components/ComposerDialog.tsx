import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Send, Trash2, X } from 'lucide-react';
import { api } from '../api/client';
import { requestHumanGeetest, type GeetestCaptchaPayload } from '../utils/geetest';
import { ModalDialog } from './ModalDialog';
import { useToast } from './Toast';

export type ComposerMode =
  | { type: 'new-topic'; boardId: string; boardTitle: string }
  | {
      type: 'reply';
      boardId: string;
      articleId: string;
      replyTargetLabel: string;
      initialQuote?: string;
    }
  | {
      type: 'edit';
      boardId: string;
      articleId: string;
      initialSubject: string;
      initialBody: string;
    };

interface ComposerDialogProps {
  mode: ComposerMode | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function ComposerDialog({ mode, onClose, onSuccess }: ComposerDialogProps) {
  const { showToast } = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [uploadToken, setUploadToken] = useState<string | undefined>(undefined);
  const [uploadedNames, setUploadedNames] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captchaActive, setCaptchaActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!mode) return;
    setError(null);
    setCaptchaActive(false);
    setUploadToken(undefined);
    setUploadedNames([]);
    if (mode.type === 'new-topic') {
      setSubject('');
      setBody('');
    } else if (mode.type === 'reply') {
      setSubject('');
      setBody(mode.initialQuote || '');
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(0, 0);
        }
      }, 30);
    } else {
      setSubject(mode.initialSubject);
      setBody(mode.initialBody);
    }
  }, [mode]);

  const handleFiles = async (fileList: FileList | File[]) => {
    if (!mode) return;
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    try {
      let token = uploadToken;
      if (!token) {
        const res = await api.getUploadToken();
        token = res.token;
        setUploadToken(token);
      }
      await api.uploadFiles(mode.boardId, token, files);
      setUploadedNames((prev) => [...prev, ...files.map((f) => f.name)]);
      showToast(`已上传 ${files.length} 个附件`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '附件上传失败');
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (filename: string) => {
    if (!uploadToken) return;
    try {
      await api.deleteUploadedFile(uploadToken, [filename]);
      setUploadedNames((prev) => prev.filter((n) => n !== filename));
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除附件失败');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      void handleFiles(imageFiles);
    }
  };

  const handleSubmit = async () => {
    if (!mode) return;
    setError(null);

    if (mode.type === 'new-topic' && !subject.trim()) {
      setError('请填写帖子标题');
      return;
    }
    if (!body.trim() && uploadedNames.length === 0) {
      setError('正文不能为空');
      return;
    }

    setSubmitting(true);
    try {
      let captcha: GeetestCaptchaPayload | undefined;

      // Official wap.newsmth.net pre-check: if server requires human verification (code===3),
      // temporarily hide the <dialog> Top Layer so the official Geetest v4 popup is unobstructed.
      if (mode.type === 'new-topic' || mode.type === 'reply') {
        const check = await api.checkPublishCaptcha().catch(() => ({ needCaptcha: false }));
        if (check.needCaptcha) {
          setCaptchaActive(true);
          try {
            const verified = await requestHumanGeetest('post');
            if (!verified) {
              setCaptchaActive(false);
              setSubmitting(false);
              return;
            }
            captcha = verified;
          } finally {
            setCaptchaActive(false);
          }
        }
      }

      if (mode.type === 'new-topic') {
        await api.publishTopic({
          boardId: mode.boardId,
          subject: subject.trim(),
          body,
          uploadToken,
          captcha,
        });
        showToast('发帖成功');
      } else if (mode.type === 'reply') {
        await api.replyArticle({
          articleId: mode.articleId,
          body,
          uploadToken,
          captcha,
        });
        showToast('回复已发送');
      } else {
        await api.updateArticle({
          articleId: mode.articleId,
          subject: subject.trim(),
          body,
          uploadToken,
        });
        showToast('文章已更新');
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setCaptchaActive(false);
      setSubmitting(false);
    }
  };

  const title =
    mode?.type === 'new-topic'
      ? `发表新帖 · ${mode.boardTitle}`
      : mode?.type === 'edit'
        ? '编辑文章'
        : mode
          ? `回复 · ${mode.replyTargetLabel}`
          : '';

  return (
    <ModalDialog
      open={Boolean(mode) && !captchaActive}
      onClose={onClose}
      ariaLabel={title || '编辑器'}
    >
      <div className="dialog-head">
        <h2 className="dialog-title">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
          <X size={17} />
        </button>
      </div>

      <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error ? <div className="error-banner">{error}</div> : null}

        {mode && (mode.type === 'new-topic' || mode.type === 'edit') ? (
          <div>
            <label className="field-label" htmlFor="composer-subject">
              标题
            </label>
            <input
              id="composer-subject"
              className="text-input"
              placeholder="输入简洁明确的标题..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
        ) : null}

        <div>
          <label className="field-label" htmlFor="composer-body">
            正文（支持 Cmd+Enter 快速发送，支持直接粘贴截图上传）
          </label>
          <textarea
            id="composer-body"
            ref={textareaRef}
            className="text-area"
            placeholder="写点什么..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="chip-btn"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 size={14} /> : <ImagePlus size={14} />}
            {uploading ? '上传中...' : '添加图片附件'}
          </button>

          {uploadedNames.map((name) => (
            <span key={name} className="chip-btn" style={{ gap: 6 }}>
              <span>{name}</span>
              <button
                type="button"
                aria-label={`移除 ${name}`}
                onClick={() => void removeAttachment(name)}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="dialog-foot">
        <button type="button" className="btn" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={submitting || uploading}
          onClick={() => void handleSubmit()}
        >
          <Send size={14} />
          {submitting ? '提交中...' : '发送'}
        </button>
      </div>
    </ModalDialog>
  );
}
