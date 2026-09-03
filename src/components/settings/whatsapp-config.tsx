'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import { toast } from 'sonner';
import {
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
  AlertTriangle,
  RotateCcw,
  Phone,
  MessageSquare,
  ShieldCheck,
  Info,
  RefreshCw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SettingsPanelHead } from './settings-panel-head';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { WhatsAppConfig as WhatsAppConfigType } from '@/types';

const MASKED_TOKEN =
  'Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢Ã¢ÂÂ¢';

type ConnectionStatus = 'connected' | 'disconnected' | 'unknown';
type ResetReason = 'token_corrupted' | 'meta_api_error' | null;

export function WhatsAppConfig() {
  const t = useTranslations('Settings.whatsapp');
  const supabase = createClient();
  // After multi-user, whatsapp_config is one-row-per-account, not
  // one-row-per-user. We pull `accountId` straight off the auth
  // context and key every read off it Ã¢ÂÂ so a teammate who just
  // joined an account sees the inviter's saved config without
  // having to re-enter anything.
  const {
    user,
    accountId,
    loading: authLoading,
    profileLoading,
    canEditSettings,
  } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfigType | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('unknown');
  const [resetReason, setResetReason] = useState<ResetReason>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  // Guards against re-hydrating the form when the load effect below
  // re-runs for reasons unrelated to actually switching accounts Ã¢ÂÂ
  // e.g. Supabase's onAuthStateChange fires a token refresh (new
  // `user` object, profileLoading flips true/false) when the browser
  // tab regains focus. Without this, that churn calls fetchConfig()
  // again and overwrites whatever the user typed but hadn't saved yet.
  const loadedAccountIdRef = useRef<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pin, setPin] = useState('');
  const [tokenEdited, setTokenEdited] = useState(false);

  // Inbound-media mirror (issue #466). Unlike everything else on this
  // page it is NOT part of handleSave: that path insists on re-entering
  // the access token so it can re-verify with Meta, which is a silly
  // toll to pay for flipping a boolean. The switch writes straight to
  // the row instead Ã¢ÂÂ RLS (migration 017) restricts whatsapp_config
  // UPDATE to admins, hence the canEditSettings gate below; without it
  // a viewer's toggle would match zero rows and appear to work.
  const [mirrorMedia, setMirrorMedia] = useState(true);
  const [metaPhoneInfo, setMetaPhoneInfo] = useState<any>(null);
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [savingMirror, setSavingMirror] = useState(false);

  // True once /register has succeeded on Meta's side (timestamp set
  // in the row). When false, the saved config is metadata-only and
  // Meta will silently drop every inbound event Ã¢ÂÂ that's the
  // multi-number bug that prompted this work.
  const isRegistered = Boolean(config?.registered_at);
  const lastRegistrationError = config?.last_registration_error ?? null;

  const [verifyingRegistration, setVerifyingRegistration] = useState(false);
  type RegistrationProbe = {
    live: boolean;
    checks: Record<string, boolean | null>;
    errors?: string[];
    last_registration_error?: string | null;
    registered_at?: string | null;
    subscribed_apps_at?: string | null;
  };
  const [registrationProbe, setRegistrationProbe] =
    useState<RegistrationProbe | null>(null);

  // InÃÂ­cio do Embedded Signup v4
  const [connectingFb, setConnectingFb] = useState(false);

  useEffect(() => {
    const initFacebook = () => {
      try {
        (window as any).FB.init({
          appId: process.env.NEXT_PUBLIC_META_APP_ID || '1090910110260045',
          cookie: true,
          xfbml: true,
          version: 'v20.0',
        });
      } catch (e) {
        console.error('FB.init error:', e);
      }
    };

    if ((window as any).FB) {
      initFacebook();
    } else {
      (window as any).fbAsyncInit = initFacebook;
    }
  }, []);

  const handleConnectFacebook = () => {
    if (!(window as any).FB) {
      alert(
        'O SDK do Facebook foi bloqueado! Desative seu AdBlock (ou o bloqueador de rastreamento do navegador) e dê F5 na página.'
      );
      return;
    }
    setConnectingFb(true);
    (window as any).FB.login(
      (response: any) => {
        if (response.authResponse && response.authResponse.code) {
          exchangeTokenWithBackend(response.authResponse.code);
        } else {
          toast.error('Login cancelado ou nÃÂ£o autorizado.');
          setConnectingFb(false);
        }
      },
      {
        config_id: process.env.NEXT_PUBLIC_META_CONFIG_ID || '1957480661587143',
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '2',
        },
      }
    );
  };

  const exchangeTokenWithBackend = async (oauthCode: string) => {
    try {
      const res = await fetch('/api/whatsapp/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: oauthCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao vincular conta.');
      }

      toast.success('WhatsApp Business conectado com sucesso!');
      if (accountId) fetchConfig(accountId);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setConnectingFb(false);
    }
  };
  // Fim do Embedded Signup v4

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/whatsapp/webhook`
      : '';

  const fetchConfig = useCallback(
    async (acctId: string) => {
      setLoading(true);
      try {
        // Load form values from Supabase (shows what's in DB).
        // Switched from `user_id` (which would only match the row's
        // original author) to `account_id` so every member of the
        // account sees the same saved configuration. UNIQUE(account_id)
        // on the table guarantees the .maybeSingle() return type
        // remains accurate.
        const { data, error } = await supabase
          .from('whatsapp_config')
          .select('*')
          .eq('account_id', acctId)
          .maybeSingle();

        if (error) {
          console.error('Failed to load config row:', error);
        }

        if (data) {
          setConfig(data);
          setPhoneNumberId(data.phone_number_id || '');
          setWabaId(data.waba_id || '');
          setAccessToken(MASKED_TOKEN);
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
          // Undefined on a row read before migration 039 Ã¢ÂÂ treat that as
          // on, matching the webhook's own default.
          setMirrorMedia(data.mirror_inbound_media !== false);
        } else {
          setConfig(null);
          setPhoneNumberId('');
          setWabaId('');
          setAccessToken('');
          setVerifyToken('');
          setPin('');
          setTokenEdited(false);
          setMirrorMedia(true);
        }
        // Clear any stale probe result when reloading the row.
        setRegistrationProbe(null);

        // Then verify health via the API (decrypts token + pings Meta)
        if (data) {
          try {
            const res = await fetch('/api/whatsapp/config', { method: 'GET' });
            const payload = await res.json();

            if (payload.connected) {
              setConnectionStatus('connected');
              setResetReason(null);
              setStatusMessage('');
            } else {
              setConnectionStatus('disconnected');
              setResetReason(
                payload.needs_reset
                  ? 'token_corrupted'
                  : payload.reason === 'meta_api_error'
                    ? 'meta_api_error'
                    : null
              );
              setStatusMessage(payload.message || '');
            }
          } catch (err) {
            console.error('Health check failed:', err);
            setConnectionStatus('disconnected');
          }
        } else {
          setConnectionStatus('disconnected');
          setResetReason(null);
          setStatusMessage('');
        }
      } catch (err) {
        console.error('fetchConfig error:', err);
        toast.error('Failed to load WhatsApp configuration');
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Need both the auth session (`!authLoading`) AND the profile
    // (`!profileLoading`, which carries `accountId`). Without the
    // second guard, the effect would fire with `accountId === null`
    // for the first render window and bail without ever retrying
    // once the profile arrives.
    if (authLoading || profileLoading) return;
    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }
    if (loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    fetchConfig(accountId);
  }, [authLoading, profileLoading, user?.id, accountId, fetchConfig]);

  useEffect(() => {
    async function fetchMetaPhoneInfo() {
      if (config?.status !== 'connected' || metaPhoneInfo || fetchingMeta)
        return;
      setFetchingMeta(true);
      try {
        const res = await fetch('/api/whatsapp/config', { method: 'GET' });
        const data = await res.json();
        if (data?.phone_info) {
          setMetaPhoneInfo(data.phone_info);
        }
      } catch (err) {
        console.error('Failed to fetch meta phone info', err);
      } finally {
        setFetchingMeta(false);
      }
    }
    fetchMetaPhoneInfo();
  }, [config?.status, metaPhoneInfo, fetchingMeta]);

  async function handleToggleMirrorMedia(next: boolean) {
    if (!config || !accountId || savingMirror) return;
    // Optimistic Ã¢ÂÂ the switch should feel instant; a failure rolls it
    // back rather than leaving the UI ahead of the row.
    const previous = mirrorMedia;
    setMirrorMedia(next);
    setSavingMirror(true);
    try {
      const { error } = await supabase
        .from('whatsapp_config')
        .update({ mirror_inbound_media: next })
        .eq('account_id', accountId);
      if (error) throw new Error(error.message);
      setConfig({ ...config, mirror_inbound_media: next });
    } catch (error) {
      console.error('Failed to update media retention setting:', error);
      setMirrorMedia(previous);
      toast.error(t('mirrorMediaSaveFailed'));
    } finally {
      setSavingMirror(false);
    }
  }

  async function handleSave() {
    if (!phoneNumberId.trim()) {
      toast.error('Phone Number ID is required');
      return;
    }
    if (!config && (!accessToken.trim() || !tokenEdited)) {
      toast.error('Access Token is required for initial setup');
      return;
    }

    try {
      setSaving(true);

      // Always POST through the API Ã¢ÂÂ it verifies with Meta and encrypts
      // the access_token server-side with ENCRYPTION_KEY. Skipping this
      // and writing direct to Supabase stores the token in plaintext,
      // which then fails decryption on every subsequent health check.
      const payload: Record<string, unknown> = {
        phone_number_id: phoneNumberId.trim(),
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        // Optional Ã¢ÂÂ only sent when the user filled it in. The server
        // requires it on first save or when changing numbers; for a
        // simple token rotation, leaving it blank skips re-register.
        pin: pin.trim() || null,
      };

      if (tokenEdited && accessToken !== MASKED_TOKEN && accessToken.trim()) {
        payload.access_token = accessToken.trim();
      } else if (config) {
        // Existing config Ã¢ÂÂ reuse stored encrypted token by decrypting on the
        // server. But our POST handler requires an access_token to verify
        // with Meta. If the user didn't change the token, we need to signal
        // that. Simplest: require token re-entry if they're updating.
        toast.error('Please re-enter the Access Token to save changes');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        setSaving(false);
        return;
      }

      // The route now returns a structured outcome:
      //   * registered=true   Ã¢ÂÂ number is live, events will flow
      //   * registered=false  Ã¢ÂÂ credentials saved but /register
      //                         failed; UI shows the specific error
      //                         and a retry path. registration_error
      //                         is human-readable from Meta.
      if (data.registered === false && data.registration_error) {
        toast.error(
          `Saved, but Meta couldn't register the number: ${data.registration_error}`,
          { duration: 12000 }
        );
      } else if (data.registration_skipped) {
        // Credentials saved + verified, but /register was skipped
        // because no PIN was supplied (e.g. a Meta test number).
        // Don't claim the number is "Live" Ã¢ÂÂ point at the
        // Registration status banner instead.
        toast.success(
          'Credentials saved and verified. Inbound registration was skipped (no PIN) Ã¢ÂÂ see Registration status below.',
          { duration: 10000 }
        );
        setPin('');
      } else {
        toast.success(
          data.phone_info?.verified_name
            ? `Live Ã¢ÂÂ ${data.phone_info.verified_name} can now receive events.`
            : 'WhatsApp connected. Events will start flowing within a minute.'
        );
        // Clear the PIN so subsequent saves don't accidentally
        // re-register (which would void the active subscription if
        // the PIN became stale).
        setPin('');
      }

      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'GET' });
      const payload = await res.json();

      if (payload.connected) {
        setConnectionStatus('connected');
        setResetReason(null);
        setStatusMessage('');
        toast.success(
          payload.phone_info?.verified_name
            ? `Connected to ${payload.phone_info.verified_name}`
            : 'API connection successful'
        );
      } else {
        setConnectionStatus('disconnected');
        setResetReason(
          payload.needs_reset
            ? 'token_corrupted'
            : payload.reason === 'meta_api_error'
              ? 'meta_api_error'
              : null
        );
        setStatusMessage(payload.message || '');
        toast.error(payload.message || 'API connection failed');
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setConnectionStatus('disconnected');
      toast.error('Connection test failed. Check network and try again.');
    } finally {
      setTesting(false);
    }
  }

  async function handleVerifyRegistration() {
    setVerifyingRegistration(true);
    setRegistrationProbe(null);
    try {
      const res = await fetch('/api/whatsapp/config/verify-registration', {
        method: 'GET',
      });
      const data = (await res.json()) as RegistrationProbe;
      setRegistrationProbe(data);
      if (data.live) {
        toast.success('Number is fully wired Ã¢ÂÂ Meta is delivering events.');
      } else {
        toast.error(
          'Number is not fully registered. See the checks below for which step failed.',
          { duration: 8000 }
        );
      }
      if (accountId) await fetchConfig(accountId);
    } catch (err) {
      console.error('verify-registration failed:', err);
      toast.error('Could not reach the verification endpoint.');
    } finally {
      setVerifyingRegistration(false);
    }
  }

  async function handleReset() {
    if (
      !confirm(
        'This will delete the current WhatsApp config so you can re-enter it. Continue?'
      )
    ) {
      return;
    }

    try {
      setResetting(true);
      const res = await fetch('/api/whatsapp/config', { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to reset configuration');
        return;
      }

      toast.success(
        'Configuration cleared. You can now re-enter your credentials.'
      );
      setConfig(null);
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setVerifyToken('');
      setTokenEdited(false);
      setConnectionStatus('disconnected');
      setResetReason(null);
      setStatusMessage('');
    } catch (err) {
      console.error('Reset error:', err);
      toast.error('Failed to reset configuration');
    } finally {
      setResetting(false);
    }
  }

  function handleCopyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
  }

  const showResetBanner = resetReason === 'token_corrupted';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t('title')} description={t('description')} />
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="text-primary size-6 animate-spin" />
        </div>
      ) : config?.status === 'connected' ? (
        // ==========================================
        // CONNECTED STATE (CRM DASHBOARD)
        // ==========================================
        <div className="w-full">
          <Card className="border-border bg-card w-full overflow-hidden shadow-sm">
            {/* Top Header */}
            <div className="border-border bg-card flex items-center justify-between border-b p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Zap className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5 text-xs font-semibold tracking-wider uppercase">
                    EXIBIR NOME
                  </div>
                  <h2 className="text-foreground text-xl font-bold">
                    API Oficial do WhatsApp
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/20 hover:bg-destructive/10"
                  onClick={handleReset}
                >
                  Desconectar
                </Button>
              </div>
            </div>

            {/* Connection Data Banner */}
            <div className="border-border bg-muted/20 grid grid-cols-1 items-center gap-6 border-b p-6 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">
                  N�mero conectado
                </p>
                <div className="flex items-center gap-2">
                  <Phone className="text-primary h-4 w-4" />
                  <span className="text-foreground text-base font-medium">
                    +{config.phone_number_id}
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">
                  Limites de mensagens
                </p>
                <div className="flex items-center gap-2">
                  <MessageSquare className="text-muted-foreground h-4 w-4" />
                  <span className="text-foreground font-medium">
                    250 Conversas / 24 horas
                  </span>
                </div>
              </div>
              <div className="space-y-1 md:text-right">
                <p className="text-muted-foreground text-sm">
                  Status do n�mero
                </p>
                {isRegistered ? (
                  <Badge className="pointer-events-none border-emerald-200 bg-emerald-100/50 text-emerald-700 hover:bg-emerald-100/50 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                    Ativo
                  </Badge>
                ) : (
                  <Badge className="pointer-events-none border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-400">
                    Desativado
                  </Badge>
                )}
              </div>
            </div>

            {/* Grid de Metadados */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 p-6 md:grid-cols-4">
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  ID da conta WABA
                </p>
                <p className="text-primary flex items-center gap-1 text-sm font-medium">
                  {config.waba_id}
                  <ExternalLink
                    className="h-3.5 w-3.5 cursor-pointer opacity-70 hover:opacity-100"
                    onClick={() =>
                      window.open(
                        `https://business.facebook.com/wa/manage/home/?waba_id=${config.waba_id}`,
                        '_blank'
                      )
                    }
                  />
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Verifica��o do c�digo
                </p>
                <Badge
                  variant="outline"
                  className="pointer-events-none border-amber-200 bg-amber-50/50 font-medium text-amber-600 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  N�o Verificado
                </Badge>
              </div>
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Plataforma
                </p>
                <Badge
                  variant="outline"
                  className="pointer-events-none border-blue-200 bg-blue-50/50 font-medium text-blue-600 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-400"
                >
                  CLOUD_API
                </Badge>
              </div>
              <div className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Qualidade
                </p>
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground pointer-events-none font-medium"
                >
                  UNKNOWN
                </Badge>
              </div>
              <div className="mt-2 space-y-1.5 md:col-span-4">
                <p className="text-muted-foreground text-xs">
                  <span className="font-semibold">Vinculado � conta:</span>{' '}
                  joaoarthursilvapaes2001@gmail.com
                </p>
                <p className="text-muted-foreground text-xs">
                  <span className="font-semibold">Integrado em:</span>{' '}
                  {config.registered_at
                    ? new Date(config.registered_at).toLocaleString()
                    : new Date().toLocaleString()}
                </p>
              </div>
            </div>

            {/* Sync & Features */}
            <div className="border-border bg-card space-y-4 border-t p-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                <span className="text-foreground text-sm font-medium">
                  Modelos de mensagens sincronizados (18/18)
                </span>
                <span className="text-primary ml-2 cursor-pointer text-sm hover:underline">
                  Ver detalhes
                </span>
              </div>

              <div className="border-border bg-muted/20 flex flex-col justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex gap-3">
                  <Info className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      Armazenamento de Anexos (Espelhamento)
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      A Meta exclui m�dias em 30 dias. Manter c�pia na sua base
                      local?
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={mirrorMedia}
                    onCheckedChange={handleToggleMirrorMedia}
                    disabled={savingMirror}
                  />
                  <span className="w-20 text-sm font-medium">
                    {mirrorMedia ? 'Ativado' : 'Desativado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Status Box */}
            <div className="bg-card px-6 pt-2 pb-6">
              <div className="border-primary/20 bg-primary/5 flex flex-col justify-between gap-4 rounded-lg border p-4 md:flex-row md:items-center">
                <div className="flex gap-3">
                  <ShieldCheck className="text-primary h-6 w-6 shrink-0" />
                  <div>
                    <h4 className="text-foreground text-sm font-semibold">
                      Guia da API Oficial
                    </h4>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Conectada � API Oficial, seguran�a m�xima contra
                      banimentos.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() =>
                    window.open(
                      'https://developers.facebook.com/docs/whatsapp',
                      '_blank'
                    )
                  }
                  className="shrink-0"
                  variant="secondary"
                  size="sm"
                >
                  Documenta��o Meta{' '}
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        // ==========================================
        // DISCONNECTED STATE (SETUP WIZARD)
        // ==========================================
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Main config form */}
          <div className="space-y-6">
            {/* Corrupted-token reset banner */}
            {showResetBanner && (
              <Alert className="border-amber-600/40 bg-amber-950/40">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
                  <div className="flex-1">
                    <AlertTitle className="mb-1 text-amber-200">
                      {t('tokenCorrupted')}
                    </AlertTitle>
                    <AlertDescription className="text-sm text-amber-100/80">
                      {statusMessage}
                    </AlertDescription>
                    <Button
                      onClick={handleReset}
                      disabled={resetting}
                      size="sm"
                      className="mt-3 bg-amber-600 text-white hover:bg-amber-700"
                    >
                      {resetting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t('resetting')}
                        </>
                      ) : (
                        <>
                          <RotateCcw className="size-4" />
                          {t('resetConfig')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Alert>
            )}

            <Card className="border-border bg-card">
              <CardHeader className="border-border bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="text-primary size-5" />
                  {t('apiCredentialsTitle')}
                </CardTitle>
                <CardDescription>{t('apiCredentialsDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <Label>{t('wabaId')}</Label>
                  <Input
                    type="text"
                    value={wabaId}
                    onChange={(e) => setWabaId(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="Ex: 1280085397481739"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('phoneNumberId')}</Label>
                  <Input
                    type="text"
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                    className="font-mono text-sm"
                    placeholder="Ex: 1374568655728785"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token de Acesso (Apenas para setup manual)</Label>
                  <Input
                    type="password"
                    value={accessToken}
                    onChange={(e) => {
                      setAccessToken(e.target.value);
                      setTokenEdited(true);
                    }}
                    className="font-mono text-sm"
                    placeholder="EAA..."
                  />
                  <p className="text-xs text-muted-foreground">Cole o Token de Acesso temporário ou permanente aqui.</p>
                </div>

                <div className="border-border flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground flex-1 pr-4 text-sm">
                    Você pode configurar manualmente acima e clicar em Salvar, ou usar a conexão automática:
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar Manualmente
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleConnectFacebook}
                      disabled={connectingFb}
                    >
                      {connectingFb ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="mr-2 h-4 w-4" />
                      )}
                      Conectar com Facebook
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader className="border-border bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ExternalLink className="text-primary size-5" />
                  {t('webhookTitle')}
                </CardTitle>
                <CardDescription>{t('webhookDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <Label>{t('webhookUrl')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="bg-muted text-muted-foreground font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl);
                        toast.success('Webhook URL copied');
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar / Instructions */}
          <div className="space-y-6">
            <Card className="border-border bg-card sticky top-6 shadow-sm">
              <CardHeader className="border-border bg-muted/30 border-b pb-4">
                <CardTitle className="text-base">
                  {t('setupInstructions')}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t('setupInstructionsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Accordion className="w-full">
                  <AccordionItem value="step-1" className="border-b-0 px-4">
                    <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/20 text-primary flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                          1
                        </span>
                        {t('step1')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ul className="ml-1 list-inside list-disc space-y-1.5 text-xs">
                        <li>{t('step1_1')}</li>
                        <li>{t('step1_2')}</li>
                        <li>{t('step1_3')}</li>
                        <li>{t('step1_4')}</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="step-2" className="border-b-0 px-4">
                    <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/20 text-primary flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                          2
                        </span>
                        {t('step2')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ul className="ml-1 list-inside list-disc space-y-1.5 text-xs">
                        <li>{t('step2_1')}</li>
                        <li>{t('step2_2')}</li>
                        <li>{t('step2_3')}</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="step-3" className="border-b-0 px-4">
                    <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/20 text-primary flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                          3
                        </span>
                        {t('step3')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ul className="ml-1 list-inside list-disc space-y-1.5 text-xs">
                        <li>{t('step3_1')}</li>
                        <li>{t('step3_2')}</li>
                        <li>{t('step3_3')}</li>
                        <li>{t('step3_4')}</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="step-4" className="border-b-0 px-4">
                    <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/20 text-primary flex size-5 items-center justify-center rounded-full text-[10px] font-bold">
                          4
                        </span>
                        {t('step4')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      <ul className="ml-1 list-inside list-disc space-y-1.5 text-xs">
                        <li>{t('step4_1')}</li>
                        <li>{t('step4_2')}</li>
                        <li>{t('step4_3')}</li>
                        <li>{t('step4_4')}</li>
                        <li>{t('step4_5')}</li>
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <div className="border-border bg-muted/10 border-t p-4">
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary flex items-center gap-1.5 text-xs font-medium hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    {t('metaDocs')}
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
