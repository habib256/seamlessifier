# PageDroit (Android)

Mini scanner de documents pour Android, cousin du Ripper web :

1. Prendre une photo (appareil du système) ou en choisir une dans la galerie  
2. Placer les 4 coins (HG → HD → BD → BG)  
3. Redresser la page (homographie, même math que `js/util.js`) et ajuster la netteté  
4. Enregistrer en **PNG** (Photos/PageDroit) ou **PDF** (Documents/PageDroit)  
5. Envoyer par e-mail via le partage Android (Gmail, etc.)

Aucune bibliothèque OpenCV : l’APK reste petit.

## Compiler

Prérequis : [Android SDK](https://developer.android.com/studio) (platform 35).

```bash
cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:assembleDebug
```

L’APK se trouve dans `app/build/outputs/apk/debug/app-debug.apk`.  
Installe-le avec `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

Ouvre le dossier `android/` dans Android Studio si tu préfères.

## Usage

Au premier lancement, « Prendre une photo » ouvre l’appareil photo du téléphone.  
Recadre les poignées sur la page, puis **Redresser**. Sur l’écran suivant, le curseur de netteté, les boutons PNG/PDF, et **Envoyer par e-mail** (case PDF cochée par défaut).
