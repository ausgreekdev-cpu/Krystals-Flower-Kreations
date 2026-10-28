import { useState } from 'react';

const FLOWER_SVGS = {
  rose: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,10 65,35 50,50 35,35" className="wireframe" />
      <polygon points="50,50 70,40 75,60 55,70" className="wireframe" />
      <polygon points="50,50 30,40 25,60 45,70" className="wireframe" />
      <polygon points="50,70 60,85 50,95 40,85" className="wireframe" />
      <line x1="50" y1="95" x2="50" y2="100" className="wireframe" />
    </svg>
  ),
  lily: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <polygon points="50,5 70,40 50,50 30,40" className="wireframe" />
      <polygon points="50,50 80,30 90,55 60,65" className="wireframe" />
      <polygon points="50,50 20,30 10,55 40,65" className="wireframe" />
      <polygon points="50,65 65,85 50,95 35,85" className="wireframe" />
      <line x1="50" y1="95" x2="50" y2="100" className="wireframe" />
    </svg>
  ),
  wattle: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="30" r="8" className="wireframe" />
      <circle cx="35" cy="45" r="6" className="wireframe" />
      <circle cx="65" cy="45" r="6" className="wireframe" />
      <circle cx="42" cy="60" r="5" className="wireframe" />
      <circle cx="58" cy="60" r="5" className="wireframe" />
      <line x1="50" y1="70" x2="50" y2="100" className="wireframe" />
    </svg>
  ),
  banksia: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <ellipse cx="50" cy="40" rx="15" ry="25" className="wireframe" />
      <line x1="50" y1="65" x2="50" y2="100" className="wireframe" />
      <line x1="35" y1="30" x2="40" y2="35" className="wireframe" />
      <line x1="65" y1="30" x2="60" y2="35" className="wireframe" />
      <line x1="35" y1="50" x2="40" y2="45" className="wireframe" />
      <line x1="65" y1="50" x2="60" y2="45" className="wireframe" />
    </svg>
  ),
};

const TEMPLATES = [
  { id: 'rose', label: 'PAPER ROSE', description: 'Classic full bloom' },
  { id: 'lily', label: 'ORIGAMI LILY', description: 'Crisp geometric petals' },
  { id: 'wattle', label: 'WATTLE SPRIG', description: 'Golden sprigs — native charm' },
  { id: 'banksia', label: 'BANKSIA PETAL', description: 'Sculptural cones — bold texture' },
];

const COLORS = [
  { id: 'blush', label: 'BLUSH', hex: '#F8C4B4' },
  { id: 'sage', label: 'SAGE', hex: '#9CAF88' },
  { id: 'ivory', label: 'IVORY', hex: '#FFF8E7' },
  { id: 'dusty-pink', label: 'DUSTY PINK', hex: '#D4A5A5' },
  { id: 'eucalyptus', label: 'EUCALYPTUS', hex: '#8A9A8B' },
  { id: 'white', label: 'PAPER WHITE', hex: '#FFFFFF' },
];

const WEIGHTS = [
  { id: '65lb', label: '65LB', gsm: 90, desc: 'Light — delicate petals' },
  { id: '80lb', label: '80LB', gsm: 109, desc: 'Standard — balanced' },
  { id: '110lb', label: '110LB', gsm: 150, desc: 'Heavy — sculptural' },
];

const ADDONS = [
  { id: 'greenery', label: 'GREENERY', price: 12.00, key: 'addGreenery' },
  { id: 'vase', label: 'VASE', price: 22.00, key: 'vaseIncluded' },
  { id: 'dome', label: 'GLASS DOME', price: 45.00, key: 'domeIncluded' },
  { id: 'led', label: 'LED LIGHTS', price: 18.00, key: 'ledIncluded' },
];

const DEFAULT_SPEC = {
  templateId: 'rose', paperColor: 'blush', weight: '65lb',
  stemCount: 7, heightMm: 300, addGreenery: false,
  vaseIncluded: false, domeIncluded: false, ledIncluded: false,
};

function estimatePrice(spec) {
  const floor = 45.00;
  const perStem = 9.50;
  const wSur = spec.weight === '80lb' ? 1.50 : spec.weight === '110lb' ? 3.00 : 0;
  const hSur = Math.floor(Math.max(0, spec.heightMm - 400) / 100) * 2.00;
  const addonTotal = (spec.addGreenery ? 12 : 0) + (spec.vaseIncluded ? 22 : 0) + (spec.domeIncluded ? 45 : 0) + (spec.ledIncluded ? 18 : 0);
  return Math.round((floor + spec.stemCount * perStem + wSur * spec.stemCount + hSur + addonTotal) * 100) / 100;
}

function TerminalBlock({ children, className = '' }) {
  return <div className={`bg-carbon border-2 border-ash ${className}`}>{children}</div>;
}

function TerminalHeader({ title, subtitle }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-steel border-b-2 border-ash">
      <span className="w-3 h-3 bg-alert" />
      <span className="w-3 h-3 bg-[#FFB800]" />
      <span className="w-3 h-3 bg-ok" />
      <span className="ml-3 font-mono text-xs text-magenta uppercase tracking-widest">{title}</span>
      {subtitle && <span className="ml-auto font-mono text-[10px] text-smoke">{subtitle}</span>}
    </div>
  );
}

function BrutalButton({ children, onClick, active = false, variant = 'default', className = '' }) {
  const v = variant === 'acid' ? 'btn-brutal--acid' : variant === 'magenta' ? 'btn-brutal--magenta' : '';
  return (
    <button onClick={onClick} className={`btn-brutal ${v} ${active ? 'bg-magenta border-magenta text-void' : ''} ${className}`}>
      {children}
    </button>
  );
}

export default function BrutalistBouquetConfigurator() {
  const [spec, setSpec] = useState({ ...DEFAULT_SPEC });
  const [activeTab, setActiveTab] = useState('template');
  const price = estimatePrice(spec);
  const color = COLORS.find((c) => c.id === spec.paperColor) || COLORS[0];
  const weight = WEIGHTS.find((w) => w.id === spec.weight) || WEIGHTS[0];
  const template = TEMPLATES.find((t) => t.id === spec.templateId) || TEMPLATES[0];

  const set = (patch) => setSpec((s) => ({ ...s, ...patch }));
  const toggleAddon = (id) => {
    const addon = ADDONS.find((a) => a.id === id);
    if (addon) set({ [addon.key]: !spec[addon.key] });
  };

  const tabs = [
    { id: 'template', label: '01_TEMPLATE' },
    { id: 'color', label: '02_COLOR' },
    { id: 'weight', label: '03_WEIGHT' },
    { id: 'geometry', label: '04_GEOMETRY' },
    { id: 'addons', label: '05_ADDONS' },
    { id: 'output', label: '06_OUTPUT' },
  ];

  return (
    <div className="min-h-screen bg-void text-bone font-mono">
      <header className="border-b-2 border-ash bg-carbon">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-magenta glow-magenta tracking-tight">
              KFK://BOUQUET.CONFIG
            </h1>
            <p className="font-mono text-[10px] text-smoke uppercase tracking-widest mt-1">
              Custom paper florist — Perth WA — v2.0
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="readout">STATUS: ONLINE</span>
            <span className="readout">MODE: BUILD</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Preview */}
          <div className="lg:col-span-1 space-y-4">
            <TerminalBlock>
              <TerminalHeader title="PREVIEW.SVG" subtitle={`TEMPLATE: ${template.id.toUpperCase()}`} />
              <div className="p-6 flex items-center justify-center min-h-[300px] relative scan-overlay">
                <div className="w-48 h-48 relative">{FLOWER_SVGS[template.id]}</div>
                <div className="absolute bottom-4 left-4 space-y-1">
                  <div className="readout">X: 0.00  Y: 0.00</div>
                  <div className="readout">SCALE: 1.00</div>
                  <div className="readout">ROT: 0°</div>
                </div>
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-smoke">PAPER:</span>
                  <span className="w-4 h-4 border border-bone" style={{ backgroundColor: color.hex }} />
                  <span className="font-mono text-[10px] text-acid">{color.label}</span>
                </div>
              </div>
            </TerminalBlock>

            <TerminalBlock>
              <TerminalHeader title="PRICE.CALC" subtitle="GST INCL." />
              <div className="p-4 space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-xs text-smoke">FLOOR</span>
                  <span className="font-mono text-sm text-bone">$45.00</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-xs text-smoke">STEMS ({spec.stemCount} × $9.50)</span>
                  <span className="font-mono text-sm text-bone">${(spec.stemCount * 9.5).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-xs text-smoke">WEIGHT SURCHARGE</span>
                  <span className="font-mono text-sm text-bone">
                    ${((weight.gsm > 90 ? (weight.gsm > 109 ? 3.00 : 1.50) : 0) * spec.stemCount).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-xs text-smoke">ADDONS</span>
                  <span className="font-mono text-sm text-bone">
                    ${((spec.addGreenery ? 12 : 0) + (spec.vaseIncluded ? 22 : 0) + (spec.domeIncluded ? 45 : 0) + (spec.ledIncluded ? 18 : 0)).toFixed(2)}
                  </span>
                </div>
                <div className="border-t-2 border-dashed border-ash pt-2 mt-2 flex justify-between items-baseline">
                  <span className="font-mono text-xs text-magenta font-bold">TOTAL (AUD)</span>
                  <span className="font-heading text-2xl font-bold text-acid glow-acid">${price.toFixed(2)}</span>
                </div>
              </div>
            </TerminalBlock>
          </div>

          {/* Right: Controls */}
          <div className="lg:col-span-2">
            <TerminalBlock>
              <TerminalHeader title="CONFIGURATOR.TERMINAL" subtitle={`STEP ${tabs.findIndex((t) => t.id === activeTab) + 1}/6`} />
              <div className="flex flex-wrap border-b-2 border-ash">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 font-mono text-xs uppercase tracking-widest border-r-2 border-ash transition-colors ${
                      activeTab === tab.id ? 'bg-magenta text-void font-bold' : 'text-smoke hover:text-bone hover:bg-steel'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6 space-y-6">
                {activeTab === 'template' && (
                  <div className="space-y-4">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// SELECT FLOWER TEMPLATE</div>
                    <div className="grid grid-cols-2 gap-4">
                      {TEMPLATES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => set({ templateId: t.id })}
                          className={`card-brutal text-left transition-all ${spec.templateId === t.id ? 'border-magenta shadow-magenta-glow' : 'hover:border-magenta'}`}
                        >
                          <div className="w-full h-24 bg-steel flex items-center justify-center mb-3">
                            {FLOWER_SVGS[t.id]}
                          </div>
                          <div className="font-mono text-xs text-acid font-bold uppercase">{t.label}</div>
                          <div className="font-mono text-[10px] text-smoke mt-1">{t.description}</div>
                          {spec.templateId === t.id && <div className="mt-2 font-mono text-[10px] text-magenta">[ SELECTED ]</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'color' && (
                  <div className="space-y-4">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// SELECT PAPER COLOR</div>
                    <div className="grid grid-cols-3 gap-3">
                      {COLORS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => set({ paperColor: c.id })}
                          className={`card-brutal flex flex-col items-center gap-2 p-3 transition-all ${spec.paperColor === c.id ? 'border-magenta shadow-magenta-glow' : 'hover:border-magenta'}`}
                        >
                          <div className="w-12 h-12 border-2 border-bone" style={{ backgroundColor: c.hex }} />
                          <span className="font-mono text-[10px] text-bone uppercase tracking-wider">{c.label}</span>
                          {spec.paperColor === c.id && <span className="font-mono text-[10px] text-acid">[ ACTIVE ]</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'weight' && (
                  <div className="space-y-4">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// SELECT PAPER WEIGHT (GSM)</div>
                    <div className="space-y-3">
                      {WEIGHTS.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => set({ weight: w.id })}
                          className={`w-full card-brutal flex items-center justify-between p-4 transition-all ${spec.weight === w.id ? 'border-acid shadow-acid-glow' : 'hover:border-acid'}`}
                        >
                          <div>
                            <div className="font-mono text-sm text-bone font-bold">{w.label}</div>
                            <div className="font-mono text-[10px] text-smoke mt-1">{w.desc}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-xs text-acid">{w.gsm} GSM</div>
                            {spec.weight === w.id && <div className="font-mono text-[10px] text-magenta mt-1">[ SELECTED ]</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'geometry' && (
                  <div className="space-y-6">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// SET GEOMETRY PARAMETERS</div>
                    <div className="space-y-1">
                      <label className="font-mono text-[10px] text-magenta uppercase tracking-widest block">STEM COUNT (1-25)</label>
                      <input type="number" value={spec.stemCount} min={1} max={25} onChange={(e) => set({ stemCount: parseInt(e.target.value) || 1 })} className="input-brutal" />
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[10px] text-magenta uppercase tracking-widest block">HEIGHT (MM, 150-600)</label>
                      <input type="number" value={spec.heightMm} min={150} max={600} step={50} onChange={(e) => set({ heightMm: parseInt(e.target.value) || 150 })} className="input-brutal" />
                    </div>
                    <div className="border-2 border-dashed border-ash p-4 space-y-2">
                      <div className="font-mono text-[10px] text-magenta uppercase tracking-widest mb-2">// LIVE READOUT</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="readout">X: 0.00</div>
                        <div className="readout">Y: 0.00</div>
                        <div className="readout">Z: {spec.heightMm}mm</div>
                        <div className="readout">SCALE: {spec.stemCount}</div>
                        <div className="readout">ROT: 0°</div>
                        <div className="readout">GSM: {weight.gsm}</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'addons' && (
                  <div className="space-y-4">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// SELECT ADD-ONS</div>
                    <div className="grid grid-cols-2 gap-3">
                      {ADDONS.map((addon) => {
                        const isActive = spec[addon.key];
                        return (
                          <button
                            key={addon.id}
                            onClick={() => toggleAddon(addon.id)}
                            className={`card-brutal flex items-center justify-between p-4 transition-all ${isActive ? 'border-acid shadow-acid-glow' : 'hover:border-acid'}`}
                          >
                            <div className="font-mono text-sm text-bone font-bold">{addon.label}</div>
                            <div className="text-right">
                              <div className="font-mono text-xs text-acid">+${addon.price.toFixed(2)}</div>
                              {isActive && <div className="font-mono text-[10px] text-magenta mt-1">[ ON ]</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === 'output' && (
                  <div className="space-y-4">
                    <div className="font-mono text-xs text-magenta uppercase tracking-widest mb-3">// OUTPUT & ORDER</div>
                    <TerminalBlock>
                      <TerminalHeader title="SPEC.SUMMARY" subtitle="JSON" />
                      <pre className="p-4 font-mono text-xs text-acid overflow-auto max-h-64">
                        {JSON.stringify(spec, null, 2)}
                      </pre>
                    </TerminalBlock>
                    <div className="flex gap-3">
                      <BrutalButton variant="magenta" onClick={() => console.log('SUBMIT', spec)}>SUBMIT ORDER</BrutalButton>
                      <BrutalButton variant="acid" onClick={() => navigator.clipboard?.writeText(JSON.stringify(spec))}>COPY SPEC</BrutalButton>
                      <BrutalButton onClick={() => setSpec({ ...DEFAULT_SPEC })}>RESET</BrutalButton>
                    </div>
                  </div>
                )}
              </div>
            </TerminalBlock>
          </div>
        </div>
      </main>

      <footer className="border-t-2 border-ash bg-carbon mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-mono text-[10px] text-smoke">KFK STUDIO // PERTH WA // {new Date().getFullYear()}</span>
          <span className="font-mono text-[10px] text-smoke"><span className="text-acid">●</span> SYSTEM ONLINE</span>
        </div>
      </footer>
    </div>
  );
}