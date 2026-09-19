import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Play, Trash2, Image } from 'lucide-react';

interface Memory { id: string; url: string; caption: string; date: string; }

function useMemories() {
  const [mems, setMems] = useState<Memory[]>(() => {
    try { return JSON.parse(localStorage.getItem('sahay_memories') || '[]'); } catch { return []; }
  });
  const save = (m: Memory[]) => { setMems(m); localStorage.setItem('sahay_memories', JSON.stringify(m)); };
  const add = (m: Memory) => save([...mems, m]);
  const remove = (id: string) => save(mems.filter(m => m.id !== id));
  return { mems, add, remove };
}

export default function MemoriesAdminPage() {
  const { mems, add, remove } = useMemories();
  const [caption, setCaption] = useState('');
  const [timeFrame, setTimeFrame] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleAdd = () => {
    if (!preview) return;
    add({ 
      id: Date.now().toString(), 
      url: preview, 
      caption: caption.trim() || 'A cherished memory', 
      date: timeFrame.trim() || new Date().getFullYear().toString() 
    });
    setPreview(null);
    setCaption('');
    setTimeFrame('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="font-ui" style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px' }}>

      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(99,102,241,0.8)', marginBottom: 16, fontWeight: 600 }}>
        04 / Memory Theater
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 400, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 8 }}>
            Family Memories
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, maxWidth: 400 }}>
            These photos are shown to your patient during confused or distressed moments with calming AI narration.
          </p>
        </div>
        {mems.length > 0 && (
          <Link
            to="/memories/theater"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#6366f1', color: '#fff', padding: '10px 16px',
              fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            <Play size={13} strokeWidth={1.8} />
            Preview Theater
          </Link>
        )}
      </div>

      {/* Upload card */}
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 24, marginBottom: 28, background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16, fontWeight: 600 }}>
          Add Memory
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `1px dashed ${preview ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.12)'}`,
            padding: 24, marginBottom: 14, cursor: 'pointer', textAlign: 'center',
            background: preview ? 'rgba(99,102,241,0.04)' : 'transparent',
            transition: 'border-color 0.2s, background 0.2s',
          }}
        >
          {preview ? (
            <img src={preview} alt="Preview" style={{ maxHeight: 200, maxWidth: '100%', margin: '0 auto', display: 'block' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Image size={28} strokeWidth={1} style={{ color: 'rgba(255,255,255,0.2)' }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Click to choose a photo</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="input-field"
            style={{ flex: 2 }}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="Caption (e.g. 'Our trip to Rishikesh')"
          />
          <input
            className="input-field"
            style={{ flex: 1 }}
            value={timeFrame}
            onChange={e => setTimeFrame(e.target.value)}
            placeholder="Year/Time (e.g. '2018')"
          />
          <button
            onClick={handleAdd}
            disabled={!preview}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: preview ? '#6366f1' : 'rgba(255,255,255,0.05)',
              border: '1px solid transparent',
              color: preview ? '#fff' : 'rgba(255,255,255,0.3)',
              padding: '10px 16px', fontSize: 12, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: preview ? 'pointer' : 'not-allowed',
              fontFamily: 'Manrope, sans-serif', flexShrink: 0,
            }}
          >
            <Upload size={13} strokeWidth={1.8} />
            Add
          </button>
        </div>
      </div>

      {/* Memory grid */}
      {mems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.18)', fontSize: 14 }}>
          No memories yet — add your first photo above.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {mems.map(m => (
            <div key={m.id} style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <img src={m.url} alt={m.caption} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '10px 12px', background: 'rgba(10,10,18,0.95)' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4, lineHeight: 1.4 }}>{m.caption}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>{m.date}</div>
                <button
                  onClick={() => remove(m.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: 'rgba(239,68,68,0.6)',
                    background: 'none', cursor: 'pointer',
                    fontFamily: 'Manrope, sans-serif',
                    letterSpacing: '0.04em',
                  }}
                >
                  <Trash2 size={11} strokeWidth={1.5} />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
