from datetime import datetime
import os
import subprocess
import shutil
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    filename: str
    label: str
    note: str = ""
    register_floor: int = 130

import time
from fastapi import FastAPI, HTTPException, UploadFile, File, Form


import json

@app.delete("/api/recordings/{filename}")
async def delete_recording(filename: str):
    base_dir = Path(__file__).resolve().parent
    shared_dir = base_dir / "shared"
    recordings_dir = base_dir / "dashboard-react" / "public"
    root_recordings_path = base_dir / "recordings.json"
    public_recordings_path = recordings_dir / "recordings.json"
    analysis_dir = recordings_dir / "analysis"

    file_path = shared_dir / filename
    real_path = file_path.resolve()
    shared_root = shared_dir.resolve()

    if shared_root != real_path and shared_root not in real_path.parents:
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad.")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Datei {filename} wurde nicht gefunden.")

    if not file_path.is_file():
        raise HTTPException(status_code=400, detail="Der angegebene Pfad ist keine Datei.")

    try:
        file_path.unlink()
        print(f"Audiodatei erfolgreich gelöscht: {filename}", flush=True)

        json_updated = False
        removed_details: list[str] = []

        for json_path in [root_recordings_path, public_recordings_path]:
            if not json_path.exists():
                continue

            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    recordings = json.load(f)

                initial_count = len(recordings)
                removed = [rec for rec in recordings if rec.get("source_file", "").endswith(filename)]
                recordings = [rec for rec in recordings if not rec.get("source_file", "").endswith(filename)]

                if len(recordings) < initial_count:
                    json_updated = True
                    removed_details.extend(str(rec.get("detail", "")) for rec in removed if rec.get("detail"))
                    with open(json_path, "w", encoding="utf-8") as f:
                        json.dump(recordings, f, indent=2, ensure_ascii=False)
                    print(f"Eintrag für {filename} aus {json_path.name} entfernt.", flush=True)

            except Exception as json_err:
                print(f"Warnung: Fehler beim Aktualisieren von {json_path}: {str(json_err)}", flush=True)

        for detail in removed_details:
            detail_path = Path(detail)
            for candidate in [recordings_dir / detail_path, analysis_dir / detail_path.name]:
                if candidate.exists():
                    candidate.unlink()
                    break

        return {
            "status": "success",
            "message": f"Datei {filename} gelöscht.",
            "json_updated": json_updated,
        }

    except Exception as e:
        print(f"Fehler beim Löschen von {filename}: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=f"Fehler beim Löschen der Datei: {str(e)}")

@app.post("/api/upload-recording")
async def upload_recording(file: UploadFile = File(...), filename: str = Form(None)):
    shared_dir = "/app/shared"
    timestamp = int(time.time())

    formatted_time = datetime.now().astimezone().strftime("%H-%M-%S_%d-%m-%Y")
    
    # TemporÃ¤rer Pfad fÃ¼r die Rohdaten des Browsers
    temp_raw_path = f"/tmp/raw_mic_{timestamp}.tmp"

    if filename:
        # Entferne eventuell mitgesendete Dateiendungen des Nutzers fÃ¼r ein sauberes .mp3
        base_name = os.path.splitext(filename)[0]
        # Bereinige den Namen von unerlaubten Pfad- oder Sonderzeichen
        base_name = "".join(c for c in base_name if c.isalnum() or c in ("-", "_")).strip()
    else:
        base_name = "mic_recording"

    # Falls der bereinigte Name leer sein sollte, Fallback nutzen
    if not base_name:
        base_name = "mic_recording"

    # Der finale Zielpfad als MP3 im Windows-Ordner
    final_mp3_name = f"{base_name}_{formatted_time}.mp3"
    final_mp3_path = os.path.join(shared_dir, final_mp3_name)
    
    try:
        # 1. Empfangene Browser-Daten temporÃ¤r im Container zwischenspeichern
        with open(temp_raw_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Mit dem installierten FFmpeg blitzschnell in echtes MP3 konvertieren
        # -ac 1 (Mono), -ar 44100 (CD-QualitÃ¤t), -b:a 128k (gute Kompression)
        ffmpeg_cmd = [
            "ffmpeg", "-y", 
            "-i", temp_raw_path, 
            "-ac", "1", 
            "-ar", "44100", 
            "-b:a", "128k", 
            final_mp3_path
        ]
        
        subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
        print(f"FFmpeg successfully converted mic output to: {final_mp3_name}", flush=True)
        
        return {"status": "success", "filename": final_mp3_name}
        
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg MP3 Conversion Error: {e.stderr}", flush=True)
        raise HTTPException(status_code=500, detail="FFmpeg konnte die Datei nicht in MP3 konvertieren.")
    except Exception as e:
        print(f"Upload error: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=f"Fehler beim Schreiben: {str(e)}")
    finally:
        await file.close()
        # TemporÃ¤re Datei im Container nach der Konvertierung wieder aufrÃ¤umen
        if os.path.exists(temp_raw_path):
            os.remove(temp_raw_path)


@app.get("/api/files")
async def list_shared_files():
    shared_dir = "/app/shared"
    print(f"Scanning directory: {shared_dir}") # Debug-Ausgabe im Docker-Log
    
    if not os.path.exists(shared_dir):
        print("Directory does not exist!")
        return []
    
    # Bekannte Audioformate
    valid_extensions = (".mp3", ".wav", ".m4a", ".ogg")
    
    try:
        files = []
        for f in os.listdir(shared_dir):
            # Ignoriere versteckte Windows-Systemdateien (z.B. desktop.ini)
            if f.startswith('.') or f.lower() == 'desktop.ini':
                continue
                
            full_path = os.path.join(shared_dir, f)
            try:
                if os.path.isfile(full_path) and f.lower().endswith(valid_extensions):
                    files.append(f)
            except Exception as path_err:
                print(f"Skipping unreadable file {f}: {path_err}")
                continue
                
        print(f"Found files: {files}") # Debug-Ausgabe
        return sorted(files)
    except Exception as e:
        print(f"Global directory scan error: {str(e)}")
        # Statt abzustÃ¼rzen, geben wir eine leere Liste und den Fehler zurÃ¼ck
        return []

@app.post("/api/analyze")
async def trigger_analysis(data: AnalyzeRequest):
    file_path = f"/app/shared/{data.filename}"
    
    # Sicherheitscheck: Verhindert Path Traversal Attacken (z.B. filename="../etc/passwd")
    if not os.path.abspath(file_path).startswith("/app/shared/"):
        raise HTTPException(status_code=400, detail="UngÃ¼ltiger Dateipfad")
        
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Datei {data.filename} wurde im shared-Ordner nicht gefunden")

    cmd = [
        "/opt/analyser-venv/bin/python", 
        "/app/analyze.py", 
        file_path, 
        "--label", data.label, 
        "--note", data.note, 
        "--register-floor", str(data.register_floor)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return {"status": "success", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Skript-Fehler: {e.stderr}")

