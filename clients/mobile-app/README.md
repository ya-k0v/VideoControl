# VideoControl Mobile App

React Native mobile application for managing VideoControl system on iOS and Android.

## Features

- **Device Management**: View, add, and control devices
- **File Upload**: Upload media files from mobile device
- **Playlist Management**: Create and manage playlists
- **Real-time Control**: Control playback on devices
- **Push Notifications**: Get notified about device events
- **Offline Support**: Cache data for offline access

## Setup

### Prerequisites

- Node.js 18+
- React Native development environment
- iOS: Xcode 14+ (Mac only)
- Android: Android Studio with SDK 33+

### Installation

```bash
cd clients/mobile-app
npm install
```

### Development

```bash
# Start Metro bundler
npm start

# Run on iOS (Mac only)
npm run ios

# Run on Android
npm run android
```

### Configuration

Create `.env` file:

```
API_URL=http://your-server.com
```

## Project Structure

```
src/
├── api/              # API client and endpoints
├── components/       # Reusable components
├── contexts/         # React contexts (Auth, etc)
├── navigation/       # Navigation configuration
├── screens/          # Screen components
│   ├── LoginScreen.js
│   ├── DevicesScreen.js
│   ├── FilesScreen.js
│   ├── PlaylistsScreen.js
│   └── SettingsScreen.js
├── utils/            # Utility functions
└── constants/        # Constants and config
```

## Screens

### Login Screen
- Email/password authentication
- JWT token management
- Remember me functionality

### Devices Screen
- List all devices
- Device status indicators
- Quick actions (play, stop, restart)
- Add new devices

### Files Screen
- Browse device files
- Upload new files
- Delete files
- File preview

### Playlists Screen
- View all playlists
- Create new playlists
- Edit playlist items
- Schedule playlists

### Device Control Screen
- Play/pause/stop controls
- Volume control
- Current playback info
- Quick content selection

## API Integration

Uses Axios with interceptors for:
- Automatic token injection
- Error handling
- Request retry logic
- Offline queuing

## State Management

- React Context for global state
- AsyncStorage for persistence
- Socket.IO for real-time updates

## Building for Production

### iOS

```bash
# Build
cd ios && xcodebuild archive \
  -workspace VideoControl.xcworkspace \
  -scheme VideoControl \
  -archivePath VideoControl.xcarchive

# Upload to App Store Connect
xcodebuild -exportArchive \
  -archivePath VideoControl.xcarchive \
  -exportPath VideoControl.ipa \
  -exportOptionsPlist exportOptions.plist
```

### Android

```bash
# Generate release APK
cd android && ./gradlew assembleRelease

# Generate AAB for Play Store
./gradlew bundleRelease

# Output at:
# android/app/build/outputs/apk/release/app-release.apk
# android/app/build/outputs/bundle/release/app-release.aab
```

## Testing

```bash
# Run Jest tests
npm test

# Run E2E tests (Detox)
npm run test:e2e
```

## Deployment

### TestFlight (iOS)

1. Archive app in Xcode
2. Upload to App Store Connect
3. Add to TestFlight
4. Invite testers

### Google Play (Android)

1. Generate signed AAB
2. Upload to Play Console
3. Create internal/beta track
4. Invite testers

## Troubleshooting

### Metro bundler issues

```bash
# Clear cache
npm start -- --reset-cache

# Clean and rebuild
cd android && ./gradlew clean
cd ios && pod install
```

### iOS build errors

```bash
cd ios
pod deintegrate
pod install
```

### Android build errors

```bash
cd android
./gradlew clean
./gradlew assembleDebug --stacktrace
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

## License

MIT License - see main project README

