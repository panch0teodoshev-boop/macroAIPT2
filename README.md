# Калории Тракер — Expo + TypeScript + SQLite

Мобилно приложение за следене на калории и макронутриенти на български,
изградено по Google Sheets tracker-а. Реален Expo проект с TypeScript,
Context API за state, SQLite за локални данни и `react-native-gifted-charts` за графиките.

## Стартиране

```bash
npm install          # или: yarn
npx expo install     # подравнява нативните пакети спрямо SDK версията
npm start            # отваря Expo Dev Tools
# после: натисни i (iOS), a (Android) или сканирай QR кода
```

> **Графики и SQLite изискват native код.** Препоръчва се **development build**
> (`npx expo run:ios` / `npx expo run:android`) или EAS Build. В обикновения
> Expo Go графиките/SQLite може да не тръгнат заради `react-native-svg` /
> `react-native-linear-gradient` / `expo-sqlite`. За dev build:
> ```bash
> npx expo install expo-dev-client
> npx expo run:android   # или run:ios (изисква Xcode/Android Studio)
> ```

## Структура

```
kalorii-tracker/
├── App.tsx                     # корен: provider, header, превключване на табове
├── index.ts                    # entry point
├── app.json / tsconfig.json / babel.config.js / package.json
└── src/
    ├── theme.ts                # цветова схема (тюркоазено + корал)
    ├── types.ts                # всички типове
    ├── constants.ts            # нива активност, цели, хранения, BG дати
    ├── data/sampleProducts.ts  # примерна база + примерна закуска
    ├── utils/formulas.ts       # Mifflin–St Jeor, TDEE, план, parseQty, дати, форматиране
    ├── db/database.ts          # SQLite: схема, seed, CRUD, импорт/нулиране
    ├── store/AppContext.tsx    # Context + reducer, write-through към SQLite
    ├── components/ui.tsx       # Card, Button, Field, Segmented, Dropdown, Modal, StatTile…
    ├── navigation/BottomNav.tsx# долна навигация с 6 таба
    └── screens/
        ├── CalculatorScreen.tsx
        ├── ProductsScreen.tsx
        ├── DiaryScreen.tsx
        ├── WeekScreen.tsx
        ├── ShoppingScreen.tsx
        └── SettingsScreen.tsx
```

## Функции

1. **Калкулатор** — BMR по Mifflin–St Jeor, TDEE с 5 коефициента, цел
   (поддържане −0 / отслабване −500 / покачване +400), ръчно задаване на калории.
2. **Макроси** — проценти П/В/М с проверка за 100%, грамове по формулите
   (П, В = kcal·%/4; М = kcal·%/9).
3. **Продукти** — SQLite таблица, търсене, добавяне/редакция/изтриване, 100 г или 1 бр.
4. **Дневник** — по дни, хранения (Закуска/Обяд/Вечеря/Междинно); количеството за
   храни на 100 г се въвежда **в грамове (1–200 г)** с плъзгач и бързи бутони
   (25/50/100/150/200), а за продукти „на брой" (напр. яйце) — брояч на бройки.
   Общ сбор, оставащо спрямо целта, donut по макроси.
5. **Седмица** — план срещу средно, бар графика за калории, стакната за макроси,
   таблица Пн–Нд със средно.
6. **Списък за пазар** — ръчен + автоматичен (от продуктите за седмицата), с чекбокс-ове.
7. **Данни** — локално в SQLite; експорт/импорт в JSON (всичко) и CSV (продукти).

## Бележки по версиите

Версиите в `package.json` са спрямо **Expo SDK 52**. Ако ползваш друг SDK,
изпълни `npx expo install` — той ще нагласи съвместимите версии на
`expo-sqlite`, `expo-file-system`, `react-native-svg`,
`@react-native-community/slider` и др.

> Грамажното въвеждане (плъзгач) ползва `@react-native-community/slider`.
> При първо стартиране след тази промяна базата се пресява наново (`seeded_v2`),
> за да замени старите данни с множители със стойности в грамове.
```
