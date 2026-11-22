export interface GeetestCaptchaPayload {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
  captcha_id: string;
  client: 'wap';
  type?: number;
}

interface GeetestInstance {
  onReady: (cb: () => void) => GeetestInstance;
  onSuccess: (cb: () => void) => GeetestInstance;
  onClose: (cb: () => void) => GeetestInstance;
  onError: (cb: (err: unknown) => void) => GeetestInstance;
  showCaptcha: () => void;
  getValidate: () => {
    lot_number: string;
    captcha_output: string;
    pass_token: string;
    gen_time: string;
  } | null;
  destroy?: () => void;
}

declare global {
  interface Window {
    initGeetest4?: (
      config: { captchaId: string; product: string; language?: string },
      callback: (instance: GeetestInstance) => void,
    ) => void;
  }
}

const GT4_SCRIPT_URL = 'https://static.geetest.com/v4/gt4.js';

// Official wap.newsmth.net Geetest v4 scene IDs
const GEETEST_CONFIG = {
  post: { captchaId: 'ade4a85345062fda4657d64aa3206cba', type: 3 },
  like: { captchaId: '3a6990c763f90e33fa62a97faad3a05f', type: undefined },
} as const;

let scriptPromise: Promise<void> | null = null;

function ensureGt4Script(): Promise<void> {
  if (typeof window.initGeetest4 === 'function') return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GT4_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('极验验证脚本加载失败')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GT4_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('无法加载官方极验验证组件（请检查网络）'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/**
 * Opens the official Geetest v4 human-verification popup so the user can
 * complete the challenge directly in the visible UI.
 * Resolves to null if the user closes the popup without completing it.
 */
export async function requestHumanGeetest(
  scene: 'post' | 'like',
): Promise<GeetestCaptchaPayload | null> {
  await ensureGt4Script();
  if (typeof window.initGeetest4 !== 'function') {
    throw new Error('官方极验验证组件未初始化');
  }

  const cfg = GEETEST_CONFIG[scene];

  return new Promise<GeetestCaptchaPayload | null>((resolve, reject) => {
    let settled = false;
    const finish = (
      instance: GeetestInstance | null,
      fn: () => void,
    ) => {
      if (settled) return;
      settled = true;
      try {
        instance?.destroy?.();
      } catch {
        // ignore cleanup errors
      }
      fn();
    };

    window.initGeetest4!(
      {
        captchaId: cfg.captchaId,
        product: 'bind',
        language: 'zho',
      },
      (captchaObj) => {
        captchaObj
          .onReady(() => {
            captchaObj.showCaptcha();
          })
          .onSuccess(() => {
            const validated = captchaObj.getValidate();
            if (!validated?.lot_number) {
              finish(captchaObj, () => reject(new Error('未获取到有效验证凭证，请重试')));
              return;
            }
            finish(captchaObj, () =>
              resolve({
                lot_number: validated.lot_number,
                captcha_output: validated.captcha_output,
                pass_token: validated.pass_token,
                gen_time: validated.gen_time,
                captcha_id: cfg.captchaId,
                client: 'wap',
                ...(cfg.type !== undefined ? { type: cfg.type } : {}),
              }),
            );
          })
          .onClose(() => {
            finish(captchaObj, () => resolve(null));
          })
          .onError((err) => {
            const msg =
              err && typeof err === 'object' && 'msg' in err
                ? String((err as { msg?: unknown }).msg)
                : '极验组件初始化失败，请重试';
            finish(captchaObj, () => reject(new Error(msg)));
          });
      },
    );
  });
}
