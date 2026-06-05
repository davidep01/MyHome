/* Contextual panel — slides in from the right. Three detail views:
   ClimateDetail (dial + mode + fan), LightDetail (brightness + presets),
   and the default WeatherPanel shown when nothing is selected. */

function PanelShell({ icon, title, subtitle, onClose, children }) {
  return (
    <div className="panel-anim">
      <div className="panel-head">
        <span className="panel-ico"><Icon name={icon} size={20} /></span>
        <div>
          <div className="t-section">{title}</div>
          {subtitle ? <div className="card-status">{subtitle}</div> : null}
        </div>
        <button className="panel-x" onClick={onClose}><Icon name="x" size={18} /></button>
      </div>
      {children}
    </div>
  );
}

/* ---------------- Climate detail (dial) ---------------- */
function ClimateDetail({ dev, onUpdate, onClose }) {
  const min = 16, max = 28;
  const pct = (dev.target - min) / (max - min);
  const ARC = 270, START = 0;
  const R = 88, C = 2 * Math.PI * R;
  const track = (ARC / 360) * C;
  const filled = pct * track;
  const accent = dev.mode === 'cool' ? 'var(--cold-blue)' : dev.mode === 'heat' ? 'var(--hot-red)' : 'var(--ink-tertiary)';
  const step = (d) => onUpdate(dev.id, { target: Math.min(max, Math.max(min, Math.round((dev.target + d) * 2) / 2)) });
  return (
    <PanelShell icon="thermometer-sun" title={dev.name} subtitle={dev.area} onClose={onClose}>
      <div className="panel-card">
        <div className="dial-wrap">
          <div className="dial">
            <svg viewBox="0 0 200 200">
              <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={track + ' ' + C} />
              <circle cx="100" cy="100" r={R} fill="none" stroke={accent} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={filled + ' ' + C} style={{ transition: 'stroke-dasharray 0.3s var(--spring)' }} />
            </svg>
            <div className="dial-center">
              <div className="dial-temp" style={{ color: accent }}>{dev.target.toFixed(1)}<span className="u">°</span></div>
              <div className="dial-cur">Attuale {dev.current.toFixed(1)}°</div>
            </div>
          </div>
        </div>
        <div className="dial-ctrls">
          <button className="dbtn" onClick={() => step(-0.5)}><Icon name="minus" size={20} /></button>
          <button className="align"><Icon name="flame" size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />{dev.mode === 'heat' ? 'Riscalda' : dev.mode === 'cool' ? 'Raffredda' : 'Auto'}</button>
          <button className="dbtn" onClick={() => step(0.5)}><Icon name="plus" size={20} /></button>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-eyebrow">Mode</div>
        <div className="seg">
          {[{ m: 'heat', i: 'flame', l: 'Riscalda' }, { m: 'cool', i: 'snowflake', l: 'Raffredda' }, { m: 'off', i: 'power', l: 'Spento' }].map((o) => (
            <button key={o.m} className={'seg-btn' + (dev.mode === o.m ? ' sel' : '') + (o.m === 'cool' ? ' cool' : '')} onClick={() => onUpdate(dev.id, { mode: o.m })}>
              <Icon name={o.i} size={20} />{o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-eyebrow">Fan mode</div>
        <div className="fan">
          {['Auto', '1', '2', '3'].map((f) => (
            <button key={f} className={'fan-btn' + (dev.fan === f ? ' sel' : '')} onClick={() => onUpdate(dev.id, { fan: f })}>{f}</button>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

/* ---------------- Light detail ---------------- */
function LightDetail({ dev, onUpdate, onClose }) {
  const presets = [{ k: 'Relax', v: 25 }, { k: 'Lettura', v: 60 }, { k: 'Pieno', v: 100 }, { k: 'Notte', v: 8 }];
  return (
    <PanelShell icon="lightbulb" title={dev.name} subtitle={dev.area} onClose={onClose}>
      <div className="panel-card">
        <div className="big-toggle" style={{ marginBottom: 16 }}>
          <span className="t-label-ink">Stato</span>
          <div className={'toggle' + (dev.on ? ' on' : '')} onClick={() => onUpdate(dev.id, { on: !dev.on })} style={{ cursor: 'pointer' }}><span className="knob"></span></div>
        </div>
        <div className="panel-eyebrow">Luminosità — {dev.bri}%</div>
        <Slider value={dev.bri} amber onChange={(v) => onUpdate(dev.id, { bri: v, on: v > 0 })} />
      </div>
      <div className="panel-card">
        <div className="panel-eyebrow">Preset</div>
        <div className="presets">
          {presets.map((p) => (
            <button key={p.k} className={'preset' + (dev.bri === p.v ? ' sel' : '')} onClick={() => onUpdate(dev.id, { bri: p.v, on: true })}>{p.k}</button>
          ))}
        </div>
      </div>
    </PanelShell>
  );
}

/* ---------------- Default weather panel ---------------- */
const WX_HOURS = [
  { t: 'Ora', temp: 24, icon: 'cloud-lightning' },
  { t: '16', temp: 24, icon: 'cloud-rain' },
  { t: '17', temp: 23, icon: 'cloud-rain' },
  { t: '18', temp: 22, icon: 'cloud-sun' },
  { t: '19', temp: 21, icon: 'cloud' },
];
function WeatherPanel() {
  return (
    <div className="panel-anim">
      <div className="panel-head">
        <span className="panel-ico"><Icon name="cloud-lightning" size={20} /></span>
        <div>
          <div className="t-section">Meteo</div>
          <div className="card-status">Bologna · Temporale</div>
        </div>
      </div>
      <div className="panel-card">
        <div className="wx-big">
          <Icon name="cloud-lightning" size={48} color="var(--ink-secondary)" strokeWidth={1.4} />
          <div className="t">24°</div>
          <div className="card-status">Percepiti 26° · Pioggia 100%</div>
        </div>
      </div>
      <div className="panel-card">
        <div className="panel-eyebrow">Prossime ore</div>
        <div className="wx-list">
          {WX_HOURS.map((h) => (
            <div className="wx-list-row" key={h.t}>
              <span className="t-label-ink" style={{ width: 44 }}>{h.t}</span>
              <Icon name={h.icon} size={20} color="var(--ink-secondary)" strokeWidth={1.7} />
              <span className="t-readout-sm" style={{ fontSize: 16 }}>{h.temp}°</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PanelShell, ClimateDetail, LightDetail, WeatherPanel });
