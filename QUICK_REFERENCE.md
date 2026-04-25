# Gesture Globe — Quick Reference Guide

## 🚀 Getting Started (30 seconds)

```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Open browser and allow camera access
open http://localhost:3000
```

**That's it!** Point your webcam at your face and start controlling the globe with your hands.

---

## 📋 npm Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (hot reload, HTTPS warnings OK) |
| `npm run build` | Production build (TypeScript check, Turbopack optimization) |
| `npm start` | Run production build (requires `npm run build` first) |
| `npm run lint` | Check code quality (ESLint) |

---

## 🎮 Hand Gestures Cheat Sheet

| Gesture | Action | Globe Response |
|---------|--------|----------------|
| **Palm Center** | Move hand left/right/up/down | Rotate globe |
| **Pinch** | Touch thumb tip to index tip | Zoom in (proximity controls speed) |
| **Release Pinch** | Spread thumb and index apart | Zoom out |
| **Two Hands Spread** | Move hands apart | Globe grows larger |
| **Two Hands Close** | Bring hands together | Globe shrinks |
| **Grab (Fist)** | Close hand into fist | Pause all rotation |
| **No Hands** | Move away from camera | Auto-rotate slowly |

---

## ⚙️ Tuning Sensitivity

**File:** `src/utils/gestureMapper.ts`

Change these constants (lines 3–13) to adjust how responsive the globe is:

```typescript
const ROTATION_SENSITIVITY_X = 2.3;      // ↕ Movement sensitivity
const ROTATION_SENSITIVITY_Y = 3.1;      // ↔ Movement sensitivity
const ROTATION_DEADZONE = 0.02;          // Ignore tiny movements
const PINCH_THRESHOLD = 0.065;           // How close to pinch
const ZOOM_IN_MULTIPLIER = 0.06;         // Zoom speed
const HAND_SPREAD_BASELINE = 0.28;       // Neutral hand distance
const SCALE_MULTIPLIER = 0.12;           // Size change speed
```

**Example:** To make rotation 2x faster:
```typescript
const ROTATION_SENSITIVITY_Y = 6.2;  // Was 3.1, now 6.2
```

Save → Hot reload → Test with your hands

---

## 🎨 Customizing Colors

**File:** `src/app/globals.css` (lines 7–15)

```css
:root {
  --neon-green: #39ff14;         /* Change tracking line color */
  --neon-blue: #00d4ff;          /* Change pinch indicator color */
  --bg-dark: #000000;            /* Change background color */
  --text-primary: #e0e0e0;       /* Change text color */
}
```

Save → Hard refresh (Cmd+Shift+R) → See new colors

---

## 📊 Project Structure at a Glance

```
gesture-globe/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout with font
│   │   ├── page.tsx          # Home page (entry point)
│   │   └── globals.css       # Cyberpunk theme
│   ├── components/           # React components
│   │   ├── TrackingView.tsx  # Webcam + canvas manager
│   │   └── GlobeScene.tsx    # Three.js 3D globe
│   ├── hooks/
│   │   └── useMediapipe.ts   # Hand + face tracking hook
│   ├── utils/
│   │   ├── canvasDrawing.ts  # Draw video + landmarks
│   │   └── gestureMapper.ts  # Gesture → transform mapping
│   └── types/
│       └── index.ts          # TypeScript interfaces
├── public/                   # Static assets
├── next.config.ts           # Next.js configuration
├── tsconfig.json            # TypeScript strict mode
├── package.json             # Dependencies + scripts
└── README.md               # Full documentation
```

---

## 🔍 Monitoring Performance

### Built-in FPS Counter
- **Top-right corner** shows real-time FPS
- 60 FPS = optimal (60 frames/second)
- 30 FPS = tracking canvas limited by MediaPipe input

### Chrome DevTools
1. Press `F12` to open DevTools
2. Click **Performance** tab
3. Click red record button, move hands, click to stop
4. Look at **FPS** graph (should be green/60 FPS)

### Common Performance Issues

| Issue | Fix |
|-------|-----|
| **FPS drops when hand detected** | This is normal (tracking costs CPU) |
| **Globe lags consistently** | Reduce geometry: `SphereGeometry(1, 32, 32)` |
| **Tracking is jittery** | Increase deadzone: `ROTATION_DEADZONE = 0.04` |
| **Slow first load** | Clear cache; models load from CDN |

---

## 🌐 Deployment

### Vercel (1 minute, Recommended)

```bash
npm i -g vercel
vercel login
vercel deploy
```

### Local Server

```bash
npm run build
npm start
# Server runs on http://localhost:3000
```

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 🐛 Quick Fixes

### **Camera not detected?**
```
1. Check browser permission (address bar → camera icon)
2. Try incognito mode (Cmd+Shift+N)
3. Check console: DevTools → Console tab
```

### **Tracking poor quality?**
```
1. Better lighting (move near window)
2. Closer to camera (1–2 feet)
3. Clean camera lens
```

### **Build fails?**
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install
npm run build
```

---

## 📱 Responsive Design

- **Desktop** (1920×1080+): ✅ Optimal experience
- **Laptop** (1366×768): ✅ Works fine
- **Tablet** (landscape): ✅ Supported (large screen = easier tracking)
- **Mobile** (portrait): ⚠️ Try landscape orientation

---

## 🔐 Security Checklist

- [ ] Camera feed processed **locally only** (no cloud transmission)
- [ ] No analytics or tracking enabled
- [ ] HTTPS required for production (HTTP OK for localhost)
- [ ] User grants explicit camera permission
- [ ] Models loaded from trusted CDNs (jsdelivr, unpkg)

---

## 📚 File Editing Quick Guide

### Change globe rotation speed
**File:** `src/components/GlobeScene.tsx` (line 8)
```typescript
const AUTO_ROTATE_SPEED = 0.003;  // Increase → faster rotation
```

### Change tracking line color
**File:** `src/utils/canvasDrawing.ts` (line 5)
```typescript
const NEON_GREEN = "#39FF14";  // Change hex code
```

### Change star count
**File:** `src/components/GlobeScene.tsx` (line 85)
```typescript
const starCount = 1800;  // Decrease for better performance
```

### Change hand detection sensitivity
**File:** `src/hooks/useMediapipe.ts` (line 56)
```typescript
minDetectionConfidence: 0.65,  // Lower → more sensitive
```

---

## 🎯 Feature Checklist

- [x] Real-time hand tracking (2 hands max)
- [x] Facial landmark detection (FaceMesh)
- [x] 3D Earth globe rendering
- [x] Gesture-driven rotation (X/Y axes)
- [x] Pinch-to-zoom interaction
- [x] Two-hand spread/pinch for scaling
- [x] Grab gesture to pause rotation
- [x] Auto-rotation when idle
- [x] Smooth motion with lerping
- [x] Cyberpunk UI aesthetic
- [x] Live FPS counter
- [x] Neon green tracking overlays
- [x] Pinch indicator visualization
- [x] Loading state with spinner
- [x] Error handling (camera denied)
- [x] Responsive canvas resize
- [x] Memory cleanup on unmount
- [x] TypeScript strict mode
- [x] ESLint compliance
- [x] Production-optimized build

---

## 💡 Pro Tips

1. **Best Results**: Sit with shoulders square to camera, good lighting
2. **Hand Distance**: Keep hands 12–24 inches from camera for best tracking
3. **Lighting**: Natural window light is ideal; avoid harsh shadows
4. **Performance**: Close other browser tabs for best FPS
5. **Tuning**: Start with default sensitivity, tweak gradually
6. **Debugging**: Open console (F12) to see gesture values
7. **Texture**: High-res NASA textures from CDN (loads dynamically)
8. **Mobile**: Use landscape orientation on phones/tablets
9. **Deployment**: HTTPS required for production (camera security)
10. **Extensions**: Framework supports adding voice, UI buttons, etc.

---

## 📞 When Something Goes Wrong

**MediaPipe not loading?**
- Check CDN: https://cdn.jsdelivr.net
- Try different browser
- Clear browser cache

**Build errors?**
- Check Node version: `node --version` (need 18+)
- Reinstall: `npm install`
- Clear: `rm -rf .next node_modules`

**Camera permission denied?**
- Settings → Privacy → Camera
- Or try incognito mode

**Low FPS?**
- Check GPU: DevTools → Performance → GPU
- Reduce sphere geometry resolution
- Close other tabs

---

## 🚀 Ready to Ship?

```bash
# Final checklist before deploying
npm run lint          # ✓ Check code quality
npm run build         # ✓ Production build
npm start             # ✓ Test locally
# Then deploy to Vercel or your server
```

**Enjoy your gesture-controlled globe!** 🌍✨

---

**For detailed documentation, see [README.md](README.md) and [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)**
