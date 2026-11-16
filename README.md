# VoiceDiary 🎙️

A professional voice-to-text diary application built with Expo and React Native. Organize your thoughts, record voice notes, and let AI transcribe them for you.

## ✨ Key Features

*   **Smart Transcription:** Powered by **Groq (Whisper)** or **Google Gemini**.
*   **4-Tier Hierarchy:** Organize your notes like a pro with Year -> Month -> Day -> Entry nesting.
*   **Persistent View State:** The app remembers which folders (years/months/days) you collapsed.
*   **Quick Record:** 
    *   **Android Shortcut:** Long-press the app icon to start a 6-second quick note instantly.
    *   **Launch Choice:** Choose between "Quick Record" or "Open Diary" every time you start the app.
*   **Offline Support:** Record now, transcribe later when you have internet.
*   **Data Control:**
    *   **Manual Editing:** Edit transcribed text anytime.
    *   **Backup & Restore:** Export your notes to a JSON file and restore them on another device.
    *   **Storage Management:** Option to auto-delete audio files after transcription to save space.

---

## 🔑 How to get a Groq API Key (Recommended)

Groq provides extremely fast and high-quality transcription (Whisper large v3) for **free**.

1.  **Go to the Groq Cloud Console:** Visit [https://console.groq.com/](https://console.groq.com/)
2.  **Sign Up / Log In:** Create an account using your email or Google account.
3.  **Navigate to API Keys:** In the left-side menu, click on **"API Keys"**.
4.  **Create a New Key:** Click the **"Create API Key"** button.
5.  **Name your key:** Give it a name (e.g., "VoiceDiary App") and click "Done".
6.  **Copy the Key:** **IMPORTANT:** Copy the key immediately. You won't be able to see it again.
7.  **Enter in App:** Open VoiceDiary -> Go to **Settings** -> Select **Groq** -> Paste the key into the **API Key** field -> Tap **Save Settings**.
8.  **Test:** Click **"Test Connection"** to verify everything is working.

---

**Author:** Capt. Stoyev Igor
**Version:** 1.0.0
