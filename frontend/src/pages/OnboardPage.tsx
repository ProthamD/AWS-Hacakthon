import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, ChevronRight, MapPin, Navigation, Search, X, Star } from 'lucide-react';

/* ── Types ─────────────────────────────────────────── */
interface Profile {
  patientName: string; patientAge: string;
  homeAddress: string; homeLat: string; homeLng: string;
  scheduledDestination: string; destinationLat: string; destinationLng: string;
  destinationPriority: 'normal' | 'high';
  emergencyContactName: string; emergencyContactPhone: string;
  caregiverEmail: string;
  patientLanguage: string; memories: string;
  dailyRoutine: string; keyRelationships: string; likesAndDislikes: string;
  dementiaStage: string;
}

const EMPTY: Profile = {
  patientName:'', patientAge:'',
  homeAddress:'', homeLat:'', homeLng:'',
  scheduledDestination:'', destinationLat:'', destinationLng:'',
  destinationPriority:'normal',
  emergencyContactName:'', emergencyContactPhone:'',
  caregiverEmail:'',
  patientLanguage:'English', memories:'',
  dailyRoutine:'', keyRelationships:'', likesAndDislikes:'',
  dementiaStage:'moderate',
};

/* ── Nominatim reverse-geocode ──────────────────────── */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const d = await r.json();
    return d.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

async function searchAddress(query: string): Promise<{ display_name: string; lat: string; lon: string }[]> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`,
      { headers: { 'Accept-Language': 'en' } }
    );
    return await r.json();
  } catch { return []; }
}

/* ── Map Picker Modal ───────────────────────────────── */
interface MapPickerProps {
  title: string;
  initialLat?: number; initialLng?: number;
  onPick: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}

declare global { interface Window { L: any; } }

function MapPickerModal({ title, initialLat, initialLng, onPick, onClose }: MapPickerProps) {
  const mapDivRef   = useRef<HTMLDivElement>(null);
  const mapRef      = useRef<any>(null);
  const markerRef   = useRef<any>(null);
  const [addr, setAddr]       = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [picking, setPicking] = useState(false);

  /* Load Leaflet CSS + JS once */
  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (window.L) { initMap(); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => initMap();
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initMap = useCallback(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const lat = initialLat || 20.5937;
    const lng = initialLng || 78.9629;
    const map = window.L.map(mapDivRef.current).setView([lat, lng], initialLat ? 15 : 5);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(map);
    mapRef.current = map;

    if (initialLat && initialLng) placeMarker(initialLat, initialLng);

    map.on('click', async (e: any) => {
      const { lat, lng } = e.latlng;
      placeMarker(lat, lng);
      setPicking(true);
      const a = await reverseGeocode(lat, lng);
      setAddr(a);
      setPicking(false);
    });
  }, [initialLat, initialLng]);

  const placeMarker = (lat: number, lng: number) => {
    if (!mapRef.current) return;
    const icon = window.L.divIcon({
      html: `<div style="background:#6366f1;width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
      className: '', iconSize: [22, 22], iconAnchor: [11, 22],
    });
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = window.L.marker([lat, lng], { icon }).addTo(mapRef.current);
    mapRef.current.setView([lat, lng], 15);
  };

  const useCurrentLocation = () => {
    navigator.geolocation?.getCurrentPosition(async (p) => {
      const { latitude: lat, longitude: lng } = p.coords;
      placeMarker(lat, lng);
      setPicking(true);
      const a = await reverseGeocode(lat, lng);
      setAddr(a);
      setPicking(false);
    }, () => alert('Location access denied'));
  };

  const doSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    const res = await searchAddress(searchQ);
    setResults(res);
    setSearching(false);
  };

  const pickResult = async (r: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon);
    placeMarker(lat, lng);
    setAddr(r.display_name);
    setResults([]);
    setSearchQ(r.display_name.split(',')[0]);
  };

  const confirmPick = () => {
    if (!markerRef.current) { alert('Please tap the map or search to pick a location.'); return; }
    const { lat, lng } = markerRef.current.getLatLng();
    onPick(lat, lng, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.85)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:560, background:'#0f0f1a', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', maxHeight:'90vh' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:10 }}>
          <MapPin size={16} style={{ color:'#6366f1' }} />
          <span style={{ flex:1, fontSize:14, fontWeight:600, color:'#fff' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', padding:4 }}><X size={18} /></button>
        </div>

        {/* Search bar */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', gap:8 }}>
          <input
            value={searchQ} onChange={e => setSearchQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Search an address or place…"
            style={{ flex:1, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'8px 12px', color:'#fff', fontSize:13, outline:'none', fontFamily:'Manrope, sans-serif' }}
          />
          <button onClick={doSearch} disabled={searching}
            style={{ background:'#6366f1', border:'none', borderRadius:8, padding:'8px 14px', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600 }}>
            <Search size={14} /> {searching ? '…' : 'Search'}
          </button>
          <button onClick={useCurrentLocation} title="Use my current location"
            style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.3)', borderRadius:8, padding:'8px 12px', color:'rgba(74,222,128,0.9)', cursor:'pointer' }}>
            <Navigation size={15} />
          </button>
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div style={{ background:'#0d0d1a', borderBottom:'1px solid rgba(255,255,255,0.06)', maxHeight:160, overflowY:'auto' }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => pickResult(r)}
                style={{ display:'block', width:'100%', textAlign:'left', padding:'9px 14px', background:'none', border:'none', color:'rgba(255,255,255,0.8)', fontSize:12, cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,0.04)', fontFamily:'Manrope, sans-serif' }}>
                📍 {r.display_name}
              </button>
            ))}
          </div>
        )}

        {/* Map */}
        <div ref={mapDivRef} style={{ flex:1, minHeight:300, position:'relative' }}>
          <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.65)', color:'rgba(255,255,255,0.7)', fontSize:11, padding:'4px 10px', borderRadius:20, pointerEvents:'none', zIndex:500, whiteSpace:'nowrap' }}>
            Tap anywhere on the map to pin location
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)' }}>
          {picking && <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:6 }}>🔍 Getting address…</div>}
          {addr && <div style={{ fontSize:12, color:'rgba(74,222,128,0.8)', marginBottom:8, wordBreak:'break-word' }}>📍 {addr}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onClose} style={{ flex:1, background:'transparent', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.6)', padding:'9px', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'Manrope, sans-serif' }}>
              Cancel
            </button>
            <button onClick={confirmPick} disabled={!markerRef.current}
              style={{ flex:2, background: markerRef.current ? '#6366f1' : 'rgba(99,102,241,0.3)', border:'none', color:'#fff', padding:'9px', borderRadius:8, cursor: markerRef.current ? 'pointer' : 'default', fontSize:13, fontWeight:700, fontFamily:'Manrope, sans-serif' }}>
              ✓ Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Mini map preview ───────────────────────────────── */
function MiniMapPreview({ lat, lng, label }: { lat: string; lng: string; label: string }) {
  if (!lat || !lng) return null;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(lng)-0.01},${parseFloat(lat)-0.01},${parseFloat(lng)+0.01},${parseFloat(lat)+0.01}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <div style={{ marginTop:8, borderRadius:10, overflow:'hidden', border:'1px solid rgba(99,102,241,0.2)' }}>
      <div style={{ fontSize:10, padding:'5px 10px', background:'rgba(99,102,241,0.08)', color:'rgba(99,102,241,0.8)', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }}>
        📍 {label} pinned
      </div>
      <iframe src={src} width="100%" height="140" style={{ border:0, display:'block', opacity:0.85 }} title={label} />
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer"
        style={{ display:'block', textAlign:'center', padding:'6px', background:'rgba(255,255,255,0.03)', color:'rgba(255,255,255,0.4)', fontSize:11, textDecoration:'none' }}>
        Open in Google Maps ↗
      </a>
    </div>
  );
}

/* ── Location input with map picker ────────────────── */
interface LocationInputProps {
  addressKey: string; latKey: string; lngKey: string;
  label: string; placeholder: string; icon: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  pickerTitle: string;
}

function LocationInput({ addressKey, latKey, lngKey, label, placeholder, icon, form, set, pickerTitle }: LocationInputProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handlePick = (lat: number, lng: number, address: string) => {
    set(addressKey, address.split(',').slice(0, 3).join(',').trim());
    set(latKey, lat.toFixed(6));
    set(lngKey, lng.toFixed(6));
    setShowPicker(false);
  };

  const hasPin = !!(form[latKey] && form[lngKey]);

  return (
    <div>
      <label style={{ display:'block', fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.45)', marginBottom:8, fontWeight:600 }}>
        {icon} {label}
      </label>
      <div style={{ display:'flex', gap:8 }}>
        <input className="input-field" type="text" value={form[addressKey]}
          onChange={e => set(addressKey, e.target.value)}
          placeholder={placeholder}
          style={{ flex:1 }}
        />
        <button onClick={() => setShowPicker(true)} title="Pick on map"
          style={{ flexShrink:0, background: hasPin ? 'rgba(74,222,128,0.1)' : 'rgba(99,102,241,0.1)', border:`1px solid ${hasPin ? 'rgba(74,222,128,0.3)' : 'rgba(99,102,241,0.3)'}`, borderRadius:8, padding:'0 14px', color: hasPin ? 'rgba(74,222,128,0.9)' : 'rgba(99,102,241,0.9)', cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:600, fontFamily:'Manrope, sans-serif', whiteSpace:'nowrap' }}>
          <MapPin size={14} /> {hasPin ? '✓ Pinned' : 'Pick on Map'}
        </button>
      </div>
      {hasPin && (
        <MiniMapPreview lat={form[latKey]} lng={form[lngKey]} label={label} />
      )}
      {showPicker && (
        <MapPickerModal
          title={pickerTitle}
          initialLat={form[latKey] ? parseFloat(form[latKey]) : undefined}
          initialLng={form[lngKey] ? parseFloat(form[lngKey]) : undefined}
          onPick={handlePick}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

/* ── Main OnboardPage ───────────────────────────────── */
export default function OnboardPage() {
  const nav = useNavigate();
  const [form, setForm] = useState<Record<string, string>>(() => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem('sahay_patient_profile') || '{}') }; }
    catch { return EMPTY as unknown as Record<string, string>; }
  });
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    try {
      localStorage.setItem('sahay_patient_profile', JSON.stringify(form));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ }
  };

  const labelStyle = { display:'block' as const, fontSize:11, letterSpacing:'0.1em', textTransform:'uppercase' as const, color:'rgba(255,255,255,0.45)', marginBottom:8, fontWeight:600 };
  const sectionStyle = { fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'rgba(99,102,241,0.6)', fontWeight:700, padding:'6px 0 10px', borderBottom:'1px solid rgba(255,255,255,0.05)', marginBottom:20 };

  return (
    <div className="font-ui" style={{ maxWidth:580, margin:'0 auto', padding:'40px 20px' }}>

      <div style={{ fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(99,102,241,0.8)', marginBottom:20, fontWeight:600 }}>
        02 / Patient Setup
      </div>
      <h1 className="font-display" style={{ fontSize:'clamp(1.8rem,5vw,2.8rem)', fontWeight:400, lineHeight:1.1, color:'#fff', marginBottom:10, letterSpacing:'-1px' }}>
        Set up once.<br />
        <em style={{ color:'rgba(255,255,255,0.45)', fontStyle:'italic' }}>Sahay handles the rest.</em>
      </h1>
      <p style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.65, marginBottom:36 }}>
        Information stays on your device. Helps Sahay personalise responses and contact the right person in an emergency.
      </p>

      <div style={{ display:'flex', flexDirection:'column', gap:22 }}>

        {/* ── Patient info ── */}
        <div style={sectionStyle}>👤 Patient Information</div>

        {(['patientName','patientAge'] as const).map(k => (
          <div key={k}>
            <label style={labelStyle}>{k === 'patientName' ? 'Patient Name' : 'Age'}</label>
            <input className="input-field" type={k === 'patientAge' ? 'number' : 'text'} value={form[k]} onChange={e => set(k, e.target.value)}
              placeholder={k === 'patientName' ? 'e.g. Meera Sharma' : 'e.g. 74'} />
          </div>
        ))}

        <div>
          <label style={labelStyle}>Dementia Stage</label>
          <select className="input-field" value={form.dementiaStage} onChange={e => set('dementiaStage', e.target.value)}>
            {['mild','moderate','severe'].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Primary Language</label>
          <select className="input-field" value={form.patientLanguage} onChange={e => set('patientLanguage', e.target.value)}>
            {['English','Hindi','Bengali','Tamil','Telugu','Kannada','Marathi','Gujarati'].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* ── Emergency contact ── */}
        <div style={sectionStyle}>🚨 Emergency Contact</div>

        {(['emergencyContactName','emergencyContactPhone'] as const).map(k => (
          <div key={k}>
            <label style={labelStyle}>{k === 'emergencyContactName' ? 'Caregiver Name' : 'Caregiver Phone (with +91)'}</label>
            <input className="input-field" type={k === 'emergencyContactPhone' ? 'tel' : 'text'} value={form[k]} onChange={e => set(k, e.target.value)}
              placeholder={k === 'emergencyContactName' ? 'e.g. Priya Sharma' : '+91 98765 43210'} />
          </div>
        ))}

        <div>
          <label style={labelStyle}>📧 Caregiver Email (for alerts)</label>
          <input
            className="input-field"
            type="email"
            value={form.caregiverEmail}
            onChange={e => set('caregiverEmail', e.target.value)}
            placeholder="e.g. priya.sharma@gmail.com"
          />
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:6, lineHeight:1.6 }}>
            Sahay will email this address when distress is detected. Alerts are rate-limited to once every 30 minutes.
          </div>
        </div>

        {/* ── Location & Routing ── */}
        <div style={sectionStyle}>🗺️ Locations & Routing</div>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginTop:-14, marginBottom:4, lineHeight:1.6 }}>
          Type an address manually, or tap <strong style={{ color:'rgba(99,102,241,0.8)' }}>Pick on Map</strong> to visually drop a pin and auto-fill coordinates for smart routing.
        </p>

        <LocationInput
          addressKey="homeAddress" latKey="homeLat" lngKey="homeLng"
          label="Home Address" placeholder="Full address (e.g. 12 MG Road, Bengaluru)"
          icon="🏠" form={form} set={set}
          pickerTitle="Pin Home Location"
        />

        <LocationInput
          addressKey="scheduledDestination" latKey="destinationLat" lngKey="destinationLng"
          label="Scheduled Destination (optional)" placeholder="e.g. Apollo Hospital, Bengaluru"
          icon="📍" form={form} set={set}
          pickerTitle="Pin Scheduled Destination"
        />

        <div>
          <label style={labelStyle}><Star size={12} style={{ display:'inline', marginRight:5 }} />Destination Priority</label>
          <div style={{ display:'flex', gap:10 }}>
            {(['normal','high'] as const).map(p => (
              <button key={p} onClick={() => set('destinationPriority', p)}
                style={{ flex:1, padding:'10px', borderRadius:8, border:`1px solid ${form.destinationPriority===p ? (p==='high'?'rgba(251,146,60,0.5)':'rgba(99,102,241,0.5)') : 'rgba(255,255,255,0.1)'}`, background: form.destinationPriority===p ? (p==='high'?'rgba(251,146,60,0.1)':'rgba(99,102,241,0.1)') : 'transparent', color: form.destinationPriority===p ? (p==='high'?'rgba(251,146,60,0.9)':'rgba(99,102,241,0.9)') : 'rgba(255,255,255,0.45)', cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'Manrope, sans-serif', transition:'all 0.2s' }}>
                {p === 'high' ? '🔥 High — always route to destination' : '⚖️ Normal — pick closest'}
              </button>
            ))}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:7, lineHeight:1.6 }}>
            <strong>Normal:</strong> Sahay compares distances and shows the closest safe place. <strong>High:</strong> Always route to the scheduled destination, ignoring distance.
          </div>
        </div>

        {/* ── Personal context ── */}
        <div style={sectionStyle}>💬 Personal Context (helps AI respond naturally)</div>

        {([
          ['keyRelationships', 'Key Relationships', 'e.g. Wife: Sumana, Son: Arjun, Daughter: Priya'],
          ['dailyRoutine',     'Daily Routine',     'e.g. Morning walk at 7am, tea at 8am, nap at 2pm'],
          ['likesAndDislikes', 'Likes & Dislikes',  'e.g. Loves cricket, dislikes loud music'],
          ['memories',         'Personal Memories', 'e.g. Retired schoolteacher, favourite song is Vande Mataram'],
        ] as [string, string, string][]).map(([k, lbl, ph]) => (
          <div key={k}>
            <label style={labelStyle}>{lbl}</label>
            <textarea className="input-field" value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph} rows={2} />
          </div>
        ))}

      </div>

      {/* ── Action buttons ── */}
      <div style={{ display:'flex', gap:12, marginTop:36, flexWrap:'wrap' }}>
        <button onClick={save}
          style={{ display:'inline-flex', alignItems:'center', gap:10, background: saved ? 'rgba(74,222,128,0.15)' : '#6366f1', border: saved ? '1px solid rgba(74,222,128,0.4)' : '1px solid transparent', color:'#fff', padding:'11px 20px', fontSize:13, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', fontFamily:'Manrope, sans-serif', borderRadius:6, transition:'background 0.25s' }}>
          <Save size={15} strokeWidth={1.8} />
          {saved ? 'Saved ✓' : 'Save Profile'}
        </button>
        <button onClick={() => { save(); nav('/patient'); }}
          style={{ display:'inline-flex', alignItems:'center', gap:10, background:'transparent', border:'1px solid rgba(255,255,255,0.18)', color:'rgba(255,255,255,0.7)', padding:'11px 20px', fontSize:13, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', fontFamily:'Manrope, sans-serif', borderRadius:6 }}>
          Open Patient Mode <ChevronRight size={15} strokeWidth={1.8} />
        </button>
      </div>

      <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)', marginTop:28, lineHeight:1.6 }}>
        Sahay is an AI companion, not a medical device. For emergencies call 112. ARDSI Helpline: 1800-200-ARDSI.
      </p>
    </div>
  );
}
