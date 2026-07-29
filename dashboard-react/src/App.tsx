import { useEffect, useState } from "react";
import type { Recording, ReferenceVoice } from "./types";
import {
  PITCH_ZONES,
  LOUD_ZONES,
  SD_ZONES,
  HNR_ZONES,
  JITTER_ZONES,
  WEIGHT_ZONES,
  MELODY_ZONES,
  zoneOf,
  fmt,
} from "./zones";
import { StatCard } from "./components/StatCard";
import { MetricModal } from "./components/MetricModal";
import { METRICS, type MetricKey } from "./metrics";
import { ResonanceCard } from "./components/ResonanceCard";
import { LineChart, type Point, type ChartBand } from "./components/LineChart";
import { RecordingCard } from "./components/RecordingCard";
import { CheatSheet } from "./components/CheatSheet";
import { RegisterSection } from "./components/RegisterSection";
import {
  AnnotationsProvider,
  Note,
  Region,
} from "./annotations/AnnotationsProvider";
import {
  TulipIcon,
  BowIcon,
  SparkleIcon,
  ContourIcon,
  InsightIcon,
  TrendsIcon,
  CardsIcon,
  BulbIcon,
} from "./components/icons";

export function App() {
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [references, setReferences] = useState<ReferenceVoice[]>([]);
  // which metric's reference modal is open + the card rect it grew from
  const [modal, setModal] = useState<{ key: MetricKey; rect: DOMRect } | null>(
    null,
  );

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [timerId, setTimerId] = useState<number | null>(null);
  const [customFilename, setCustomFilename] = useState<string>("");
  const [autoAnalyse, setAutoAnalyse] = useState<boolean>(true);

  // 🔴 NEU: Funktion startet die Mikrofonaufnahme
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Nutzt Standard-Audioaufzeichnung des Browsers
      const recorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      recorder.onstop = async () => {
        // Verbindet alle aufgenommenen Tonschnipsel zu einer Datei
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        
        // Verpackt die Datei für den HTTP-Versand
        const formData = new FormData();
        formData.append("file", audioBlob);

        if (customFilename.trim()) {
          formData.append("filename", customFilename.trim());
        }

        try {
          const response = await fetch("http://localhost:8000/api/upload-recording", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error("Upload fehlgeschlagen");
          
          const result = await response.json();
          // Automatische Vorauswahl der frisch aufgenommenen Datei im Dropdown
          setSelectedFile(result.filename);

          if (autoAnalyse) {
            handleStartAnalysis(result.filename);
          }
        } catch (err) {
          alert("Fehler beim Übertragen der Aufnahme: " + String(err));
        }

        // Mikrofon-Stream wieder sauber schließen
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingSeconds(0);

      // Kleiner visueller Timer für die Aufnahmezeit
      const interval = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      setTimerId(interval);

    } catch (err) {
      alert("Mikrofon-Zugriff verweigert oder nicht verfügbar: " + String(err));
    }
  };

  // 🔴 NEU: Funktion stoppt die Aufnahme
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerId) {
        clearInterval(timerId);
        setTimerId(null);
      }
    }
  };

  // FUNCTION: Lädt die Aufnahmen frisch und sortiert sie
  const loadRecordingsSilently = () => {
    fetch(`${import.meta.env.BASE_URL}recordings.json?t=${Date.now()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Recording[]) => {
        // Nur den State aktualisieren, wenn sich die Anzahl oder Daten wirklich geändert haben
        setRecordings((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data)) {
            return [...data].sort((a, b) => a.id - b.id);
          }
          return prev;
        });
      })
      .catch((e) => setError(String(e)));
  };

  // FUNCTION: Lädt die Dateiliste aus dem shared-Ordner
  const loadFilesSilently = () => {
    fetch("http://localhost:8000/api/files")
      .then((res) => (res.ok ? res.json() : []))
      .then((files: string[]) => {
        setAvailableFiles((prev) => {
          // Nur aktualisieren bei echten Änderungen im Ordner
          if (JSON.stringify(prev) !== JSON.stringify(files)) {
            // Falls vorher nichts ausgewählt war, nimm die erste neue Datei
            if (!selectedFile && files.length > 0) {
              setSelectedFile(files[0]);
            }
            return files;
          }
          return prev;
        });
      })
      .catch(() => setAvailableFiles([]));
  };

  // 🔴 AUTOMATISCHER SYNC 1: Alle 5 Sekunden die Aufnahmen im Hintergrund prüfen
  useEffect(() => {
    loadRecordingsSilently(); // Erstmaliger Aufruf beim Start
    const interval = setInterval(loadRecordingsSilently, 5000);
    return () => clearInterval(interval);
  }, []);

  // 🔴 AUTOMATISCHER SYNC 2: Alle 3 Sekunden den shared-Ordner nach neuen MP3s scannen
  useEffect(() => {
    loadFilesSilently(); // Erstmaliger Aufruf beim Start
    const interval = setInterval(loadFilesSilently, 3000);
    return () => clearInterval(interval);
  }, [selectedFile]);

  const handleStartAnalysis = async (overrideFilename?: string) => {
    const fileToAnalyze = overrideFilename || selectedFile;

    if (!fileToAnalyze) {
      alert("Bitte wählen Sie zuerst eine Audio-Datei aus! 🌧️");
      return;
    }

    setIsAnalyzing(true);
    try {
      const response = await fetch("http://localhost:8000/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: fileToAnalyze,
          label: `Analysis: ${fileToAnalyze.split('.')[0]}`,
          note: overrideFilename ? "Automatisch nach Aufnahme gestartet" : "Gestartet über Web-Dropdown",
          register_floor: 130
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Fehler beim Analysieren");
      }

      const freshRes = await fetch(`${import.meta.env.BASE_URL}recordings.json?t=${Date.now()}`);
      const data = await freshRes.json();
      const sortedData = [...data].sort((a, b) => Number(a.id) - Number(b.id));
      setRecordings(sortedData);
      if (sortedData.length > 0) {
        const newestRecording = sortedData[sortedData.length - 1];
        setSelectedId(newestRecording.id); 
      } 

    } catch (e) {
      alert(`Fehler: ${String(e)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const openModal = (key: MetricKey, rect: DOMRect) => setModal({ key, rect });

  const R = recordings ?? [];
  const latest = R.length ? R[R.length - 1] : null;
  // the recording currently in focus (defaults to the latest)
  const active =
    (selectedId != null ? R.find((r) => r.id === selectedId) : null) ?? latest;
  const pz = active ? zoneOf(PITCH_ZONES, active.pitch.mean_hz) : null;
  const isLatest = active && latest && active.id === latest.id;

  const mk = (sel: (r: Recording) => number | null): Point[] =>
    R.map((r) => ({ label: r.id, y: sel(r) }));

  return (
    <div className="wrap">
      <header className="hero">
        <h1>
          <TulipIcon title="Voice Garden" /> Voice Garden
        </h1>
        <p>a cozy place to watch your voice bloom 🌱✨</p>
        
        {/* 🔴 NEU: Aufnahme-Steuerung im Header */}
        <div style={{ marginTop: "20px", display: "flex", gap: "15px", flexWrap: "wrap", justifyContent: "center" }}>
          
          
          {/* MIKROFON-BUTTON */}
          <div style={{ 
            background: "rgba(255, 255, 255, 0.05)", 
            padding: "15px", 
            borderRadius: "12px",
            display: "inline-flex",
            gap: "10px",
            alignItems: "center"
          }}>
            <input
            type="text"
            placeholder="Put your chosen name here ✨"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            disabled={isRecording}
            className="filename-input"
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", width: "250px", fontSize: "14px" }}
          />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              style={{
                padding: "10px 20px",
                cursor: "pointer",
                background: isRecording ? "#ff4d4d" : "#4caf50",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {isRecording ? (
                <>🔴 Stop Recording ({recordingSeconds}s)</>
              ) : (
                <>🎙️ Record with Mic</>
              )}
            </button>
        </div>
      </div>
      
      <div style={{ marginTop: "20px", display: "flex", gap: "15px", flexWrap: "wrap", justifyContent: "center" }}>

          {/* DATEIAUSWAHL & ANALYSE-TRIGGER (Bestehendes Layout, leicht angepasst) */}
          <div style={{ 
            background: "rgba(255, 255, 255, 0.05)", 
            padding: "15px", 
            borderRadius: "12px",
            display: "inline-flex",
            gap: "10px",
            alignItems: "center"
          }}>
            <label style={{ fontSize: "0.9rem", color: "#9d8ba8" }}>Select Audio:</label>
            <select 
              value={selectedFile} 
              onChange={(e) => setSelectedFile(e.target.value)}
              disabled={isAnalyzing || availableFiles.length === 0}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #9d8ba8", background: "#1e1e24", color: "#fff", cursor: "pointer" }}
            >
              {availableFiles.length === 0 ? (
                <option value="">No files found in shared folder 📁</option>
              ) : (
                availableFiles.map((file) => (
                  <option key={file} value={file}>{file}</option>
                ))
              )}
            </select>

            <button 
              onClick={handleStartAnalysis} 
              disabled={isAnalyzing || !selectedFile || isRecording}
              style={{ padding: "8px 16px", cursor: "pointer", background: isAnalyzing ? "#555" : "#9d8ba8", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "bold" }}
            >
              {isAnalyzing ? "Analyzing... ⏳" : "Run Analysis 🛠️"}
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={autoAnalyse}
              onChange={(e) => setAutoAnalyse(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Auto-Analyze after recording 🔍
          </label>
          </div>

        </div>

        {active && (
          <div className="latest-banner">
            🌸 <b>#{active.id}</b> &middot; {active.label} &middot;{" "}
            <span style={{ color: "#9d8ba8" }}>{active.date}</span>
          </div>
        )}
      </header>

      {error && (
        <div className="empty">
          couldn't load recordings 🌧️
          <br />
          {error}
        </div>
      )}

      {/* recording switcher */}
      {R.length > 1 && (
        <div className="picker">
          <span className="picker-label">viewing:</span>
          {[...R].reverse().map((r) => (
            <button
              key={r.id}
              className={active && r.id === active.id ? "active" : ""}
              onClick={() => setSelectedId(r.id)}
            >
              #{r.id} · {r.label}
              {latest && r.id === latest.id ? " 🌟" : ""}
            </button>
          ))}
        </div>
      )}

      {active && (
        <AnnotationsProvider recording={active}>
          <Region id="region.top" />

          {/* 🎀 This take */}
          <section>
            <h2 className="section-title">
              <BowIcon /> {isLatest ? "Latest take" : `Take #${active.id}`}
            </h2>
            <p className="take-hint">
              🔍 tap any card with a colored bar to see how you compare to real
              voices
            </p>
            <div className="stat-grid">
              <StatCard
                title="Pitch (avg)"
                value={active.pitch.mean_hz}
                unit="Hz"
                zones={PITCH_ZONES}
                lo={100}
                hi={260}
                metricKey="pitch"
                onExpand={openModal}
                sub={
                  <Note id="note.pitch">
                    {pz ? (
                      <>
                        you're in the <b>{pz.name}</b> zone — 165 Hz+ reads
                        feminine to most ears 💕
                      </>
                    ) : (
                      ""
                    )}
                  </Note>
                }
              />
              <StatCard
                title="Pitch range"
                value={active.pitch.range_hz}
                unit="Hz"
                sub={
                  <>
                    {fmt(active.pitch.min_hz)}–{fmt(active.pitch.max_hz)} Hz ·
                    wider = more melodic & expressive
                  </>
                }
              />
              <StatCard
                title="Loudness"
                value={active.intensity.mean_db}
                unit="dB"
                zones={LOUD_ZONES}
                lo={45}
                hi={78}
                metricKey="loudness"
                onExpand={openModal}
                sub={
                  <Note id="note.loudness">
                    louder = more present & confident 📣
                  </Note>
                }
              />
              <StatCard
                title="Pitch variability"
                value={active.pitch.sd_hz}
                unit="Hz"
                zones={SD_ZONES}
                lo={0}
                hi={60}
                metricKey="sd"
                onExpand={openModal}
                sub="how much your melody moves · ~20–40 Hz is lively, natural speech"
              />
              <StatCard
                title="Clarity (HNR)"
                value={active.voice_quality.hnr_db}
                unit="dB"
                zones={HNR_ZONES}
                lo={0}
                hi={30}
                metricKey="hnr"
                onExpand={openModal}
                sub="higher = clearer, lower = breathier · runs lower on full passages than a held vowel"
              />
              <StatCard
                title="Steadiness (jitter)"
                value={active.voice_quality.jitter_pct}
                unit="%"
                zones={JITTER_ZONES}
                lo={0}
                hi={3}
                metricKey="jitter"
                onExpand={openModal}
                sub={
                  <>
                    lower = steadier · shimmer{" "}
                    {fmt(active.voice_quality.shimmer_pct)}% (under ~3.8% is
                    steady)
                  </>
                }
              />
              <StatCard
                title="Weight"
                value={active.weight?.h1a3c_db ?? null}
                unit="dB"
                zones={WEIGHT_ZONES}
                lo={0}
                hi={20}
                metricKey="weight"
                onExpand={openModal}
                sub={
                  <Note id="note.weight">
                    source spectral tilt (corrected H1*–A3*) — the <i>thickness</i>{" "}
                    of the voice itself (separate from pitch & resonance) · lighter
                    leans feminine. <b>Heads up:</b> weight is hard to pin to a
                    gender across people (lots of overlap), so it's most useful as{" "}
                    <b>your own change over time</b>, not a vs-others verdict.
                  </Note>
                }
              />
            </div>
          </section>

          <Region id="region.afterLatest" />

          {/* ✨ Resonance */}
          <section>
            <h2 className="section-title">
              <SparkleIcon /> Resonance{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · the "size" your voice sounds, separate from pitch
              </span>
            </h2>
            <ResonanceCard r={active} onExpand={openModal} />
          </section>

          <Region id="region.afterResonance" />

          {/* 🎚️ Register & phrasing */}
          <section>
            <h2 className="section-title">
              <ContourIcon /> Register &amp; phrasing{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · where your voice holds vs. falls out of register
              </span>
            </h2>
            <RegisterSection />
          </section>

          <Region id="region.afterRegister" />

          {/* 🔍 Insights for this take */}
          <section>
            <h2 className="section-title">
              <InsightIcon /> Insights for this take{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · custom analysis of what to work on next
              </span>
            </h2>
            <Region
              id="region.insights"
              empty={
                <div className="insight-placeholder">
                  ✍️ no custom insight written for take #{active.id} yet.
                  <br />
                  ask Claude to "analyze this recording" — it'll design one right
                  here.
                </div>
              }
            />
          </section>

          <Region id="region.bottom" />
        </AnnotationsProvider>
      )}

      {/* 📈 Trends over time (across all recordings) */}
      <section>
        <h2 className="section-title">
          <TrendsIcon /> Trends over time
        </h2>
        <div className="chart-grid">
          {R.length < 2 && (
            <p className="cap" style={{ gridColumn: "1/-1", margin: "0 0 4px" }}>
              add another recording to watch the lines grow 🌱
            </p>
          )}
          <ChartCard
            h="Pitch (avg)"
            cap="pink band = feminine zone (165 Hz+)"
            color="#e07ab0"
            data={mk((r) => r.pitch.mean_hz)}
            band={[165, 260]}
            bandColor="#ffb6d5"
          />
          <ChartCard
            h="In-register melody"
            cap="true expressiveness, crashes removed (st)"
            color="#9b7ad0"
            data={mk((r) => r.register?.in_register_semitones_sd ?? null)}
            bands={MELODY_ZONES}
          />
          <ChartCard
            h="Phrase endings landed"
            cap="% of phrases that stayed in register"
            color="#5fb89a"
            data={mk((r) => r.register?.phrases_landed_pct ?? null)}
            band={[80, 100]}
            bandColor="#b8ecd8"
          />
          <ChartCard
            h="Resonance (F2)"
            cap="brightness / vocal-tract size cue"
            color="#d99a4e"
            data={mk((r) => r.formants.f2_hz)}
            band={[1850, 2400]}
            bandColor="#c9b6ff"
          />
          <ChartCard
            h="Weight"
            cap="spectral tilt · lower = lighter / more feminine"
            color="#cf7fb0"
            data={mk((r) => r.weight?.h1a3c_db ?? null)}
            bands={WEIGHT_ZONES}
          />
        </div>
      </section>

      {/* 📖 All recordings */}
      <section>
        <h2 className="section-title">
          <CardsIcon /> All recordings
        </h2>
        <div className="rec-grid">
          {R.length === 0 ? (
            <div className="empty">
              no recordings yet 🌸
              <br />
              run the analyzer to plant your first one!
            </div>
          ) : (
            [...R].reverse().map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{ cursor: "pointer" }}
                title="click to view this take above"
              >
                <RecordingCard r={r} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* 💡 Cheat sheet */}
      <section>
        <h2 className="section-title">
          <BulbIcon /> What do these mean?
        </h2>
        <CheatSheet />
      </section>

      <footer>
        made with 🩷 &middot; numbers are a compass, not a judge &middot; your ears
        matter most
      </footer>

      {modal && (
        <MetricModal
          metric={METRICS[modal.key]}
          recordings={R}
          references={references}
          activeId={active?.id ?? null}
          origin={modal.rect}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

interface ChartCardProps {
  h: string;
  cap: string;
  color: string;
  data: Point[];
  band?: [number, number];
  bandColor?: string;
  bands?: ChartBand[];
}

function ChartCard({ h, cap, color, data, band, bandColor, bands }: ChartCardProps) {
  return (
    <div className="chart-card">
      <h3>{h}</h3>
      <p className="cap">{cap}</p>
      <LineChart
        points={data}
        color={color}
        band={band}
        bandColor={bandColor}
        bands={bands}
      />
    </div>
  );
}
