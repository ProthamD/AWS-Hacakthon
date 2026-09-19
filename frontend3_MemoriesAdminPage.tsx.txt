import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload, Play, Trash2, ImageIcon, Film, Clock, BookOpen, Sparkles } from 'lucide-react';
import { API_BASE } from '../App';

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
  const navigate = useNavigate();
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Story Time schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(() =>
    localStorage.getItem('sahay_story_schedule_enabled') === 'true'
  );
  const [scheduleTime, setScheduleTime] = useState(() =>
    localStorage.getItem('sahay_story_schedule_time') || '15:00'
  );
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [previewStory, setPreviewStory] = useState<string | null>(null);

  const handleFile = (f: File | null | undefined) => {
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
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    setPreview(null);
    setCaption('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveSchedule = (enabled: boolean, time: string) => {
    localStorage.setItem('sahay_story_schedule_enabled', String(enabled));
    localStorage.setItem('sahay_story_schedule_time', time);
    setScheduleEnabled(enabled);
    setScheduleTime(time);
  };

  const generatePreview = async () => {
    if (!mems.length) return;
    setGeneratingPreview(true);
    setPreviewStory(null);
    try {
      const patientName = (() => {
        try { return JSON.parse(localStorage.getItem('sahay_profile') || '{}').patientName || 'the patient'; } catch { return 'the patient'; }
      })();
      const res = await fetch(`${API_BASE}/memories/narrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          memories: mems.map(m => ({ id: m.id, caption: m.caption, date: m.date })),
          previewOnly: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewStory(data.intro || data.segments?.[0]?.narration || null);
      } else {
        setPreviewStory(mems.map(m => m.caption).join(' · '));
      }
    } catch {
      setPreviewStory(mems.map(m => m.caption).join(' · '));
    } finally {
      setGeneratingPreview(false);
    }
  };

  return (
    <div className="font-ui page-container" style={{ maxWidth: 700 }}>

      {/* Header */}
      <div className="anim-fade-up" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="section-label" style={{ marginBottom: 10 }}>04 / Memory Theater</div>
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', fontWeight: 300, color: 'var(--c-text-1)', letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 10 }}>
            Family Memories
          </h1>
          <p style={{ fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.65, maxWidth: 440 }}>
            These photos are narrated to your patient during confused or distressed moments — helping them reconnect with their story and feel calm.
          </p>
        </div>
        {mems.length > 0 && (
          <Link
            to="/storytime"
            className="btn btn-primary"
            style={{ flexShrink: 0, gap: 8 }}
          >
            <Film size={14} strokeWidth={1.8} />
            Story Time
          </Link>
        )}
      </div>

      {/* Upload card */}
      <div className="glass-card anim-fade-up" style={{ animationDelay: '0.08s', padding: 24, marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--c-text-3)', marginBottom: 16 }}>
          Add a Memory
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone${dragging ? ' active' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); }}
          role="button"
          tabIndex={0}
          aria-label="Upload a memory photo"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
          style={{ marginBottom: 16, borderColor: preview ? 'var(--c-accent)' : undefined }}
        >
          {preview ? (
            <img
              src={preview}
              alt="Memory preview"
              style={{ maxHeight: 220, maxWidth: '100%', margin: '0 auto', display: 'block', borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--c-surface-2)', border: '1px solid var(--c-border-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={20} strokeWidth={1.5} style={{ color: 'var(--c-text-3)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: 'var(--c-text-2)', fontWeight: 500 }}>Click or drag a photo here</div>
                <div style={{ fontSize: 12, color: 'var(--c-text-4)', marginTop: 4 }}>JPG, PNG, WEBP — stays on your device</div>
              </div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} aria-hidden="true" />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="input-field"
            style={{ flex: 1 }}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Caption — e.g. 'Our trip to Rishikesh, 2018'"
            aria-label="Memory caption"
          />
          <button
            onClick={handleAdd}
            disabled={!preview}
            className="btn btn-primary"
            style={{
              flexShrink: 0,
              opacity: preview ? 1 : 0.4,
              cursor: preview ? 'pointer' : 'not-allowed',
              minWidth: 80,
            }}
          >
            <ImageIcon size={13} strokeWidth={1.8} />
            Add
          </button>
        </div>
      </div>

      {/* ── Story Time Schedule ──────────────────────────────── */}
      <div className="glass-card anim-fade-up" style={{ animationDelay: '0.14s', padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--c-accent-dim)', border: '1px solid rgba(217,98,42,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={16} strokeWidth={1.6} style={{ color: 'var(--c-accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text-1)' }}>Story Time</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>AI weaves photos into a warm narrated story for your patient</div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--c-text-1)', display: 'block', marginBottom: 4 }}>✨ How it works</strong>
          Sahay checks when your patient is calm and schedules a gentle story session. The AI reads the captions you've added, weaves them into a warm personal narrative ("This is you and Priya at her wedding…"), and presents it with photos and a soothing voice — like a story-telling grandparent.
        </div>

        {/* Schedule toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-1)' }}>Daily Story Time</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>Show stories at a regular time each day</div>
          </div>
          <button
            role="switch"
            aria-checked={scheduleEnabled}
            className={`toggle-track ${scheduleEnabled ? 'on' : ''}`}
            onClick={() => saveSchedule(!scheduleEnabled, scheduleTime)}
          >
            <div className="toggle-thumb" />
          </button>
        </div>

        {scheduleEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Clock size={16} style={{ color: 'var(--c-accent)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: 'var(--c-text-3)', display: 'block', marginBottom: 6 }}>
                Story time at
              </label>
              <input
                type="time"
                className="input-field"
                value={scheduleTime}
                onChange={e => saveSchedule(true, e.target.value)}
                style={{ maxWidth: 160 }}
                aria-label="Story time schedule"
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', maxWidth: 200, lineHeight: 1.5 }}>
              Patient will see a gentle notification and Sahay will offer to start story time.
            </div>
          </div>
        )}

        {/* AI Preview */}
        {mems.length > 0 && (
          <div>
            <button
              className="btn btn-ghost"
              onClick={generatePreview}
              disabled={generatingPreview}
              style={{ gap: 8, width: '100%', justifyContent: 'center' }}
            >
              <Sparkles size={14} strokeWidth={1.8} />
              {generatingPreview ? 'Generating story preview…' : 'Preview AI Story'}
            </button>
            {previewStory && (
              <div style={{
                marginTop: 14, padding: '14px 18px',
                background: 'linear-gradient(135deg, var(--c-accent-dim) 0%, var(--c-surface-2) 100%)',
                border: '1px solid rgba(217,98,42,0.18)',
                borderRadius: 10,
                fontSize: 14, color: 'var(--c-text-2)', lineHeight: 1.75,
                fontStyle: 'italic',
              }}>
                <span style={{ color: 'var(--c-accent)', fontStyle: 'normal', fontWeight: 700, fontSize: 12, display: 'block', marginBottom: 6, letterSpacing: '0.08em' }}>
                  AI PREVIEW
                </span>
                "{previewStory}"
              </div>
            )}
          </div>
        )}
      </div>

      {/* Memory grid */}
      {mems.length === 0 ? (
        <div className="anim-fade-in" style={{ textAlign: 'center', padding: '56px 0', color: 'var(--c-text-4)', fontSize: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ImageIcon size={24} strokeWidth={1} style={{ color: 'var(--c-text-4)' }} />
          </div>
          No memories yet — add your first photo above.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--c-text-2)', fontWeight: 600 }}>{mems.length} {mems.length === 1 ? 'memory' : 'memories'}</div>
            <button
              onClick={() => navigate('/storytime')}
              style={{ fontSize: 12, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600, fontFamily: 'Manrope' }}
            >
              <Play size={12} strokeWidth={2} /> Start Story Time
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
            {mems.map(m => (
              <div key={m.id} className="memory-card anim-scale-in">
                <img
                  src={m.url}
                  alt={m.caption}
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
                <div className="memory-card-overlay">
                  <div style={{ fontSize: 12, color: 'rgba(245,237,226,0.92)', marginBottom: 2, lineHeight: 1.4, fontWeight: 500 }}>{m.caption}</div>
                  <div style={{ fontSize: 10, color: 'rgba(245,237,226,0.45)' }}>{m.date}</div>
                </div>
                <button
                  className="memory-delete-btn"
                  onClick={() => remove(m.id)}
                  aria-label={`Remove memory: ${m.caption}`}
                >
                  <Trash2 size={12} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
