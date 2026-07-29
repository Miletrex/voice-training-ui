import type { Recording } from "../types";
import { fmt } from "../zones";
import { TrashIcon } from "./icons";
import { WaveformPlayer } from "./WaveformPlayer";

export function RecordingCard({
  r,
  onDelete,
}: {
  r: Recording;
  onDelete?: (recording: Recording) => void;
}) {
  return (
    <div className="rec">
      <div className="top">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="num">{r.id}</span>
          <span className="label-txt">{r.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="date">
            {r.date} · {fmt(r.duration_s, "s")}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(r);
            }}
            title={`Delete ${r.label}`}
            aria-label={`Delete ${r.label}`}
            style={{
              background: "#fff6f9",
              border: "1px solid #f2c6d9",
              color: "#ff6b6b",
              cursor: "pointer",
              padding: "6px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            }}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="metrics">
        <div className="chip">
          <b>{fmt(r.pitch.mean_hz)}</b>
          <span>pitch Hz</span>
        </div>
        <div className="chip">
          <b>
            {fmt(r.pitch.min_hz)}–{fmt(r.pitch.max_hz)}
          </b>
          <span>range Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.formants.f2_hz)}</b>
          <span>F2 Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.intensity.mean_db)}</b>
          <span>loud dB</span>
        </div>
        <div className="chip">
          <b>{fmt(r.pitch.sd_hz)}</b>
          <span>variab Hz</span>
        </div>
        <div className="chip">
          <b>{fmt(r.voice_quality.hnr_db)}</b>
          <span>HNR dB</span>
        </div>
      </div>
      {r.note && <div className="note">📝 {r.note}</div>}
      {r.audio && (
        <WaveformPlayer
          src={r.audio}
          duration={r.duration_s}
          downloadName={`voice-take-${r.id}`}
        />
      )}
    </div>
  );
}
