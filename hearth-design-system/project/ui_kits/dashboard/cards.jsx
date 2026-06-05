/* SectionBand + all device cards. Contract: each card gets a `dev` object and
   onUpdate(id, patch) / onOpen(id) from the App. */

function SectionBand({ title, count, children }) {
  return (
    <section className="band">
      <div className="band-title">
        <span className="t-section">{title}</span>
        {count ? <span className="t-label" style={{ color: 'var(--ink-tertiary)' }}>{count}</span> : null}
      </div>
      <div className="band-grid">{children}</div>
    </section>
  );
}

/* ---- horizontal slider (brightness / blind / volume) ---- */
function Slider({ value, onChange, amber, showVal, unit = '%' }) {
  const ref = React.useRef(null);
  const set = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    let v = Math.round(((clientX - r.left) / r.width) * 100);
    v = Math.max(0, Math.min(100, v));
    onChange(v);
  };
  const down = (e) => {
    e.stopPropagation();
    set(e.clientX);
    const move = (ev) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className={'slider' + (amber ? ' amber' : '')} ref={ref} onPointerDown={down}>
      <div className="slider-fill" style={{ width: value + '%' }}></div>
      <div className="slider-knob" style={{ left: 'calc(' + value + '% )' }}></div>
      {showVal ? <span className="slider-val">{value}{unit}</span> : null}
    </div>
  );
}

/* ---------------------------- 💡 Light (1×2) ---------------------------- */
function LightCard({ dev, onUpdate, onOpen }) {
  if (dev.unavailable) {
    return (
      <div className="card span-2r unavailable">
        <div className="card-head">
          <span className="card-ico"><Icon name="lightbulb" size={20} /></span>
        </div>
        <div className="spacer"></div>
        <div className="card-name">{dev.name}</div>
        <div className="card-status">Non disponibile</div>
      </div>
    );
  }
  return (
    <div className={'card span-2r' + (dev.on ? ' light-on' : '')}>
      <div className="card-head">
        <button className="card-ico press" onClick={() => onUpdate(dev.id, { on: !dev.on })} style={dev.on ? {} : {}}>
          <Icon name={dev.on ? 'lightbulb' : 'lightbulb-off'} size={20} strokeWidth={2} />
        </button>
        <button className="press" onClick={() => onOpen(dev.id)} style={{ marginTop: 2 }}><Chevron /></button>
      </div>
      <div className="spacer"></div>
      <div className="card-name">{dev.name}</div>
      <div className="card-status">{dev.on ? 'Accesa · ' + dev.bri + '%' : 'Spenta'}</div>
      {dev.on ? (
        <div style={{ marginTop: 10 }}>
          <Slider value={dev.bri} amber onChange={(v) => onUpdate(dev.id, { bri: v, on: v > 0 })} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------- 🌡️ Climate (2×2) ---------------------------- */
function ClimateCard({ dev, onUpdate, onOpen }) {
  const mode = dev.mode; // 'heat' | 'cool' | 'off'
  const cls = mode === 'heat' ? ' heating' : mode === 'cool' ? ' cooling' : '';
  const step = (d) => onUpdate(dev.id, { target: Math.round((dev.target + d) * 2) / 2 });
  return (
    <div className={'card climate span-2c span-2r click' + cls} onClick={() => onOpen(dev.id)}>
      <div className="card-head">
        <span className="card-ico" style={mode === 'heat' ? { background: 'rgba(220,38,38,0.14)', color: 'var(--hot-red)' } : mode === 'cool' ? { background: 'var(--cold-tint)', color: 'var(--cold-blue)' } : {}}>
          <Icon name={mode === 'cool' ? 'snowflake' : 'flame'} size={20} />
        </span>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="card-name">{dev.name}</div>
          <div className="card-status">{mode === 'heat' ? 'Riscaldamento' : mode === 'cool' ? 'Raffreddamento' : 'Spento'}</div>
        </div>
        <Chevron />
      </div>
      <div className="spacer"></div>
      <div className="clima-temp">{dev.target.toFixed(1)}<span className="u">°C</span></div>
      <div className="card-status" style={{ marginBottom: 12 }}>Attuale {dev.current.toFixed(1)}°</div>
      <div className="clima-ctrls" onClick={(e) => e.stopPropagation()}>
        <button className="rbtn" onClick={() => step(-0.5)}><Icon name="minus" size={18} /></button>
        <button className="rbtn" onClick={() => step(0.5)}><Icon name="plus" size={18} /></button>
      </div>
    </div>
  );
}

/* ---------------------------- 📊 Sensor (1×1) ---------------------------- */
function Sparkline({ data, color }) {
  const w = 120, h = 34, max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => (i / (data.length - 1)) * w + ',' + (h - ((v - min) / rng) * (h - 6) - 3)).join(' ');
  return (
    <svg className="spark" viewBox={'0 0 ' + w + ' ' + h} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SensorCard({ dev }) {
  const v = dev.value;
  const tone = dev.kind === 'temp' ? (v >= 24 ? 'hot' : v <= 18 ? 'cold' : '') : '';
  const color = tone === 'hot' ? 'var(--hot-red)' : tone === 'cold' ? 'var(--cold-blue)' : 'var(--ink-secondary)';
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-ico"><Icon name={dev.icon || 'activity'} size={18} /></span>
      </div>
      <div className="spacer"></div>
      <div className={'sensor-val ' + tone}>{v}<span style={{ fontSize: 14, fontWeight: 600 }}>{dev.unit}</span></div>
      <div className="card-status" style={{ marginBottom: 6 }}>{dev.name}</div>
      <Sparkline data={dev.history} color={color} />
    </div>
  );
}

/* ---------------------------- 🔒 Lock (1×2) ---------------------------- */
function LockCard({ dev, onUpdate }) {
  const [hold, setHold] = React.useState(false);
  const timer = React.useRef(null);
  const start = (e) => {
    e.preventDefault();
    if (dev.open) { onUpdate(dev.id, { open: false }); return; }
    setHold(true);
    timer.current = setTimeout(() => { setHold(false); onUpdate(dev.id, { open: true }); }, 900);
  };
  const cancel = () => { setHold(false); clearTimeout(timer.current); };
  const R = 30, C = 2 * Math.PI * R;
  return (
    <div className="card span-2r">
      <div className="card-head">
        <span className="card-ico" style={dev.open ? { background: 'var(--ok-tint)', color: 'var(--ok-green)' } : {}}>
          <Icon name={dev.open ? 'lock-open' : 'lock'} size={18} />
        </span>
      </div>
      <div className="card-name" style={{ textAlign: 'center' }}>{dev.name}</div>
      <div className="lock-ring-wrap">
        <button className={'lock-btn' + (dev.open ? ' open' : '')} onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel}>
          <Icon name={dev.open ? 'lock-open' : 'lock'} size={26} strokeWidth={2} />
          <svg className="lock-ring" width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r={R} fill="none" stroke="var(--action-blue)" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={hold ? 0 : C}
              style={{ transition: hold ? 'stroke-dashoffset 0.9s linear' : 'none', opacity: hold ? 1 : 0 }} />
          </svg>
        </button>
      </div>
      <div className="lock-hint">{dev.open ? 'Aperto · tocca per chiudere' : 'Tieni premuto per aprire'}</div>
    </div>
  );
}

/* ---------------------------- 🤖 Robot (1×2) ---------------------------- */
function RobotCard({ dev }) {
  return (
    <div className="card span-2r">
      <div className="robot-top">
        <span className="card-ico"><Icon name="bot" size={18} /></span>
        <span className="batt"><Icon name="battery-full" size={15} color="var(--ok-green)" />{dev.batt}%</span>
      </div>
      <div className="robot-disc"><span className="core"></span></div>
      <div className="card-name">{dev.name}</div>
      <div className="card-status" style={{ marginBottom: 8 }}>{dev.status}</div>
      <div className="chips">
        {dev.chips.map((c) => <span className="chip" key={c}>{c}</span>)}
      </div>
    </div>
  );
}

/* ---------------------------- 📹 Camera (2×3) ---------------------------- */
function CameraCard({ dev }) {
  return (
    <div className="card span-2c span-3r" style={{ padding: 12 }}>
      <div className="cam-img">
        <Icon name="camera-off" size={26} color="rgba(255,255,255,0.45)" strokeWidth={1.6} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>Immagine non disponibile</span>
        {dev.offline ? <div className="cam-offline"><span className="dot"></span><span>Offline</span></div> : null}
      </div>
      <div className="cam-foot">
        <span className="card-name">{dev.name}</span>
        <Icon name="maximize-2" size={16} color="var(--ink-tertiary)" />
      </div>
    </div>
  );
}

/* ---------------------------- 🛡️ Alarm (2×1) ---------------------------- */
function AlarmCard({ dev, onUpdate }) {
  const state = dev.armed ? 'Inserito' : 'Disinserito';
  return (
    <div className="card span-2c">
      <div className="card-head">
        <span className="card-ico" style={dev.armed ? { background: 'var(--ok-tint)', color: 'var(--ok-green)' } : {}}>
          <Icon name="shield" size={18} />
        </span>
        <div style={{ flex: 1, marginLeft: 10 }}>
          <div className="card-name">{dev.name}</div>
          <div className="card-status">{state}</div>
        </div>
      </div>
      <div className="alarm-btns">
        <button className={'abtn' + (!dev.armed ? ' on' : '')} onClick={() => onUpdate(dev.id, { armed: false })}>Disins.</button>
        <button className={'abtn' + (dev.armed ? ' armed' : '')} onClick={() => onUpdate(dev.id, { armed: true })}>Inser.</button>
      </div>
    </div>
  );
}

/* ---------------------------- 🔌 Switch (1×1) ---------------------------- */
function SwitchCard({ dev, onUpdate }) {
  return (
    <div className="card click" onClick={() => onUpdate(dev.id, { on: !dev.on })}>
      <div className="card-head">
        <span className="card-ico" style={dev.on ? { background: 'var(--ok-tint)', color: 'var(--ok-green)' } : {}}>
          <Icon name={dev.icon || 'plug'} size={18} />
        </span>
        <div className={'toggle' + (dev.on ? ' on' : '')}><span className="knob"></span></div>
      </div>
      <div className="spacer"></div>
      <div className="card-name">{dev.name}</div>
      <div className="card-status">{dev.on ? 'Acceso' : 'Spento'}</div>
    </div>
  );
}

/* ---------------------------- 🪟 Blind / Tapparella (1×2) ---------------------------- */
function BlindCard({ dev, onUpdate }) {
  return (
    <div className="card span-2r">
      <div className="card-head">
        <span className="card-ico"><Icon name="blinds" size={18} /></span>
      </div>
      <div className="spacer"></div>
      <div className="card-name">{dev.name}</div>
      <div className="card-status" style={{ marginBottom: 10 }}>{dev.pos > 0 ? 'Aperta ' + dev.pos + '%' : 'Chiusa'}</div>
      <Slider value={dev.pos} showVal onChange={(v) => onUpdate(dev.id, { pos: v })} />
    </div>
  );
}

Object.assign(window, {
  SectionBand, Slider, Sparkline,
  LightCard, ClimateCard, SensorCard, LockCard, RobotCard, CameraCard, AlarmCard, SwitchCard, BlindCard,
});
