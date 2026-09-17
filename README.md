ARIA

Adaptive Responsive Intelligence Assistant

ARIA is a futuristic web-based AI assistant experiment focused on voice interaction, computer vision, hand tracking, and an interactive AI interface.

«Status: Early prototype — actively under development.»

✨ Features

- 🧠 AI conversation
- 🎙️ Voice input and text-to-speech
- 📷 Camera access
- 👁️ Computer vision / image analysis
- ✋ Hand tracking and gesture interaction
- 🔮 Interactive AI orb with multiple system states
- 🕐 Real-time system clock
- 📡 Connection status indicator
- 💬 Conversation transcript
- 📱 Mobile-oriented interface

🧩 System States

ARIA uses different interface states depending on what the assistant is doing:

- "IDLE" — waiting for interaction
- "LISTENING" — receiving voice input
- "THINKING" — processing a request
- "SPEAKING" — responding through voice
- "CAMERA" — camera mode is active
- "VISION_ANALYSIS" — analyzing visual input
- "ERROR" — an error occurred

🛠️ Technologies

- HTML
- CSS
- JavaScript
- Web APIs
- Web Speech API
- MediaDevices / "getUserMedia"
- MediaPipe
- AI provider integration
- Canvas

🚧 Roadmap

- [ ] Improve voice interaction
- [ ] Improve AI conversation
- [ ] Improve computer vision
- [ ] Expand hand gesture recognition
- [ ] Add pinch-based zoom interaction
- [ ] Modularize the application
- [ ] Add a secure backend API layer
- [ ] Improve mobile performance
- [ ] Improve permission and error handling
- [ ] Add more ARIA capabilities
- [ ] Experimental instrument mode

▶️ Running Locally

ARIA uses browser APIs such as the camera and microphone, so it should be run through a local HTTP server instead of opening the HTML file directly with "file://".

Start a local server:

python -m http.server 8000

Then open:

http://localhost:8000

Grant camera and microphone permissions when requested.

🔐 Environment Variables

If ARIA later requires API keys or other secrets, they should be stored in a local ".env" file and must not be committed to Git.

A ".env.example" file can be used as a safe template for required environment variables.

📁 Project Structure

The project is currently kept intentionally simple while ARIA is being prototyped.

ARIA/
├── index.html
├── README.md
├── .gitignore
└── .env.example

The structure may change as the project becomes more modular.

🧠 Development Philosophy

ARIA is being developed incrementally.

The goal is not to build every feature at once, but to establish a working core and expand it through small, testable improvements.

Git commits are used as development checkpoints so previous working versions can be restored when necessary.

📌 Project Status

ARIA is an experimental personal project.

The current implementation is a prototype and may contain incomplete features, browser compatibility limitations, or temporary implementations.

More capabilities will be added over time.

👤 Author

Dika

Built as a personal experiment in AI-assisted web development.
