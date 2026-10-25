# 🗺️ DevDesk — Freelance Lead Map

A lightweight, client-side CRM built for freelance developers and designers. Find local businesses on a map, track your outreach progress, and manage your entire sales pipeline without needing a complex database or backend.

![DevDesk Preview](https://img.shields.io/badge/Status-Active-success) ![Tech](https://img.shields.io/badge/Tech-HTML%20%7C%20CSS%20%7C%20JS-blue) ![License](https://img.shields.io/badge/License-MIT-purple)

## ✨ Features

- **🔎 Discover Local Businesses**: Automatically pull real businesses (cafes, dentists, agencies, etc.) within a 900m radius using the OpenStreetMap Overpass API.
- **📍 Interactive Map**: Visualise your leads with color-coded map pins based on their pipeline status.
- **📊 Pipeline Tracking**: Manage leads through stages: *New Lead, Contacted, Meeting Set, Proposal Sent, Client Won, or Lost*.
- **📈 Auto-Progress**: Moving a lead to a new stage automatically updates their progress bar (e.g., "Client Won" sets progress to 100%).
- **✍️ Pitch Generator**: One-click "Copy Pitch" button generates a pre-written, personalized outreach email for the selected business.
- **💾 Local Persistence**: All your data is automatically saved in your browser's `localStorage`. No login required.
- **📁 Import/Export**: Backup your leads to a JSON file or import them to a new device.
- **📱 Fully Responsive**: Beautiful dark-mode UI that adapts perfectly to desktop, tablet, and mobile screens.

## 🚀 Getting Started

Since this is a pure Vanilla JavaScript project, you don't need to install any dependencies (like `npm install`).

### Prerequisites
You need a local web server to run this project. If you just double-click `index.html`, the browser might block the "Discover Nearby" feature due to CORS (Cross-Origin Resource Sharing) policies.

**Recommended way to run:**
1. Open the project folder in **Visual Studio Code**.
2. Install the **Live Server** extension.
3. Click "Go Live" at the bottom right of VS Code.

*(Alternatively, you can use Python: `python -m http.server` in the terminal)*

## 📖 How to Use

1. **Locate Yourself**: Click **📍 My location** and allow the browser to access your GPS.
2. **Discover**: Click **🔎 Discover nearby** to fetch businesses around you. They will appear in the sidebar and on the map.
3. **Manage Leads**: 
   - Click on a business in the list or a pin on the map to open its details.
   - Change its status using the dropdown to track your progress.
4. **Reach Out**: Click the pin on the map, then click **Copy pitch**. Paste the generated message into your email or WhatsApp.
5. **Add Manually**: If a business isn't on the map, click **➕ Add business** (or click anywhere on the map while in "Add" mode) to place a custom pin.

## 🛠️ Customization

### Changing your Pitch Message
Open `script.js` and scroll down to the `pitchText(l)` function. You can edit the template to include your real name, phone number, portfolio link, and specific services you offer.

```javascript
// Look for this in script.js
return `Hi ${l.name} team,
I'm a freelance developer working with local ${cat}s in the area...
[Your name]
[Your phone] · [Your email] · [Your portfolio link]`;