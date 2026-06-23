# App Privacy (App Store Connect → App Privacy)

Приложението НЕ събира данни. Всичко се съхранява локално в SQLite на устройството
и не се изпраща към сървър. Отговори в App Store Connect:

- **Data Collection:** „No, we do not collect data from this app."
  (Не, приложението не събира данни.)

Това дава етикет **„Data Not Collected"** в App Store.

## Защо
- Няма акаунти, вход или мрежови заявки към собствен бекенд.
- Профил, дневник, тегло и продукти се пазят само локално.
- Експортът (JSON/CSV) се прави ръчно от потребителя през системния share лист.
- Няма аналитика, реклами или SDK за проследяване.

## Export compliance (въпросът за криптиране при качване)
- Приложението не използва нестандартно криптиране.
- В app.json вече е зададено `ios.config.usesNonExemptEncryption = false`
  и `ITSAppUsesNonExemptEncryption = false`, така че Apple няма да пита всеки път.
