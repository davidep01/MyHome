/* Overlays: DoorbellOverlay (fullscreen takeover) + AIAssistant sheet +
   ConnectionLost. All controlled by the App. */

function DoorbellOverlay({ onClose }) {
  return (
    <div className="scrim">
      <div className="doorbell">
        <div className="db-top">
          <span className="ring"><Icon name="bell" size={20} color="#fff" /></span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Campanello</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Ingresso · adesso</div>
          </div>
        </div>
        <div className="db-video">
          <Icon name="video" size={40} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
          <span style={{ fontSize: 13 }}>Anteprima campanello</span>
        </div>
        <div className="db-bottom">
          <button className="db-pill"><Icon name="mic" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Parla</button>
          <button className="db-pill"><Icon name="volume-2" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />Audio</button>
          <button className="db-act ignore" onClick={onClose}>Ignora</button>
          <button className="db-act seen" onClick={onClose}>Visto</button>
        </div>
      </div>
    </div>
  );
}

function ConnectionLost({ onRetry }) {
  return (
    <div className="conn">
      <span className="wifi"><Icon name="wifi-off" size={32} /></span>
      <div className="t-h2">Connessione persa</div>
      <div className="t-body-sec" style={{ maxWidth: 320 }}>Riconnessione a Home Assistant in corso…</div>
      <button className="retry press" onClick={onRetry}>Riprova ora</button>
    </div>
  );
}

const AI_SUGGEST = [
  'Spegni tutte le luci',
  'Imposta la camera a 21°',
  'Chi è in casa?',
  'Attiva scena Notte',
];
function AIAssistant({ onClose }) {
  const [msgs, setMsgs] = React.useState([
    { who: 'ai', text: 'Ciao Mattia. Posso controllare luci, clima, serrature e scene. Cosa ti serve?' },
  ]);
  const [val, setVal] = React.useState('');
  const send = (text) => {
    const t = (text || val).trim();
    if (!t) return;
    setMsgs((m) => [...m, { who: 'me', text: t }]);
    setVal('');
    setTimeout(() => setMsgs((m) => [...m, { who: 'ai', text: 'Fatto. Ho aggiornato i dispositivi interessati e confermato lo stato.' }]), 600);
  };
  return (
    <div className="scrim" style={{ background: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' }} onClick={onClose}>
      <div className="ai-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ marginBottom: 14 }}>
          <span className="panel-ico" style={{ background: 'var(--ai-gradient)', color: '#fff' }}><Icon name="sparkles" size={20} /></span>
          <div>
            <div className="t-section">Assistente AI</div>
            <div className="card-status">Gemini · solo i tuoi dispositivi</div>
          </div>
          <button className="panel-x" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>
        <div className="ai-thread">
          {msgs.map((m, i) => (
            <div key={i} className={'ai-msg ' + m.who}>{m.text}</div>
          ))}
        </div>
        <div className="ai-suggest">
          {AI_SUGGEST.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
        <div className="ai-input">
          <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Chiedi qualcosa…" />
          <button className="ai-send press" onClick={() => send()}><Icon name="arrow-up" size={18} color="#fff" /></button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DoorbellOverlay, ConnectionLost, AIAssistant });
