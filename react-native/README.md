# Monthly Budget Manager (React Native)

Single React Native codebase targeting:
- Android, iOS (React Native)
- Windows (react-native-windows)
- macOS (react-native-macos)

Structure:
- apps/mobile: RN app for Android/iOS
- apps/desktop: RN app for Windows/macOS
- packages/shared: shared types and pure logic (totals, categories, parse)
- packages/adapters: platform adapters for Open/Save/Export

Next steps:
1) Install toolchains (Node >= 18, Yarn or PNPM, Android/iOS SDKs, RNW/macOS requirements).
2) Install dependencies inside each app and package.
3) Implement platform adapters and UI wiring.

This scaffold does not affect the existing Python apps. You can keep both in the repo.