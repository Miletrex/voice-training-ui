import multiprocessing
import subprocess
import sys
import os

def start_api():
    print("🚀 [Backend] Starte FastAPI auf Port 8000...", flush=True)
    # Startet Uvicorn direkt über den Python-Interpreter des venv
    cmd = ["/opt/analyser-venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
    subprocess.run(cmd)

def start_frontend():
    print("🌐 [Frontend] Starte Vite Server auf Port 5173...", flush=True)
    # Startet das React-Frontend im Unterordner
    cmd = ["npm", "run", "dev", "--prefix", "dashboard-react", "--", "--host", "0.0.0.0"]
    subprocess.run(cmd)

if __name__ == "__main__":
    # Zwei getrennte Prozesse für Backend und Frontend definieren
    api_process = multiprocessing.Process(target=start_api)
    frontend_process = multiprocessing.Process(target=start_frontend)

    # Prozesse starten
    api_process.start()
    frontend_process.start()

    # Hält das Hauptskript aktiv und lauscht auf Abstürze
    api_process.join()
    frontend_process.join()
