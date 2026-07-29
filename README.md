# Voice Garden

![HLdkXJnXwAAVpuS.jpg](HLdkXJnXwAAVpuS.jpg)

This is a fork of scratchyone's [Voice Garden](https://github.com/scratchyone/voice-training-ui). 

I loved scratchyone's idea and design. Yet I dislike the usage of Coding Agents at runtime so my original motivation was to remove the need to use those.

Furthermore I like to keep my applications in a secured sandbox, which is why I containerized the entire application.
In laymans terms I removed the need for you to directly install Claude, Python and Node.js to your own operating system. The application is run on a virtual linux distribution which also secures that any downloaded dependency only acts within the linux sandbox so your own operating system is safe and sound.

By now I am implementing new features as I see fit to improve the app for the community.

Feel free to propose new feature ideas or to create pull request!

## Usage

Install Docker first:
  - Windows: https://docs.docker.com/desktop/
  - Linux Distros: https://docs.docker.com/engine/install/

git clone https://github.com/Miletrex/voice-training-ui.git

docker build -t voice-trainer .

docker run -d -p 8080:5173 -p 8000:8000 -v <path-to-folder>/voice-training-ui/recordings:/app/shared --name voice-trainer voice-trainer

http://localhost:8080/ 

## License

All code and content I wrote and changed is licensed under the **GPLv3** License (see `LICENSE`).

### Changes to the original

- containerized the entire application for easy shipping and to establish a secured sandbox for the depedencies
  - your recordings and analysis are on a mounted storage, so you won't lose them by updating your application
- removed the need to run Claude or any other Coding Agent entirely
- established a python backend for file handling and analysis
- new Features
  - support for chosen name
  - deletion of recordings and respective analysis
  - auto-analysis after recording
- Bugfixes
  - masc pitch starts from 0 to prevent low pitches to not get a category


## Credits & third-party assets

- [Voice Garden](https://github.com/scratchyone/voice-training-ui) by scratchyone as a foundation for this project
- **Reference voices** — the preview clips in `dashboard-react/public/reference-audio/` and the measured values in `reference.json` are derived from the **VCTK Corpus** (CSTR, University of Edinburgh — Veaux, Yamagishi & MacDonald), licensed **CC BY 4.0**. The clips were trimmed and transcoded. These files remain under **CC BY 4.0**. <https://datashare.ed.ac.uk/handle/10283/3443> · <https://creativecommons.org/licenses/by/4.0/>
- **Praat** (Boersma & Weenink) and **parselmouth** (Jadoul, Thompson & de Boer), both **GPLv3**, power `analyze.py`.
- Other dependencies (React, Vite, wavesurfer.js, NumPy, …) retain their own respective licenses.
