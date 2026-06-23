# Качване в App Store — стъпка по стъпка

> ⚠️ **Важно:** Готовият за App Store файл (`.ipa`) НЕ може да се направи на ръка.
> Той се **компилира** от този проект през EAS Build (облака на Expo) или Xcode на Mac,
> подписва се с твоите Apple сертификати и се качва в App Store Connect.
> Този проект съдържа всичко нужно, за да стане това с няколко команди.

> ℹ️ **Преди да билдваш:** нативният (Expo) проект изостава от уеб версията —
> в него все още няма ~130-те продукта, английския език и раздела „Тегло".
> Препоръчвам първо да пренесем тези функции, за да съвпада с последната версия.

---

## 0. Какво ти трябва
- **Apple Developer Program** акаунт — 99 USD/год. (developer.apple.com)
- **Node.js 18+** и този проект
- **EAS CLI:** `npm install -g eas-cli`
- (По избор) Mac с Xcode — не е задължителен, EAS билдва в облака

## 1. Настрой проекта
1. Отвори `app.json` и смени `ios.bundleIdentifier` и `android.package`
   с твой уникален идентификатор, напр. `com.ivanpetrov.kaloriitracker`.
2. Смени `extra.eas.projectId` — попълва се автоматично на стъпка 2.

## 2. Вход и инициализация
```bash
npm install
eas login                 # с твоя Expo акаунт (безплатен)
eas init                  # създава projectId и го записва в app.json
```

## 3. Създай приложението в App Store Connect
1. Влез в https://appstoreconnect.apple.com → **Apps → +**.
2. Платформа iOS, име **Калории Тракер**, език по подразбиране Bulgarian,
   избери Bundle ID-то от стъпка 1 (първо го регистрирай в
   developer.apple.com → Certificates, IDs & Profiles → Identifiers, или EAS
   ще го създаде автоматично при submit).
3. Запомни **ASC App ID** (числото в URL-а) и **Apple Team ID** — сложи ги в `eas.json`.

## 4. Билд за iOS (в облака на EAS)
```bash
eas build --platform ios --profile production
```
- EAS ще те преведе през създаването на сертификати и provisioning (автоматично).
- Накрая получаваш `.ipa` в EAS — това е файлът за App Store.

## 5. Качи билда
Вариант А (най-лесно):
```bash
eas submit --platform ios --latest
```
(използва данните от `eas.json → submit.production.ios`).

Вариант Б: изтегли `.ipa` от EAS и го качи с приложението **Transporter** (Mac App Store).

## 6. Попълни листинга
В App Store Connect → версия 1.0:
- Текстове: копирай от `store/app-store-listing.md` (BG и EN).
- **App Privacy:** следвай `store/app-privacy.md` → „Data Not Collected".
- **Privacy Policy URL:** хостни `store/privacy-policy.md` някъде (GitHub Pages, твой сайт)
  и сложи адреса.
- **Screenshots (задължителни):** качи изображения за:
  - 6.7" дисплей — **1290 × 2796 px** (iPhone 15/16 Pro Max)
  - 6.5" дисплей — **1242 × 2688 px**
  Може да ги заснемеш от iPhone симулатор: `eas build --profile preview` или
  `npx expo run:ios`, после Cmd+S в симулатора прави screenshot.
- Икона: автоматично се взима 1024×1024 от билда (`assets/icon.png`).

## 7. Изпрати за ревю
- Избери качения билд във версията.
- Попълни „App Review Information" (демо акаунт не е нужен — приложението е офлайн).
- **Submit for Review.** Ревюто обикновено отнема 24–48 часа.

---

## Android (бонус — за Google Play)
```bash
eas build --platform android --profile production   # прави .aab
eas submit --platform android --latest
```
За Google Play трябва Play Console акаунт (еднократно 25 USD).

## Файлове в комплекта
- `assets/icon.png` — 1024×1024, иконата за App Store (без прозрачност) ✅
- `assets/adaptive-icon.png`, `assets/splash.png`, `assets/favicon.png`
- `app.json` — конфигурация (смени bundle id!)
- `eas.json` — профили за билд и submit (смени Apple данните!)
- `store/` — текстове за листинга, privacy policy и App Privacy отговори
