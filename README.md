<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>


<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/AryaPatel2110/catsense">
    <img src="CAT-logo.png" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">CatSense</h3>

  <p align="center">
    AI-Powered Multimodal Equipment Inspection Assistant

  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

🚜 **CatSense — AI-Powered Multimodal Equipment Inspection Assistant**

A real-time, multimodal AI inspection co-pilot for Caterpillar heavy equipment, combining vision, audio, and manual-grounded reasoning to produce structured safety reports in seconds.

### 🧠 Inspiration

Heavy equipment inspections on a job site are the last line of defense before an operator puts a 20-ton machine into service. A missed crack on a hydraulic cylinder, an overlooked fluid leak, or a faulty warning device can result in catastrophic equipment failure — or worse, human injury.

Caterpillar's pre-shift inspection process is rigorous: dozens of checklist items spanning ground-level walk-arounds, engine compartment checks, and cab control verification. But today, that process is entirely manual. Inspectors fill out paper forms, rely on memory and experience, and have no AI assistance to correlate what they see with what the manual says to look for.

We built CatSense to change that. The idea: give every field inspector a multimodal AI co-pilot that knows the equipment manual, understands what "wear on a bucket tooth" looks like in a photograph, can hear context in an audio note, and produces a structured, auditable safety report — automatically.

### ❗ The Problem

Manual equipment inspection suffers from three systemic failures:

**Inconsistency.** An experienced inspector and a new hire look at the same hydraulic hose and report completely different severity levels. There is no AI baseline — only training and gut feel.

**Scale.** A single fleet manager overseeing dozens of machines across multiple sites cannot personally validate every inspection report. Critical findings get buried in paper or missed entirely.

**No contextual grounding.** An inspector sees a fluid stain. Without the manual in hand, they don't know if that stain is expected seepage, a "monitor" condition, or an immediate shutdown criterion. CatSense closes that gap in real time.

### 💡 Our Solution

CatSense is a full-stack multimodal inspection platform. An inspector selects a registered machine, walks through a structured checklist organized by inspection zone (Ground, Engine, Cab), and for each checklist item they can:
- Photograph the component directly from their phone camera
- Record a voice note describing what they observe
- Type a text remark for detailed observations

On submission, the backend pipeline retrieves relevant excerpts from the equipment's service manual using vector search, constructs a grounded inspection prompt, and sends the image(s) and audio alongside that context to Google Gemini 2.5 Flash for multimodal reasoning. The model returns a validated, structured JSON report per checklist item — complete with a status classification (`ok`, `needs_attention`, `critical`), confidence score, per-finding severity ratings (`low`, `medium`, `high`), evidence citations, and recommended actions.

The full inspection report, including all check-level analysis, is persisted to Actian VectorAI for historical trending and fleet-level reporting.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Built With

* [![React][React.js]][React-url]
* [![TypeScript][TypeScript]][TypeScript-url]
* [![Vite][Vite]][Vite-url]
* [![Python][Python]][Python-url]
* [![FastAPI][FastAPI]][FastAPI-url]
* [![Cloudflare][Cloudflare]][Cloudflare-url]
* [![Google Gemini][Gemini]][Gemini-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- GETTING STARTED -->
## Getting Started

▶️ **How to Run Locally**

To get a local copy up and running follow these steps.

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+
- uv (Python package manager)
- Cloudflare account (for R2 and Worker deployment)
- Google Gemini API key
- Actian VectorAI instance (or compatible PostgreSQL + pgvector)
- Wrangler CLI:
  ```sh
  npm install -g wrangler
  ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Installation

#### 1. Clone and Install

```sh
git clone <repo-url>
cd catsense-main
pnpm install
```

#### 2. Set Up the RAG Python Environment (Required)

```sh
cd packages/rag
python3 -m venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

If not using uv, you may alternatively run:

```sh
pip install -r requirements.txt
```

#### 3. Configure the RAG Service

```sh
cd packages/rag
cp .env.example .env
# Edit .env:
# ACTIAN_DSN=postgresql://user:pass@host:port/dbname
# GEMINI_API_KEY=your-gemini-api-key
# EMBEDDING_MODEL=text-embedding-004
# ACTIAN_QUERY_API_KEY=your-rag-api-key  (optional, enables auth)
```

Start the RAG service:

```sh
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

#### 4. Configure the Cloudflare Worker

```sh
cd apps/worker
cp ../../.env.example .env
wrangler secret put GEMINI_API_KEY
wrangler secret put ACTIAN_API_KEY
```

Run the worker locally:

```sh
pnpm --filter worker dev
```

#### 5. Run the Frontend

```sh
cd apps/web
pnpm dev:web
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

**Run Each Service in Separate Terminals**


**Terminal 1: RAG**

```sh
cd packages/rag
source .venv/bin/activate
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2: Backend (Worker)**

```sh
pnpm --filter worker dev
```

**Terminal 3: Frontend**

```sh
pnpm dev:web
```





<!-- LICENSE -->
## License

Distributed under the project_license. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTACT -->
## Contact

👥 **Team Name - Adstra**

Contributor -

<a href="https://www.linkedin.com/in/yachi-darji/">Yachi Darji</a>
<a href="https://www.linkedin.com/in/aryapatel21//">Arya Patel</a>


Built for the **Caterpillar x HackIllinois UIUC Hackathon**.




---

CatSense — From the ground, to the engine bay, to the cab. Every check. Every machine. Every shift.

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/yachi2605/catsense.svg?style=for-the-badge
[contributors-url]: https://github.com/yachi2605/catsense/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/yachi2605/catsense.svg?style=for-the-badge
[forks-url]: https://github.com/yachi2605/catsense/network/members
[stars-shield]: https://img.shields.io/github/stars/yachi2605/catsense.svg?style=for-the-badge
[stars-url]: https://github.com/yachi2605/catsense/stargazers
[issues-shield]: https://img.shields.io/github/issues/yachi2605/catsense.svg?style=for-the-badge
[issues-url]: https://github.com/yachi2605/catsense/issues
[license-shield]: https://img.shields.io/github/license/yachi2605/catsense.svg?style=for-the-badge
[license-url]: https://github.com/yachi2605/catsense/blob/master/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/linkedin_username
[product-screenshot]: images/screenshot.png
[React.js]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[TypeScript]: https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Python]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[Python-url]: https://www.python.org/
[FastAPI]: https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi
[FastAPI-url]: https://fastapi.tiangolo.com/
[Cloudflare]: https://img.shields.io/badge/Cloudflare-F38020?style=for-the-badge&logo=Cloudflare&logoColor=white
[Cloudflare-url]: https://workers.cloudflare.com/
[Gemini]: https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white
[Gemini-url]: https://ai.google.dev/
