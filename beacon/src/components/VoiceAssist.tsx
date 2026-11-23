import { useEffect, useRef, useState } from 'react';
import { Keyboard, Mic } from 'lucide-react';
import { callHaService, haFetch, callBeaconAction } from '../api/ha-rest';
import type { HomeAssistantClient } from '../api/homeassistant';
import type { SidebarView } from './Sidebar';
import { useTranslation } from '../i18n';
import { isAddOn } from '../utils/ha-env';
import {
  runVoiceCommand,
  speechRecognitionAvailable,
  type BeaconVoiceBody,
} from '../voice/assist';

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechCtor = new () => SpeechRec;

function speechCtor(): SpeechCtor | null {
  const scope = window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
  };
  return scope.SpeechRecognition || scope.webkitSpeechRecognition || null;
}

interface VoiceAssistProps {
  placement: 'sidebar-left' | 'sidebar-right' | 'sidebar-bottom' | 'kiosk';
  getClient: () => HomeAssistantClient | null;
  onNavigate: (view: SidebarView) => void;
  onRefreshChores: () => void;
}

/**
 * Hold-to-talk on the wall. The mic starts only while the button is held.
 * There is no wake word and no always-on listener. Browsers without the
 * Web Speech API, or without a secure context, keep the text box.
 */
export function VoiceAssist({
  placement,
  getClient,
  onNavigate,
  onRefreshChores,
}: VoiceAssistProps) {
  const { t } = useTranslation();
  const [micAvailable, setMicAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'working' | 'reply'>('idle');
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [draft, setDraft] = useState('');
  const recognitionRef = useRef<SpeechRec | null>(null);
  const holdingRef = useRef(false);
  const transcriptRef = useRef('');
  const submitLock = useRef(false);
  const blockedRef = useRef(false);

  useEffect(() => {
    const scope = window as Window & {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    setMicAvailable(speechRecognitionAvailable({
      isSecureContext: window.isSecureContext,
      SpeechRecognition: scope.SpeechRecognition,
      webkitSpeechRecognition: scope.webkitSpeechRecognition,
    }));
  }, []);

  useEffect(() => () => {
    holdingRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* already stopped */ }
  }, []);

  useEffect(() => {
    if (!open || phase !== 'reply') return undefined;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setPhase('idle');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [open, phase, reply]);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || submitLock.current) return;
    submitLock.current = true;
    setTranscript(trimmed);
    setPhase('working');
    setOpen(true);
    try {
      const result = await runVoiceCommand(trimmed, {
        addOn: isAddOn(),
        listAgents: async () => {
          const client = getClient();
          if (client?.isConnected) {
            try {
              return await client.listConversationAgents();
            } catch {
              /* REST fallback below */
            }
          }
          try {
            const config = await haFetch('/api/config') as { components?: string[] };
            if (Array.isArray(config?.components) && config.components.includes('conversation')) {
              return [{ id: 'conversation.home_assistant' }];
            }
          } catch {
            /* no agent */
          }
          return [];
        },
        processConversation: async (utterance) => {
          const client = getClient();
          if (client?.isConnected) {
            try {
              return await client.processConversation(utterance, navigator.language);
            } catch {
              /* REST fallback below */
            }
          }
          return callHaService('conversation', 'process', { text: utterance }, true);
        },
        postBeaconVoice: async (utterance) => {
          return await callBeaconAction('/beacon-action/voice', { text: utterance }) as BeaconVoiceBody;
        },
      });
      setReply(result.response || t('voice.noSpeech'));
      setPhase('reply');
      if (result.navigate) onNavigate(result.navigate);
      if (result.refreshChores) onRefreshChores();
    } finally {
      submitLock.current = false;
    }
  }

  function startHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (!micAvailable || event.button !== 0) return;
    event.preventDefault();
    const Ctor = speechCtor();
    if (!Ctor) {
      setMicAvailable(false);
      return;
    }
    holdingRef.current = true;
    blockedRef.current = false;
    transcriptRef.current = '';
    setTranscript('');
    setReply('');
    setPhase('listening');
    setOpen(true);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (speechEvent) => {
      let heard = '';
      for (let i = 0; i < speechEvent.results.length; i += 1) {
        heard += speechEvent.results[i][0]?.transcript || '';
      }
      transcriptRef.current = heard.trim();
      setTranscript(heard.trim());
    };
    recognition.onerror = (speechEvent) => {
      if (speechEvent.error === 'not-allowed' || speechEvent.error === 'service-not-allowed') {
        holdingRef.current = false;
        blockedRef.current = true;
        setMicAvailable(false);
        setReply(t('voice.micNeedsHttps'));
        setPhase('reply');
      }
    };
    recognition.onend = () => {
      if (blockedRef.current) return;
      if (holdingRef.current) {
        try { recognition.start(); } catch { /* browser ended the session */ }
        return;
      }
      const heard = transcriptRef.current.trim();
      if (heard) {
        void submit(heard);
        return;
      }
      setReply(t('voice.noSpeech'));
      setPhase('reply');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      holdingRef.current = false;
      setMicAvailable(false);
      setReply(t('voice.micNeedsHttps'));
      setPhase('reply');
    }
  }

  function endHold() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }

  return (
    <div className={`voice-assist voice-assist--${placement}`}>
      {open && (
        <div className="voice-assist-overlay" role="status" aria-live="polite">
          <div className="voice-assist-card">
            <div className="voice-assist-kicker">
              {phase === 'listening' ? t('voice.listening') : phase === 'working' ? t('voice.working') : phase === 'reply' ? t('voice.reply') : t('voice.typeCommand')}
            </div>
            {transcript && (
              <p className="voice-assist-transcript">
                <span className="voice-assist-label">{t('voice.youSaid')}</span>
                {transcript}
              </p>
            )}
            {reply && <p className="voice-assist-reply">{reply}</p>}
            <form
              className="voice-assist-form"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draft.trim();
                if (!next) return;
                setDraft('');
                void submit(next);
              }}
            >
              <input
                className="voice-assist-input"
                value={draft}
                placeholder={t('voice.placeholder')}
                aria-label={t('voice.typeCommand')}
                onChange={(event) => setDraft(event.target.value)}
                onFocus={() => {
                  if (phase === 'reply') setPhase('idle');
                }}
              />
              <button type="submit" className="voice-assist-send">{t('voice.send')}</button>
            </form>
            <button type="button" className="voice-assist-dismiss" onClick={() => { setOpen(false); setPhase('idle'); }}>
              {t('voice.dismiss')}
            </button>
          </div>
        </div>
      )}

      <div className="voice-assist-controls">
        {micAvailable && (
          <button
            type="button"
            className={`voice-assist-mic ${phase === 'listening' ? 'voice-assist-mic--hot' : ''}`}
            aria-label={t('voice.holdToTalk')}
            aria-pressed={phase === 'listening'}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            onContextMenu={(event) => event.preventDefault()}
          >
            <Mic size={22} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          className="voice-assist-type"
          aria-label={t('voice.typeCommand')}
          onClick={() => {
            setOpen(true);
            setPhase((current) => (current === 'listening' || current === 'working' ? current : 'idle'));
          }}
        >
          <Keyboard size={22} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
