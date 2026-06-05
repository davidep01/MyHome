/* Rail (68px nav), HomeHeader, SceneRow, PeopleCard */

function Rail({ active, onNav, conn = 'ok', onAI }) {
  const nav = [
    { id: 'home', icon: 'house', label: 'Home' },
    { id: 'aree', icon: 'layout-grid', label: 'Aree' },
    { id: 'clima', icon: 'thermometer-sun', label: 'Clima' },
    { id: 'sicurezza', icon: 'shield', label: 'Sicurezza' },
    { id: 'energia', icon: 'zap', label: 'Energia' },
  ];
  return (
    <aside className="rail">
      <div className="rail-avatar">
        <img src="../../assets/app-icon.svg" alt="MyHome" />
        <span className={'rail-dot ' + (conn === 'ok' ? '' : conn)} title="Home Assistant"></span>
      </div>
      <div className="rail-divider"></div>
      {nav.map((n) => (
        <button key={n.id} className={'rail-btn' + (active === n.id ? ' active' : '')} onClick={() => onNav(n.id)}>
          <Icon name={n.icon} size={21} strokeWidth={active === n.id ? 2.2 : 1.9} />
          <span className="rail-tip">{n.label}</span>
        </button>
      ))}
      <div className="rail-spacer"></div>
      <button className="rail-btn ai" onClick={onAI}>
        <Icon name="sparkles" size={20} />
        <span className="rail-tip">Assistente AI</span>
      </button>
      <button className="rail-btn">
        <Icon name="settings" size={20} strokeWidth={1.9} />
        <span className="rail-tip">Impostazioni</span>
      </button>
      <button className="rail-btn">
        <Icon name="bell" size={20} strokeWidth={1.9} />
        <span className="rail-tip">Notifiche</span>
      </button>
    </aside>
  );
}

const FORECAST = [
  { d: 'Oggi', t: 26, icon: 'cloud-rain' },
  { d: 'Sab', t: 24, icon: 'cloud-rain' },
  { d: 'Dom', t: 25, icon: 'cloud-sun' },
  { d: 'Lun', t: 24, icon: 'sun' },
];

function HomeHeader({ onBell }) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  return (
    <header className="main-head">
      <div>
        <h1 className="t-page-title">{part}, Mattia!</h1>
        <p className="t-body-sec greet-sub">Speaker in pausa · 2 luci accese</p>
      </div>
      <div className="wx">
        <div className="wx-now">
          <Icon name="cloud-lightning" size={34} color="var(--ink-secondary)" strokeWidth={1.6} />
          <div>
            <div className="wx-temp">24°</div>
          </div>
          <div className="wx-rain">
            <span className="t-micro" style={{ color: 'var(--ink-secondary)' }}>Pioggia</span>
            <span className="t-label-ink" style={{ fontSize: 14 }}>100%</span>
          </div>
        </div>
        <div className="wx-forecast">
          {FORECAST.map((f) => (
            <div className="wx-day" key={f.d}>
              <span className="d">{f.d}</span>
              <Icon name={f.icon} size={18} color="var(--ink-secondary)" strokeWidth={1.7} />
              <span className="t">{f.t}°</span>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

const SCENES = [
  { id: 'music', label: 'Music', icon: 'music', color: '#e8508d' },
  { id: 'going', label: 'Going out', icon: 'footprints', color: '#0a84ff' },
  { id: 'night', label: 'Night', icon: 'moon', color: '#7c5cff' },
  { id: 'movie', label: 'Movie', icon: 'clapperboard', color: '#ff453a' },
  { id: 'morning', label: 'Morning', icon: 'sun', color: '#ff9f0a' },
  { id: 'arrive', label: 'Arrive', icon: 'door-open', color: '#30b15a' },
];

function SceneRow({ onScene, activeScene }) {
  return (
    <div className="scene-people">
      <div className="card scene-card">
        <span className="t-label" style={{ marginBottom: 12, display: 'block' }}>Scene</span>
        <div className="scene-row">
          {SCENES.map((s) => (
            <button key={s.id} className="scene" onClick={() => onScene(s.id)}>
              <span className="scene-orb" style={{ background: s.color, outline: activeScene === s.id ? '2.5px solid ' + s.color : 'none', outlineOffset: 2 }}>
                <Icon name={s.icon} size={22} color="#fff" strokeWidth={2.1} />
              </span>
              <span className="scene-name">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
      <PeopleCard />
    </div>
  );
}

const PEOPLE = [
  { id: 'm', name: 'Mattia', color: '#0a84ff' },
  { id: 'g', name: 'Giulia', color: '#e8508d' },
  { id: 'l', name: 'Luca', color: '#30b15a' },
  { id: 'g2', name: 'Gianni', color: '#ff9f0a' },
];

function PeopleCard() {
  return (
    <div className="card people-card click">
      <div className="people-head">
        <span className="t-section">Persone</span>
        <Chevron />
      </div>
      <div className="avatars">
        {PEOPLE.map((p) => (
          <span key={p.id} className="avatar" style={{ background: p.color }} title={p.name}>
            {p.name[0]}
          </span>
        ))}
        <span className="avatar more">+1</span>
      </div>
    </div>
  );
}

Object.assign(window, { Rail, HomeHeader, SceneRow, PeopleCard });
