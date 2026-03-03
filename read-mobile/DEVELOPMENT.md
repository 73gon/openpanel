# OpenPanel Mobile (React Native)

Cross-platform mobile app for OpenPanel — replaces the previous iOS-only Swift app.

## Features

- **Server connection**: Connect to any self-hosted OpenPanel instance
- **Profile picker**: Select profiles with PIN support, guest mode
- **Library browser**: Searchable grid of all series, pull-to-refresh
- **Series detail**: Book listing with progress bars, "Continue Reading" button, sort toggle
- **Manga/comic reader**: Continuous scroll + single-page modes, LTR/RTL, pinch-to-zoom, double-tap zoom, page slider
- **Progress sync**: Auto-saves reading progress, restores on book open
- **Chapter navigation**: Previous/next book from within the reader
- **Admin actions**: Unlock admin, trigger library scan
- **Dark theme**: Consistent dark UI matching the web app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native CLI (no Expo) |
| Language | TypeScript |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| State | Zustand |
| Storage | AsyncStorage |
| Images | react-native-fast-image |
| Gestures | react-native-gesture-handler + reanimated |
| Icons | react-native-vector-icons (Ionicons) |

## Prerequisites

- **Node.js** ≥ 18
- **JDK** 17 (for Android)
- **Android Studio** with:
  - Android SDK 34+
  - Android SDK Build-Tools
  - Android Emulator or physical device (USB debugging enabled)
- **Xcode** 15+ (for iOS, macOS only)
- **CocoaPods** (for iOS, macOS only): `sudo gem install cocoapods`

## Setup

### 1. Initialize native projects

The `android/` and `ios/` directories are not checked into git. Generate them once:

```bash
cd read-mobile

# Install JS dependencies
npm install

# Generate native projects (React Native 0.79+)
npx @react-native-community/cli init ReadMobile --directory ./temp-init --skip-install
# Copy native dirs from the generated project:
cp -r temp-init/android ./android
cp -r temp-init/ios ./ios
rm -rf temp-init

# For iOS only — install CocoaPods
cd ios && pod install && cd ..
```

### 2. Configure Android

**Set ANDROID_HOME** (add to your shell profile):

```bash
# Linux/macOS
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools

# Windows (PowerShell)
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

**Create a local.properties** in `android/`:
```
sdk.dir=/path/to/Android/Sdk
```

### 3. Run the app

```bash
# Start Metro bundler
npm start

# In a new terminal:
npm run android    # Android
npm run ios        # iOS (macOS only)
```

### 4. Build for release

#### Android APK

```bash
cd android
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

#### iOS IPA

Open `ios/ReadMobile.xcworkspace` in Xcode, select your signing team, and archive for distribution.

## Project Structure

```
read-mobile/
├── App.tsx                         # Entry point, state restoration
├── index.js                        # RN app registration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── babel.config.js                 # Babel with reanimated + module-resolver
├── metro.config.js                 # Metro bundler config
├── app.json                        # App metadata
├── src/
│   ├── api/
│   │   └── client.ts               # All API calls (mirrors Swift APIClient)
│   ├── models/
│   │   └── types.ts                # TypeScript types for API models
│   ├── store/
│   │   └── index.ts                # Zustand store (serverUrl, profile, admin)
│   ├── navigation/
│   │   └── index.tsx               # React Navigation: stack + tabs
│   ├── screens/
│   │   ├── ServerConnectScreen.tsx  # Server URL input
│   │   ├── ProfilePickerScreen.tsx  # Profile grid + guest + PIN entry
│   │   ├── LibraryScreen.tsx        # Searchable series grid
│   │   ├── SeriesDetailScreen.tsx   # Book list + continue reading
│   │   ├── ReaderScreen.tsx         # Full reader (scroll/single, zoom, overlay)
│   │   └── SettingsScreen.tsx       # Profile switch, admin, disconnect
│   ├── components/
│   │   ├── CachedImage.tsx          # FastImage wrapper with blur bg + loader
│   │   ├── SeriesCard.tsx           # Series grid card
│   │   ├── BookCard.tsx             # Book card with progress bar
│   │   └── ProfileCard.tsx          # Profile avatar + guest card
│   └── utils/
│       └── storage.ts              # AsyncStorage helpers
├── android/                        # (generated, not in git)
└── ios/                            # (generated, not in git)
```

## Feature Parity with Swift App

| Feature | Swift | React Native |
|---------|-------|-------------|
| Server connect + health check | ✅ | ✅ |
| Profile picker with PIN | ✅ | ✅ |
| Guest mode (respects server toggle) | ✅ | ✅ |
| Library grid (adaptive columns) | ✅ | ✅ |
| Client-side search | ✅ | ✅ |
| Pull-to-refresh | ✅ | ✅ |
| Series detail with cover + metadata | ✅ | ✅ |
| Book progress bars | ✅ | ✅ |
| Continue Reading button | ✅ | ✅ |
| Sort ascending/descending | ✅ | ✅ |
| Continuous scroll reader | ✅ | ✅ |
| Single page reader | ✅ | ✅ |
| LTR / RTL direction | ✅ | ✅ |
| Pinch-to-zoom (1x–5x) | ✅ | ✅ |
| Double-tap zoom toggle | ✅ | ✅ |
| Reader overlay (tap center) | ✅ | ✅ |
| Page slider | ✅ | ✅ |
| Prev/next chapter nav | ✅ | ✅ |
| Progress auto-save | ✅ | ✅ |
| Admin unlock + scan | ✅ | ✅ |
| Image prefetching | ✅ | ✅ |
| Blurred cover backgrounds | ✅ | ✅ |
| Disconnect / switch profile | ✅ | ✅ |
| Persistent device ID | ✅ | ✅ |
| **Android support** | ❌ | ✅ |
| **Offline downloads** | ❌ | Planned |

## Notes

- The app uses the same REST API endpoints as the Swift app
- Auth headers: `Bearer {profileToken}` for profile-scoped requests, `Admin {adminToken}` for admin ops
- Device ID is auto-generated on first launch and persisted via AsyncStorage
- Image caching is handled by FastImage's built-in disk cache (SDWebImage on iOS, Glide on Android)
- `Alert.prompt()` is iOS-only — on Android, PIN entry falls back to a basic `Alert.alert()` with text input. Consider adding a custom modal for Android PIN entry if needed.
