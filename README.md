# 🌍 FreshAddy — 3D Spatial Copilot & Multi-Surface Discovery Engine

> **Meta AI Developer Hackathon Submission**  
> An action-first spatial copilot bridging Meta AI model inference with real-time 3D geospatial telemetry, multi-surface viewport coordination, and instant voice interaction.

---

## ⚡ Overview
**FreshAddy** transforms flat, text-bound conversational AI into an intuitive, telepathic spatial controller. Instead of waiting for lengthy text responses, FreshAddy coordinates action-first tool calling to maneuver a real-time 3D globe, render dynamic orbital flight arcs, and coordinate live events and emergency alerts across **Phone, Tablet, and TV** surfaces.

---

## 🚀 Key Features

### 1. Hands-Free Spatial Telemetry (Meta Muse Copilot)
* **Action-First Execution:** Direct tool calling (`fly_to`, `toggle_radar`, `toggle_alerts`, `load_persona_schedule`) dispatches camera maneuvers with zero latency.
* **Low-Latency Voice Synthesis:** Integrated local Kokoro voice pipeline (`af_bella`) producing conversational responses in under 100ms.
* **Barge-In Architecture:** Real-time request cancellation using `AbortController` allows uninterrupted turn-taking.

### 2. Multi-Persona 3D Itinerary Visualization
* **Dynamic Orbital Arcs:** Automatically parses travel schedules and renders high-altitude parabolic flight trajectories (peaking at 600km) using Cesium polyline glow materials.
* **Ground-Truth Event Mapping:** Category-coded pins for property walkthroughs, conventions, nightlife, and business meetings with depth-test preservation over photorealistic 3D terrain.

### 3. Multi-Surface Viewport & Responsive Layouts
* **Multi-Device Target Engine:** Live layout switching optimized for Phone (Tall/Bottom sheet), Tablet (Wide/Split-view), and TV (God's Eye cinematic mode).
* **Gesture-Driven Activity Menus:** Collapsible deep-space activity matrices with verified B2B landmark telemetry.
* **Multi-Modal Discovery:** Integrated festival video streams, real-time weather radar overlays, and GDACS/JTWC emergency alert feeds.

---

## 🛠️ Architecture & Tech Stack

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Framer Motion
* **3D Geospatial Engines:** CesiumJS (Google Photorealistic 3D Tiles), MapLibre GL, Three.js
* **AI & Language Models:** Meta AI Models (`muse-chat` API proxy), Function Tool Calling
* **Voice & Audio:** Kokoro ONNX TTS (`af_bella`), Web Speech API, Custom Mono 16-Bit PCM Encoder
* **Deployment:** Netlify Functions, Cloudflare Tunnel

---

## 📦 Getting Started

### Prerequisites
* Node.js 20+
* Python 3.10+ (for local Kokoro runtime, optional)

### Installation
```bash
# Clone the repository
git clone https://github.com/ciscojrai/AddyFresh.git
cd AddyFresh

# Install dependencies
npm install

# Run development server
npm run dev
```

### Environment Setup
Create a `.env.local` file with your credentials:
```env
MODEL_API_KEY=your_meta_model_key
VITE_CESIUM_ION_TOKEN=your_cesium_token
VITE_VOICE_BRIDGE_URL=http://127.0.0.1:8788
```

---

## 📄 License
MIT License. Built for the Meta AI Developer Hackathon.
