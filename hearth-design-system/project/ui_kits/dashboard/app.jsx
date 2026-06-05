/* MyHome dashboard — App. Holds device state, optimistic updates, panel +
   overlay routing. All data is mock, shaped like Home Assistant entities. */

const { useState, useCallback } = React;

const INITIAL = {
  // climate
  'climate.cucina': { id: 'climate.cucina', type: 'climate', name: 'Termostufa Integrata', area: 'Cucina', mode: 'heat', target: 22.0, current: 21.3, fan: 'Auto' },
  'climate.camera': { id: 'climate.camera', type: 'climate', name: 'Clima Camera Mattia', area: 'Camera', mode: 'cool', target: 20.5, current: 23.1, fan: '2' },
  // lights
  'light.cucina': { id: 'light.cucina', type: 'light', name: 'Luce Cucina', on: true, bri: 40 },
  'light.tavolo': { id: 'light.tavolo', type: 'light', name: 'Luce Tavolo', on: true, bri: 70 },
  'light.giardino': { id: 'light.giardino', type: 'light', name: 'Angolo Giardino', on: false, bri: 0 },
  'light.bagno': { id: 'light.bagno', type: 'light', name: 'Luce Bagno', unavailable: true },
  // sensors
  'sensor.cucina_t': { id: 'sensor.cucina_t', type: 'sensor', kind: 'temp', name: 'Temp. Cucina', icon: 'thermometer', value: 21.3, unit: '°', history: [20.1, 20.4, 20.8, 21.0, 20.9, 21.2, 21.3] },
  'sensor.umid': { id: 'sensor.umid', type: 'sensor', kind: 'hum', name: 'Umidità', icon: 'droplets', value: 54, unit: '%', history: [49, 50, 52, 51, 53, 54, 54] },
  'sensor.energia': { id: 'sensor.energia', type: 'sensor', kind: 'pow', name: 'Potenza', icon: 'zap', value: 1.4, unit: ' kW', history: [0.6, 0.8, 1.1, 0.9, 1.3, 1.5, 1.4] },
  // robot
  'vacuum.robot': { id: 'vacuum.robot', type: 'robot', name: 'Robot', status: 'In Carica', batt: 100, chips: ['Pulisci', 'Base', 'Stanze'] },
  // locks
  'lock.ingresso': { id: 'lock.ingresso', type: 'lock', name: 'Portone', open: false },
  'lock.garage': { id: 'lock.garage', type: 'lock', name: 'Garage', open: false },
  // cameras
  'camera.giardino': { id: 'camera.giardino', type: 'camera', name: 'Giardino', offline: true },
  'camera.ingresso': { id: 'camera.ingresso', type: 'camera', name: 'Ingresso', offline: true },
  // alarm
  'alarm.casa': { id: 'alarm.casa', type: 'alarm', name: 'Allarme Casa', armed: false },
  // switches
  'switch.presa': { id: 'switch.presa', type: 'switch', name: 'Presa Studio', icon: 'plug', on: false },
  'switch.irrig': { id: 'switch.irrig', type: 'switch', name: 'Irrigazione', icon: 'sprout', on: false },
  // blinds
  'cover.cucina': { id: 'cover.cucina', type: 'blind', name: 'Tapparella Cucina', pos: 70 },
};

function App() {
  const [devs, setDevs] = useState(INITIAL);
  const [nav, setNav] = useState('home');
  const [selected, setSelected] = useState(null);
  const [scene, setScene] = useState(null);
  const [overlay, setOverlay] = useState(null); // 'doorbell' | 'ai' | 'conn'

  const update = useCallback((id, patch) => {
    setDevs((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }, []);
  const open = useCallback((id) => setSelected(id), []);

  const sel = selected ? devs[selected] : null;
  const D = (id) => devs[id];

  return (
    <div className={'app' + (false ? '' : '')}>
      <Rail active={nav} onNav={setNav} onAI={() => setOverlay('ai')} conn="ok" />

      <main className="main">
        <HomeHeader onBell={() => setOverlay('doorbell')} />
        <SceneRow onScene={setScene} activeScene={scene} />

        <SectionBand title="Cucina" count="6 dispositivi">
          <ClimateCard dev={D('climate.cucina')} onUpdate={update} onOpen={open} />
          <LightCard dev={D('light.cucina')} onUpdate={update} onOpen={open} />
          <LightCard dev={D('light.tavolo')} onUpdate={update} onOpen={open} />
          <SensorCard dev={D('sensor.cucina_t')} />
          <SensorCard dev={D('sensor.umid')} />
          <BlindCard dev={D('cover.cucina')} onUpdate={update} />
          <SwitchCard dev={D('switch.presa')} onUpdate={update} />
        </SectionBand>

        <SectionBand title="Camera & Comfort" count="4 dispositivi">
          <ClimateCard dev={D('climate.camera')} onUpdate={update} onOpen={open} />
          <LightCard dev={D('light.giardino')} onUpdate={update} onOpen={open} />
          <LightCard dev={D('light.bagno')} onUpdate={update} onOpen={open} />
          <SensorCard dev={D('sensor.energia')} />
          <RobotCard dev={D('vacuum.robot')} />
          <SwitchCard dev={D('switch.irrig')} onUpdate={update} />
        </SectionBand>

        <SectionBand title="Videocamere & Sicurezza" count="5 dispositivi">
          <CameraCard dev={D('camera.giardino')} />
          <AlarmCard dev={D('alarm.casa')} onUpdate={update} />
          <LockCard dev={D('lock.ingresso')} onUpdate={update} />
          <LockCard dev={D('lock.garage')} onUpdate={update} />
          <CameraCard dev={D('camera.ingresso')} />
        </SectionBand>
      </main>

      <aside className="panel">
        {sel && sel.type === 'climate' ? <ClimateDetail dev={sel} onUpdate={update} onClose={() => setSelected(null)} />
          : sel && sel.type === 'light' ? <LightDetail dev={sel} onUpdate={update} onClose={() => setSelected(null)} />
          : <WeatherPanel />}
      </aside>

      {overlay === 'doorbell' ? <DoorbellOverlay onClose={() => setOverlay(null)} /> : null}
      {overlay === 'ai' ? <AIAssistant onClose={() => setOverlay(null)} /> : null}
      {overlay === 'conn' ? <ConnectionLost onRetry={() => setOverlay(null)} /> : null}

      {/* demo trigger: ring the doorbell */}
      {!overlay ? (
        <button className="demo-ring" onClick={() => setOverlay('doorbell')} title="Simula campanello">
          <Icon name="bell-ring" size={18} color="#fff" />
        </button>
      ) : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
