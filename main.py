from datetime import datetime
import os
import subprocess
import shutil
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


@app.delete("/api/recordings/{filename}")
async def delete_recording(filename: str):
    shared_dir = "/app/shared"
    file_path = os.path.join(shared_dir, filename)
    
    # Sicherheitscheck: Verhindert Path Traversal Attacken (z.B. filename="../../etc/passwd")
    real_path = os.path.abspath(file_path)
    if not real_path.startswith(os.path.abspath(shared_dir)):
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad.")
        
    # Prüfen, ob die Datei existiert
    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail=f"Datei {filename} wurde nicht gefunden.")
        
    # Prüfen, ob es sich wirklich um eine Datei handelt (und kein Unterverzeichnis)
    if not os.path.isfile(real_path):
        raise HTTPException(status_code=400, detail="Der angegebene Pfad ist keine Datei.")

    try:
        os.remove(real_path)
        print(f"Erfolgreich gelöscht: {filename}", flush=True)
        return {"status": "success", "message": f"Datei {filename} wurde erfolgreich gelöscht."}
    except Exception as e:
        print(f"Fehler beim Löschen von {filename}: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=f"Fehler beim Löschen der Datei: {str(e)}")


@app.post("/api/upload-recording")
async def upload_recording(file: UploadFile = File(...), filename: str = Form(None)):
    shared_dir = "/app/shared"
    timestamp = int(time.time())

    formatted_time = datetime.now().strftime("%H-%M-%S_%d-%m-%Y")
    
    # Temporärer Pfad für die Rohdaten des Browsers
    temp_raw_path = f"/tmp/raw_mic_{timestamp}.tmp"

    if filename:
        # Entferne eventuell mitgesendete Dateiendungen des Nutzers für ein sauberes .mp3
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
        # 1. Empfangene Browser-Daten temporär im Container zwischenspeichern
        with open(temp_raw_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. Mit dem installierten FFmpeg blitzschnell in echtes MP3 konvertieren
        # -ac 1 (Mono), -ar 44100 (CD-Qualität), -b:a 128k (gute Kompression)
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
        # Temporäre Datei im Container nach der Konvertierung wieder aufräumen
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
        # Statt abzustürzen, geben wir eine leere Liste und den Fehler zurück
        return []

@app.post("/api/analyze")
async def trigger_analysis(data: AnalyzeRequest):
    file_path = f"/app/shared/{data.filename}"
    
    # Sicherheitscheck: Verhindert Path Traversal Attacken (z.B. filename="../etc/passwd")
    if not os.path.abspath(file_path).startswith("/app/shared/"):
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad")
        
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
