# Clean-room specification: `src/webview/utils/date.ts`

This document describes what the webview's date and duration formatting module must do, as seen from outside it. It is written for an engineer who will build a replacement without seeing the current source. Everything here comes from the module's callers, its tests, the settings and localization files, and outputs observed by running the current code.

---

## 0. Environment used for every example

Unless an example says otherwise, outputs were produced with:

- Node v22.22.2 with ICU 78.2 (the same runtime the Vitest `webview` project uses).
- `TZ=UTC`.
- Runtime default locale `en-US`, because `LANG` and `LC_ALL` were unset.
- `window.l10n.unknownDate` set to `"Unknown date"` (the production English string). In the repository's webview tests, `window.l10n` is a proxy that returns each key's own name, so the tests see `"unknownDate"` instead.
- For relative dates, the clock was fixed at **1,700,000,000,000 ms**, which is 2023-11-14T22:13:20Z. Call this instant NOW. In the tables, "now − date" is the commit's age in seconds: positive means the commit is in the past, negative means it is in the future.

Every part of the output that Intl generates depends on the runtime's ICU/CLDR data, including the words, their order, the punctuation, the digits and the whitespace. VS Code's webview runs in Electron's Chromium, which has its own ICU, so it may differ in small ways from Node (for example, the space before "AM"/"PM" is U+0020 on this Node and is U+202F on some other ICU versions). The replacement must produce whatever Intl produces for the options stated below. It must not build those strings by hand.

---

## 1. Interface

**Module path:** `src/webview/utils/date.ts`, imported everywhere as `@/webview/utils/date`.

Callers depend on the following exports. Their names and signatures must stay exactly as shown.

### `export function formatSeconds(started: number, finished: number): string`

- `started` and `finished` are instants in **milliseconds since the Unix epoch**, as returned by `Date.now()`.
- Returns the elapsed time as a short localized count of whole seconds, for example `"5s"`.
- **Callers:**
  - `src/webview/components/ui/Dialog.tsx`: while a Git operation runs, the elapsed time goes into the localized template `window.l10n.elapsedSeconds` ("{0} elapsed").
  - `src/webview/components/history/ActivityView.tsx`: each activity entry shows its duration, from `entry.started` to `entry.finished` (or to the current time if the entry is still running).

### `export function getFullDate(seconds: number): string`

- `seconds` is a Git timestamp in **seconds since the Unix epoch** (Git's `%at`/`%ct`, or a reflog `@{<seconds>}` selector). It may contain values that JavaScript cannot represent, and callers never pre-validate it.
- Returns a long, human-readable date and time in the display locale, or the localized "unknown date" text.
- **Callers:**
  - `src/webview/components/commit/CommitDetails.tsx`: the "Date: {0}" row of the commit details panel.
  - `src/webview/components/history/HistoryTools.tsx`: the `<time>` element of each reflog entry.

### `export function getCommitDate(seconds: number): CommitDate`

- `seconds` has the same meaning as for `getFullDate`.
- Returns the two strings that the graph's date column needs for one commit.
- **Caller:** `src/webview/components/commit/CommitRow.tsx`. It puts `title` in the date cell's `title` attribute (the hover tooltip) and renders `value` as the cell's text. The row does not use either field for the "uncommitted changes" pseudo-row.

### `export type CommitDate = { title: string; value: string }`

| Field   | Meaning                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `title` | Tooltip text for the date cell. It is always the absolute short date followed by a 24-hour `HH:MM` time, whatever the date-format setting is. |
| `value` | Visible text of the date cell. Its form depends on the `dateFormat` setting (see §3.3).                                                       |

No other file imports this type by name. It is still exported and must stay exported under that name.

### Tests

`tests/webview/utils/date.test.ts` imports `formatSeconds`, `getCommitDate` and `getFullDate`.

The module has no other exports, and none are required.

---

## 2. Dependencies the implementation must use

| What                                    | Where it comes from                                                                                             | Notes                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display locale                          | The `locale` field of the object returned by `getWebviewConfig()`, imported from `@/webview/lib/webview-config` | The `WebviewConfig` type is in `src/types/config.ts` and re-exported from `@/types`. The value is VS Code's display language (`vscode.env.language`, set in `src/extension/handlers/initialize.ts`), for example `"en"`, `"de"`, `"zh-cn"`, `"pt-br"` or the pseudo-locale `"qps-ploc"`. It is a BCP 47-like tag, may be lower-case, and is not guaranteed to be accepted by Intl. |
| Date-format setting                     | The `dateFormat` field of `getWebviewConfig()`                                                                  | The declared type is `DateFormat = "Date & Time" \| "Date Only" \| "Relative"`, from `src/types/config.ts`. It comes from the `branchwise.dateFormat` setting in `package.json` (enum of those three values, default `"Date & Time"`). The extension reads the setting without validating it (`src/extension/config.ts`), so a hand-edited `settings.json` can deliver any string. |
| Placeholder for an unrepresentable date | `window.l10n.unknownDate`                                                                                       | `window.l10n` is typed as `LocalizedStrings` from `src/old-extension/l10n/webviewL10n.ts` (declared on `Window` in `src/webview/global.d.ts`). The `unknownDate` key is defined in `src/old-extension/l10n/historyL10n.ts` as "Unknown date", which `webviewL10n.ts` merges in. Translations are in `l10n/bundle.l10n.*.json`; both zh-cn and zh-tw use "未知日期".                |
| Formatting engine                       | The platform's built-in `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` and `Intl.NumberFormat`                | No third-party date library is used or needed.                                                                                                                                                                                                                                                                                                                                     |
| Time zone                               | The runtime's default (local) time zone                                                                         | No explicit zone is passed anywhere.                                                                                                                                                                                                                                                                                                                                               |
| "Now" for relative dates                | The JavaScript `Date` clock at the moment of the call                                                           | `Date.now()` and `new Date()` both work. Test fake timers (`vi.useFakeTimers` / `vi.setSystemTime`) must be able to control it.                                                                                                                                                                                                                                                    |

**When these values are read.** The config and the l10n object must be read **when each function is called**, not when the module is imported.

- The configuration is a Preact signal. Reading it while a component renders subscribes that component, so when `updateWebviewConfig` swaps in a new object (for example after a settings change), date cells re-render in the new locale or format.
- Tests change settings by mutating the current config object in place (`Object.assign(getWebviewConfig(), {...})`). They install `window.l10n` in a `beforeAll` hook, after the module has already been imported.

---

## 3. Behaviour

### 3.1 Representable versus unrepresentable timestamps

A timestamp of `seconds` stands for the instant `seconds × 1000` milliseconds after the epoch. Any fraction of a millisecond is dropped, as JavaScript `Date` does.

JavaScript can represent an instant only when it lies within ±8,640,000,000,000,000 ms of the epoch, inclusive. In seconds that means:

- **Representable:** −8,640,000,000,000 ≤ seconds ≤ 8,640,000,000,000. The endpoints are 20 April 271822 BC and 13 September 275760, both 00:00 UTC.
- **Unrepresentable:** anything outside that range, even by a fraction (8,640,000,000,000.001 already counts), plus `NaN`, `+Infinity` and `−Infinity`. Git itself accepts timestamps such as `@99999999999999`, so the graph must cope with them.

For an unrepresentable timestamp:

- `getFullDate` returns `window.l10n.unknownDate`.
- `getCommitDate` returns `{ title: unknownDate, value: unknownDate }` for **every** `dateFormat` value.
- Neither function may throw. A single bad commit must not stop the rest of the graph from rendering.

Every representable timestamp must format without throwing, in every time zone, including both extreme endpoints. At the extremes some zones fall back to historical local-mean-time offsets, for example "GMT-4:56:02".

### 3.2 `getFullDate(seconds)`

For a representable timestamp, the result is the text that `Intl.DateTimeFormat` produces for the display locale with **full date style and long time style**, applied to the instant in the runtime's local time zone. In English that means:

- a weekday;
- the full month name, day and year;
- the word "at";
- hours, minutes and seconds in the locale's own clock convention (12-hour with AM/PM for `en`, 24-hour for `de`, `fr`, `en-GB` and many others);
- a time-zone name or offset.

Other points:

- Seconds are shown. Fractions of a second are not shown and are never rounded up: 1.9 is shown as :01.
- If Intl rejects the locale tag, the result is formatted as though no locale had been given, which means in the runtime's default locale (see §3.6).
- If the locale changes, the next call uses the new locale.

### 3.3 `getCommitDate(seconds)`

For a representable timestamp:

**Short date.** This is the text that `Intl.DateTimeFormat` produces for the display locale with **numeric year, abbreviated ("short") month name and numeric day** and no time fields. It uses the local time zone, and the locale decides the digits and the order of day, month and year: `Nov 14, 2023` (en), `14. Nov. 2023` (de), `2023年11月14日` (zh-CN), `١٤ نوفمبر ٢٠٢٣` (ar-EG).

**Clock time.** This is the local hour (00–23) and minute (00–59), each zero-padded to two digits and joined by `:`.

- It is always on a **24-hour clock**, even when the locale or a `-u-hc-h12` extension asks for 12-hour time.
- It is always written with **ASCII digits**, even when the date part uses another numbering system (ar-EG, or `-u-nu-arab`).
- It shows no seconds, and the seconds are **dropped, not rounded**: 22:13:59 is shown as `22:13`.
- The hour and minute use the same local time zone as the date part.

**`title`** is the short date, then one ASCII space (U+0020), then the clock time. For example: `Nov 14, 2023 22:13`.

**`value`** depends on `dateFormat`:

| `dateFormat`                                                     | `value`                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `"Date & Time"`                                                  | Identical to `title`.                                                              |
| `"Date Only"`                                                    | The short date alone, with no space or time after it.                              |
| `"Relative"`                                                     | A relative phrase measured from the current clock, described in §3.4.              |
| Any other string (possible because the setting is not validated) | Identical to `title`, the same as `"Date & Time"`, which is the setting's default. |

`title` never changes with `dateFormat`.

### 3.4 Relative phrase (`dateFormat: "Relative"`)

**Direction.** A commit that is later than the current instant is shown in future form: "in 5 minutes". A commit that is earlier than or equal to the current instant is shown in past form: "5 minutes ago". A commit at exactly the current instant therefore reads "0 seconds ago".

**Elapsed seconds, E.** E is (now − commit instant), measured in seconds and rounded to the nearest whole second. Exact halves round toward positive infinity, as JavaScript's `Math.round` does. So:

- a past commit exactly 0.5 s old gives E = 1;
- a future commit exactly 0.5 s ahead gives E = 0.

**Unit.** The unit is chosen by the absolute value of E:

| |E| in whole seconds | Unit | Unit length in seconds |
|---|---|---|
| 0 – 59 | second | 1 |
| 60 – 3,599 | minute | 60 |
| 3,600 – 86,399 | hour | 3,600 |
| 86,400 – 604,799 | day | 86,400 |
| 604,800 – 2,629,799 | week | 604,800 |
| 2,629,800 – 31,557,599 | month | 2,629,800 (30.4375 days, one twelfth of 365.25 days) |
| 31,557,600 and above | year | 31,557,600 (365.25 days) |

Months and years are fixed lengths. The calendar is not consulted, and neither are daylight-saving changes. For example:

- a commit exactly 28 days old reads "4 weeks ago";
- a commit exactly 31 days old reads "1 month ago".

**Count.** The count is E divided by the unit length, rounded to the nearest integer. Halves round toward positive infinity in the signed value, so the sign of E matters (see §7, Q2). Because E has already been rounded to whole seconds before this division, a value can in effect be rounded twice. For example, 89.5 s past gives E = 90, which becomes 2 minutes.

**Wording.** The phrase comes from `Intl.RelativeTimeFormat` for the display locale, in its default long style and with **numeric output always**. It never uses idiomatic forms such as "now", "yesterday", "last week" or "tomorrow": one day ago is "1 day ago" and "vor 1 Tag". Singular or plural agreement, where the number sits in the sentence, and the digits all follow the locale, and large counts are grouped the way the locale groups them: "in 273,731 years".

**Other points:**

- "Now" is read from the clock on each call. Nothing is cached between calls, and the phrase changes only when the caller renders again.
- `title` is still the absolute short date and time described in §3.3.

### 3.5 `formatSeconds(started, finished)`

The elapsed time is (finished − started) in milliseconds, divided by 1000 and **rounded down** to a whole number of seconds.

- If that number is negative, meaning the clock moved backwards or the arguments are reversed, the result is 0.
- Anything under one second shows as 0: 999 ms and 999.9 ms are both 0.
- The count is **always in seconds** and is never converted to minutes or hours: one hour is "3,600s".

The number is formatted by `Intl.NumberFormat` for the display locale **as a unit value in seconds, with narrow unit display**, using the locale's grouping and digits. Examples: `5s` (en), `5 Sek.` (de), `5秒` (zh-CN), `5 с` (ru), `٥ ث` (ar-EG), `1,234,567s` (en), `1.234.567 Sek.` (de).

Non-finite arguments are outside the callers' contract. The current code turns them into `"NaNs"` or `"∞s"`, and no caller relies on that (see §7, Q7).

### 3.6 Locale tags that Intl rejects

Intl throws a `RangeError` for some tags. Examples observed: `""`, `"en_US"` (underscore), `"not a locale!!"`, `"x"`, `"123"`, `"en-"` and the grandfathered `"i-klingon"`. When that happens, **each** export must quietly format as though no locale had been given, which means in the runtime's default locale. This applies to all three exports and to every date format, and none of them may throw.

The fallback goes to the runtime default, not to English. Under `LANG=de_DE.UTF-8` the tag `"en_US"` gives `5 Sek.` and `vor 5 Minuten`.

Tags that Intl accepts but has no data for are passed through unchanged, and Intl picks the closest locale it has. For example, `"qps-ploc"` resolves to en-US. Case differences such as `"zh-cn"` versus `"zh-CN"` are normalised by Intl and produce the same output.

### 3.7 Time zone

All three date outputs (the full date, the short date, and the HH:MM time) use the runtime's local time zone at the moment the output is produced. Nothing is converted to UTC. Examples are in §4.4.

The current implementation reuses formatters (§5), and a formatter keeps the time zone that was in effect when it was built. See §7, Q5 for what happens if the zone changes while the page is open.

---

## 4. Concrete examples

These are outputs of the current code. Unless stated otherwise the environment is the one in §0 (TZ=UTC, default locale en-US), and the `locale` setting is `"en"`.

### 4.1 `getCommitDate`, formats and boundaries (locale `en`)

| seconds                                  | dateFormat                                     | Result                                                             |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| 0                                        | Date & Time                                    | `{ title: "Jan 1, 1970 00:00", value: "Jan 1, 1970 00:00" }`       |
| 1700000000                               | Date & Time                                    | `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023 22:13" }`     |
| 1700000000                               | Date Only                                      | `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023" }`           |
| 1700000000                               | `"Something Else"` (not a valid setting value) | `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023 22:13" }`     |
| 0                                        | Date Only                                      | `{ title: "Jan 1, 1970 00:00", value: "Jan 1, 1970" }`             |
| 59                                       | Date & Time                                    | title `"Jan 1, 1970 00:00"` (the seconds are dropped)              |
| 60                                       | Date & Time                                    | title `"Jan 1, 1970 00:01"`                                        |
| 1.9                                      | Date & Time                                    | title `"Jan 1, 1970 00:00"`                                        |
| −1                                       | Date & Time                                    | title `"Dec 31, 1969 23:59"`                                       |
| 253402300799                             | Date & Time                                    | title `"Dec 31, 9999 23:59"`                                       |
| 8640000000000                            | Date & Time                                    | `{ title: "Sep 13, 275760 00:00", value: "Sep 13, 275760 00:00" }` |
| −8640000000000                           | Date & Time                                    | title `"Apr 20, 271822 00:00"` (a BC year; see §7, Q6)             |
| −62167219200 (0000-01-01, which is 1 BC) | Date & Time                                    | title `"Jan 1, 1 00:00"`                                           |
| 8640000000000.001                        | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| 8640000000001                            | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| −8640000000001                           | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| 99999999999999                           | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| −99999999999999                          | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| NaN                                      | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| Infinity                                 | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |
| −Infinity                                | any                                            | `{ title: "Unknown date", value: "Unknown date" }`                 |

### 4.2 `getCommitDate(1700000000).title` by locale (TZ=UTC)

| locale                                    | title                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| en, en-US, qps-ploc                       | `Nov 14, 2023 22:13`                                                        |
| en-US-u-hc-h12 (asks for a 12-hour clock) | `Nov 14, 2023 22:13` (the clock stays 24-hour)                              |
| en-GB                                     | `14 Nov 2023 22:13`                                                         |
| de                                        | `14. Nov. 2023 22:13`                                                       |
| fr                                        | `14 nov. 2023 22:13`                                                        |
| zh-CN                                     | `2023年11月14日 22:13`                                                      |
| ja                                        | `2023年11月14日 22:13`                                                      |
| ko                                        | `2023년 11월 14일 22:13`                                                    |
| ru                                        | `14 нояб. 2023 г. 22:13`                                                    |
| pt-br                                     | `14 de nov. de 2023 22:13`                                                  |
| ar-EG                                     | `١٤ نوفمبر ٢٠٢٣ 22:13` (Arabic-Indic digits in the date, ASCII in the time) |
| de-DE-u-nu-arab                           | `١٤. Nov. ٢٠٢٣ 22:13`                                                       |
| `""`, `"en_US"` (rejected tags)           | `Nov 14, 2023 22:13` (the runtime default, en-US)                           |
| `"en_US"` under `LANG=de_DE.UTF-8`        | `14. Nov. 2023 22:08` for seconds 1699999700 (the runtime default, de-DE)   |

### 4.3 `getFullDate` (TZ=UTC)

| seconds                                                        | locale                             | Result                                                                |
| -------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| 0                                                              | en                                 | `Thursday, January 1, 1970 at 12:00:00 AM UTC`                        |
| −1                                                             | en                                 | `Wednesday, December 31, 1969 at 11:59:59 PM UTC`                     |
| 1.9                                                            | en                                 | `Thursday, January 1, 1970 at 12:00:01 AM UTC`                        |
| 1700000000                                                     | en / en-US                         | `Tuesday, November 14, 2023 at 10:13:20 PM UTC`                       |
| 1700000000                                                     | en-GB                              | `Tuesday, 14 November 2023 at 22:13:20 UTC`                           |
| 1700000000                                                     | de                                 | `Dienstag, 14. November 2023 um 22:13:20 UTC`                         |
| 1700000000                                                     | fr                                 | `mardi 14 novembre 2023 à 22:13:20 UTC`                               |
| 1700000000                                                     | zh-CN                              | `2023年11月14日星期二 UTC 22:13:20`                                   |
| 1700000000                                                     | ja                                 | `2023年11月14日火曜日 22:13:20 UTC`                                   |
| 1700000000                                                     | ko                                 | `2023년 11월 14일 화요일 PM 10시 13분 20초 UTC`                       |
| 1700000000                                                     | pt-br                              | `terça-feira, 14 de novembro de 2023 às 22:13:20 UTC`                 |
| 1700000000                                                     | `""` or `"en_US"`                  | `Tuesday, November 14, 2023 at 10:13:20 PM UTC` (the runtime default) |
| 1700000000                                                     | `"en_US"` under `LANG=de_DE.UTF-8` | `Dienstag, 14. November 2023 um 22:13:20 UTC`                         |
| 8640000000000                                                  | en                                 | `Saturday, September 13, 275760 at 12:00:00 AM UTC`                   |
| −8640000000000                                                 | en                                 | `Tuesday, April 20, 271822 at 12:00:00 AM UTC`                        |
| 8640000000001, 99999999999999, −99999999999999, NaN, ±Infinity | any                                | `Unknown date` (`unknownDate` in the repository tests)                |

In all of these outputs, every space is U+0020 on this runtime.

### 4.4 Time zones (locale `en`, `dateFormat: "Date Only"`)

| TZ                         | seconds                              | `getCommitDate`                                          | `getFullDate`                                         |
| -------------------------- | ------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| America/New_York           | 0                                    | `{ title: "Dec 31, 1969 19:00", value: "Dec 31, 1969" }` | `Wednesday, December 31, 1969 at 7:00:00 PM EST`      |
| America/New_York           | 1700000000                           | title `Nov 14, 2023 17:13`                               | `Tuesday, November 14, 2023 at 5:13:20 PM EST`        |
| America/New_York           | 1710054000 (just after the DST jump) | title `Mar 10, 2024 03:00`                               | `Sunday, March 10, 2024 at 3:00:00 AM EDT`            |
| America/New_York           | 8640000000000                        | title `Sep 12, 275760 20:00`                             | `Friday, September 12, 275760 at 8:00:00 PM GMT-4`    |
| America/New_York           | −8640000000000                       | title `Apr 19, 271822 19:03`                             | `Monday, April 19, 271822 at 7:03:58 PM GMT-4:56:02`  |
| Asia/Kolkata               | 0                                    | `{ title: "Jan 1, 1970 05:30", value: "Jan 1, 1970" }`   | `Thursday, January 1, 1970 at 5:30:00 AM GMT+5:30`    |
| Asia/Kolkata               | 1700000000                           | `{ title: "Nov 15, 2023 03:43", value: "Nov 15, 2023" }` | `Wednesday, November 15, 2023 at 3:43:20 AM GMT+5:30` |
| Asia/Kolkata, locale en-GB | 0                                    | —                                                        | `Thursday, 1 January 1970 at 05:30:00 GMT+5:30`       |
| Asia/Tokyo                 | 1700000000                           | title `Nov 15, 2023 07:13`                               | `Wednesday, November 15, 2023 at 7:13:20 AM GMT+9`    |
| Pacific/Kiritimati         | 1700000000                           | title `Nov 15, 2023 12:13`                               | `Wednesday, November 15, 2023 at 12:13:20 PM GMT+14`  |
| Pacific/Kiritimati         | −8640000000000                       | title `Apr 19, 271822 13:30`                             | `Monday, April 19, 271822 at 1:30:40 PM GMT-10:29:20` |

### 4.5 Relative phrases (locale `en`, TZ=UTC, NOW = 1,700,000,000,000 ms, `seconds = 1700000000 − (now − date)`)

In every row, `title` is the absolute value from §3.3. For example, now − date = 300 gives the title `Nov 14, 2023 22:08`.

| now − date (s)           | value            | Comment                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| 0                        | `0 seconds ago`  | Exactly now counts as past.                                 |
| 0.4                      | `0 seconds ago`  |                                                             |
| 0.5                      | `1 second ago`   | A half rounds up.                                           |
| 1                        | `1 second ago`   | Singular form comes from Intl.                              |
| 29                       | `29 seconds ago` |                                                             |
| 59                       | `59 seconds ago` |                                                             |
| 59.4                     | `59 seconds ago` |                                                             |
| 59.5                     | `1 minute ago`   | Rounds to 60 s, so the unit becomes minutes.                |
| 60                       | `1 minute ago`   |                                                             |
| 89                       | `1 minute ago`   |                                                             |
| 89.4                     | `1 minute ago`   |                                                             |
| 89.5                     | `2 minutes ago`  | Rounds to 90 s, and 1.5 rounds up (rounding happens twice). |
| 90                       | `2 minutes ago`  |                                                             |
| 3569                     | `59 minutes ago` |                                                             |
| 3570                     | `60 minutes ago` | The count reaches the next unit (§7, Q1).                   |
| 3599                     | `60 minutes ago` | Same as above.                                              |
| 3600                     | `1 hour ago`     |                                                             |
| 5399                     | `1 hour ago`     |                                                             |
| 5400                     | `2 hours ago`    |                                                             |
| 84599                    | `23 hours ago`   |                                                             |
| 84600                    | `24 hours ago`   | §7, Q1                                                      |
| 86399                    | `24 hours ago`   | §7, Q1                                                      |
| 86400                    | `1 day ago`      | Never "yesterday".                                          |
| 129599                   | `1 day ago`      |                                                             |
| 129600                   | `2 days ago`     |                                                             |
| 561599                   | `6 days ago`     |                                                             |
| 561600                   | `7 days ago`     | §7, Q1                                                      |
| 604799                   | `7 days ago`     | §7, Q1                                                      |
| 604800                   | `1 week ago`     |                                                             |
| 907199                   | `1 week ago`     |                                                             |
| 907200                   | `2 weeks ago`    |                                                             |
| 2419200 (28 days)        | `4 weeks ago`    |                                                             |
| 2629799                  | `4 weeks ago`    | The week count never reaches 5.                             |
| 2629800                  | `1 month ago`    |                                                             |
| 2678400 (31 days)        | `1 month ago`    |                                                             |
| 3944699                  | `1 month ago`    |                                                             |
| 3944700                  | `2 months ago`   |                                                             |
| 30242699                 | `11 months ago`  |                                                             |
| 30242700                 | `12 months ago`  | §7, Q1                                                      |
| 31557599                 | `12 months ago`  | §7, Q1                                                      |
| 31557600                 | `1 year ago`     |                                                             |
| 47336399                 | `1 year ago`     |                                                             |
| 47336400                 | `2 years ago`    |                                                             |
| 315576000                | `10 years ago`   |                                                             |
| 1700000000 (seconds = 0) | `54 years ago`   |                                                             |
| −0.4                     | `in 0 seconds`   | Future by less than half a second (§7, Q3).                 |
| −0.5                     | `in 0 seconds`   | A half rounds toward +∞, giving 0 in future form.           |
| −0.6                     | `in 1 second`    |                                                             |
| −1                       | `in 1 second`    |                                                             |
| −59                      | `in 59 seconds`  |                                                             |
| −59.5                    | `in 59 seconds`  | Compare +59.5, which gives "1 minute ago" (§7, Q2).         |
| −59.6                    | `in 1 minute`    |                                                             |
| −60                      | `in 1 minute`    |                                                             |
| −89                      | `in 1 minute`    |                                                             |
| −90                      | `in 1 minute`    | Compare +90, which gives "2 minutes ago" (§7, Q2).          |
| −91                      | `in 2 minutes`   |                                                             |
| −3600                    | `in 1 hour`      |                                                             |
| −259200                  | `in 3 days`      |                                                             |
| −604800                  | `in 1 week`      |                                                             |
| −2629800                 | `in 1 month`     |                                                             |
| −31557600                | `in 1 year`      |                                                             |
| −47336400                | `in 1 year`      | Compare +47336400, which gives "2 years ago" (§7, Q2).      |

Further cases:

- With the clock at NOW + 999 ms: a commit at 1700000000 s reads `1 second ago`, and a commit at 1700000001 s reads `in 0 seconds`.
- seconds = 8640000000000 reads `in 273,731 years`. seconds = −8640000000000 reads `273,839 years ago`.
- Any unrepresentable seconds value gives `{ title: "Unknown date", value: "Unknown date" }`.

The same NOW in other locales (now − date → value):

| locale           | 0                                      | 1                | 300              | 86400         | 172800         | 604800           | 2629800       | 31557600      | −0.5           | −300           | −86400        |
| ---------------- | -------------------------------------- | ---------------- | ---------------- | ------------- | -------------- | ---------------- | ------------- | ------------- | -------------- | -------------- | ------------- |
| de               | vor 0 Sekunden                         | vor 1 Sekunde    | vor 5 Minuten    | vor 1 Tag     | vor 2 Tagen    | vor 1 Woche      | vor 1 Monat   | vor 1 Jahr    | in 0 Sekunden  | in 5 Minuten   | in 1 Tag      |
| fr               | il y a 0 seconde                       | il y a 1 seconde | il y a 5 minutes | il y a 1 jour | il y a 2 jours | il y a 1 semaine | il y a 1 mois | il y a 1 an   | dans 0 seconde | dans 5 minutes | dans 1 jour   |
| zh-CN            | 0秒钟前                                | 1秒钟前          | 5分钟前          | 1天前         | 2天前          | 1周前            | 1个月前       | 1年前         | 0秒钟后        | 5分钟后        | 1天后         |
| ja               | 0 秒前                                 | 1 秒前           | 5 分前           | 1 日前        | 2 日前         | 1 週間前         | 1 か月前      | 1 年前        | 0 秒後         | 5 分後         | 1 日後        |
| ru               | 0 секунд назад                         | 1 секунду назад  | 5 минут назад    | 1 день назад  | 2 дня назад    | 1 неделю назад   | 1 месяц назад | 1 год назад   | через 0 секунд | через 5 минут  | через 1 день  |
| pt-br            | há 0 segundo                           | há 1 segundo     | há 5 minutos     | há 1 dia      | há 2 dias      | há 1 semana      | há 1 mês      | há 1 ano      | em 0 segundo   | em 5 minutos   | em 1 dia      |
| ar-EG            | قبل ٠ ثانية                            | قبل ثانية واحدة  | قبل ٥ دقائق      | قبل يوم واحد  | قبل يومين      | قبل أسبوع واحد   | قبل شهر واحد  | قبل سنة واحدة | خلال ٠ ثانية   | خلال ٥ دقائق   | خلال يوم واحد |
| `""` / `"en_US"` | the same as `en` (the runtime default) |                  |                  |               |                |                  |               |               |                |                |               |

### 4.6 `formatSeconds`

Locale `en` unless noted:

| started, finished (ms)     | Result                                    |
| -------------------------- | ----------------------------------------- |
| 1000, 6999                 | `5s`                                      |
| 0, 0                       | `0s`                                      |
| 0, 999                     | `0s`                                      |
| 0, 1000                    | `1s`                                      |
| 0, 1999.9                  | `1s`                                      |
| 1.5, 1001.4                | `0s` (999.9 ms)                           |
| 0, 59999                   | `59s`                                     |
| 0, 60000                   | `60s` (no conversion to minutes)          |
| 0, 3600000                 | `3,600s`                                  |
| 0, 86400000                | `86,400s`                                 |
| 0, 1234567000              | `1,234,567s`                              |
| 5000, 1000                 | `0s` (reversed)                           |
| 1000, 500                  | `0s`                                      |
| 0, −1                      | `0s`                                      |
| 0, Infinity / −Infinity, 0 | `∞s` (outside the contract; see §7, Q7)   |
| 0, NaN / NaN, 0            | `NaNs` (outside the contract; see §7, Q7) |

`formatSeconds(0, 5000)` and `formatSeconds(0, 1234567000)` by locale:

| locale                                                    | 5000 ms                           | 1234567000 ms                                 |
| --------------------------------------------------------- | --------------------------------- | --------------------------------------------- |
| en, en-US, ja, qps-ploc                                   | `5s`                              | `1,234,567s`                                  |
| de                                                        | `5 Sek.`                          | `1.234.567 Sek.`                              |
| fr                                                        | `5s`                              | `1 234 567s` (the group separator is U+202F)  |
| zh-CN, zh-cn                                              | `5秒`                             | `1,234,567秒`                                 |
| ru                                                        | `5 с`                             | `1 234 567 с` (the group separator is U+00A0) |
| pt-br                                                     | `5 s`                             | `1.234.567 s`                                 |
| ar-EG                                                     | `٥ ث`                             | `١٬٢٣٤٬٥٦٧ ث`                                 |
| `""`, `"en_US"`, `"not a locale!!"`, `"x"`, `"i-klingon"` | `5s` (the runtime default, en-US) | `1,234,567s`                                  |
| `"en_US"` under `LANG=de_DE.UTF-8`                        | `5 Sek.`                          | —                                             |

---

## 5. Non-functional requirements

1. **Reuse formatters.** The graph renders a date cell for every loaded commit: hundreds initially, more as the user loads more. Building an Intl formatter is expensive compared with using one. The formatter for a given combination of _locale tag_ and _kind of output_ must therefore be built once and then reused. The kinds of output are: short date, full date, relative phrase, and seconds count.
   - Reuse is keyed by the exact locale tag string from the config. It must not be keyed by the identity of the config object, because tests mutate that object in place.
   - A rejected tag must not cause a new failed construction attempt on every call. Its fallback formatter is reused in the same way.
   - A locale change must still take effect on the next call.
   - Observed with the current code, as a guide to what "bounded" means: after the first call, 500 further calls to each export for one locale construct no further Intl objects.
2. **Read settings at call time** through `getWebviewConfig()`, and the placeholder through `window.l10n.unknownDate` (§2). Importing the module must not read the config, touch `window.l10n` or throw.
3. **Never throw for any `number` argument** once the config is initialized. That includes NaN, the infinities, huge values, negative values and fractions. This covers every format, every accepted or rejected locale tag, and every time zone. What happens before the config is initialized is unspecified, because `getWebviewConfig()` itself throws then and callers never call that early.
4. **Take "now" from the JavaScript `Date` clock** on each relative-format call, so that fake timers control it in tests.
5. **No new runtime dependencies.** The built-in Intl API covers everything required.

---

## 6. Test coverage

### 6.1 What `tests/webview/utils/date.test.ts` checks today

| #   | Check                                                                                                                                                                                                                                               | Behaviour covered                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| T1  | For each of `"Date & Time"`, `"Date Only"` and `"Relative"`, and for seconds 99999999999999, −99999999999999, NaN and Infinity: `getCommitDate` returns `{ title: "unknownDate", value: "unknownDate" }` and `getFullDate` returns `"unknownDate"`. | §3.1 placeholder, in part.                                                        |
| T2  | `getCommitDate(0).value` is not the placeholder, and `getFullDate(8640000000000)` is not the placeholder.                                                                                                                                           | That the upper endpoint is representable. The output text is not checked.         |
| T3  | `formatSeconds(1000, 6999)` → `"5s"` (en). `formatSeconds(5000, 1000)` → `"0s"`. After switching to de, `formatSeconds(0, 5000)` → `"5 Sek."`. After switching to zh-CN → `"5秒"`.                                                                  | §3.5 rounding down and clamping, locale units, and a locale switch taking effect. |
| T4  | Rendering `GraphView` with one commit at 99999999999999 and one at 0 shows both messages and the text `unknownDate`.                                                                                                                                | Integration: one bad date does not break the rows.                                |
| —   | The ErrorBoundary test in the same file                                                                                                                                                                                                             | Not related to this module.                                                       |

Nothing sets or controls the time zone, the clock, or constructor reuse. No test asserts any formatted date text.

### 6.2 Gaps, with ready-to-add cases

**Setup for the new cases.** All the cases below passed against the current code in the Vitest `webview` project (jsdom environment). They were run with the outer `TZ` set to UTC and to America/New_York, and with `LANG=de_DE.UTF-8`, so they do not depend on the machine running them. Two setup points matter:

- **Time zone.** Stub it to `"UTC"` (`vi.stubEnv("TZ", "UTC")`) in the test file's first `beforeAll`, before `setupWebviewTest()` and before any formatting happens. Remove the stub in `afterAll`. A formatter keeps the zone it was built in (§7, Q5), so changing the zone later in the same file does not take effect. Put the time-zone case in G12 in a **separate test file** that stubs its own zone first. Alternatively, use a locale tag that no earlier test in the same file has used.
- **Clock.** For relative cases, use `vi.useFakeTimers()` and `vi.setSystemTime(1_700_000_000_000)`, and restore real timers afterwards. Reset `locale` to `"en"` and `dateFormat` to `"Date & Time"` after each case.

The placeholder is `"unknownDate"` under the test l10n proxy. The locale is `"en"` unless stated otherwise.

**G1. Exact "Date & Time" text (§3.3)**

- `getCommitDate(0)` → `{ title: "Jan 1, 1970 00:00", value: "Jan 1, 1970 00:00" }`
- `getCommitDate(1700000000)` → `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023 22:13" }`
- `getCommitDate(59).title` → `"Jan 1, 1970 00:00"` (seconds are dropped, not rounded)
- `getCommitDate(60).title` → `"Jan 1, 1970 00:01"`
- `getCommitDate(-1).title` → `"Dec 31, 1969 23:59"`

**G2. "Date Only", and an unrecognised setting (§3.3)**

- dateFormat `"Date Only"`: `getCommitDate(1700000000)` → `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023" }`
- dateFormat `"Something Else"`: `getCommitDate(1700000000)` → `{ title: "Nov 14, 2023 22:13", value: "Nov 14, 2023 22:13" }`

**G3. Title uses a 24-hour clock with ASCII digits in any locale (§3.3)**

`getCommitDate(1700000000).title` for each locale:

- en-US → `"Nov 14, 2023 22:13"`
- en-US-u-hc-h12 → `"Nov 14, 2023 22:13"`
- en-GB → `"14 Nov 2023 22:13"`
- de → `"14. Nov. 2023 22:13"`
- zh-CN → `"2023年11月14日 22:13"`
- ko → `"2023년 11월 14일 22:13"`
- ar-EG → `"١٤ نوفمبر ٢٠٢٣ 22:13"`
- de-DE-u-nu-arab → `"١٤. Nov. ٢٠٢٣ 22:13"`

**G4. Exact `getFullDate` text (§3.2)**

- en: `getFullDate(0)` → `"Thursday, January 1, 1970 at 12:00:00 AM UTC"`. The space before "AM" depends on ICU, so prefer the 24-hour locales below if CI's Node may differ.
- en-GB: `getFullDate(1700000000)` → `"Tuesday, 14 November 2023 at 22:13:20 UTC"`
- de: `getFullDate(1700000000)` → `"Dienstag, 14. November 2023 um 22:13:20 UTC"`
- zh-CN: `getFullDate(1700000000)` → `"2023年11月14日星期二 UTC 22:13:20"`
- en: `getFullDate(1.9)` → `"Thursday, January 1, 1970 at 12:00:01 AM UTC"` (fractions are not rounded up)

**G5. Representable boundaries, exactly (§3.1)**

- `getCommitDate(8640000000000)` → `{ title: "Sep 13, 275760 00:00", value: "Sep 13, 275760 00:00" }`
- `getCommitDate(-8640000000000).title` → `"Apr 20, 271822 00:00"`
- `getFullDate(-8640000000000)` → `"Tuesday, April 20, 271822 at 12:00:00 AM UTC"`
- For each of the three formats, and for seconds 8640000000001, −8640000000001, 8640000000000.001 and −Infinity: `getCommitDate` → `{ title: "unknownDate", value: "unknownDate" }` and `getFullDate` → `"unknownDate"`. Today's T1 does not cover −Infinity or the values just past the boundary.

**G6. Relative phrases: behaviour that is not in question (§3.4)**

dateFormat `"Relative"`, clock at 1,700,000,000,000 ms. The input is `getCommitDate(1700000000 − d).value`:

| d          | value            |
| ---------- | ---------------- |
| 0          | `0 seconds ago`  |
| 1          | `1 second ago`   |
| 59         | `59 seconds ago` |
| 60         | `1 minute ago`   |
| 3600       | `1 hour ago`     |
| 5399       | `1 hour ago`     |
| 5400       | `2 hours ago`    |
| 86400      | `1 day ago`      |
| 129600     | `2 days ago`     |
| 604800     | `1 week ago`     |
| 907200     | `2 weeks ago`    |
| 2419200    | `4 weeks ago`    |
| 2629799    | `4 weeks ago`    |
| 2629800    | `1 month ago`    |
| 2678400    | `1 month ago`    |
| 31557600   | `1 year ago`     |
| 47336399   | `1 year ago`     |
| 315576000  | `10 years ago`   |
| 1700000000 | `54 years ago`   |
| −1         | `in 1 second`    |
| −60        | `in 1 minute`    |
| −3600      | `in 1 hour`      |
| −259200    | `in 3 days`      |
| −604800    | `in 1 week`      |
| −2629800   | `in 1 month`     |
| −31557600  | `in 1 year`      |

Also:

- The title is unaffected: `getCommitDate(1700000000 − 300).title` → `"Nov 14, 2023 22:08"`.
- Extremes: `getCommitDate(8640000000000).value` → `"in 273,731 years"` and `getCommitDate(-8640000000000).value` → `"273,839 years ago"`.
- Other locales: de, d = 300 → `"vor 5 Minuten"`; de, d = 86400 → `"vor 1 Tag"`; de, d = −300 → `"in 5 Minuten"`; zh-CN, d = 300 → `"5分钟前"`; zh-CN, d = −86400 → `"1天后"`.
- The clock is read on each call: d = 0 gives `"0 seconds ago"`. After `vi.advanceTimersByTime(60_000)`, the same seconds value gives `"1 minute ago"`.

**G7. Relative phrases: current behaviour that §7 questions**

Add these only if you keep the current behaviour. Otherwise replace them with the behaviour you choose.

| d         | value            | Question |
| --------- | ---------------- | -------- |
| 0.4       | `0 seconds ago`  | Q3       |
| 0.5       | `1 second ago`   | Q2       |
| 59.4      | `59 seconds ago` |          |
| 59.5      | `1 minute ago`   | Q2       |
| 89        | `1 minute ago`   |          |
| 90        | `2 minutes ago`  | Q2       |
| 3569      | `59 minutes ago` |          |
| 3570      | `60 minutes ago` | Q1       |
| 3599      | `60 minutes ago` | Q1       |
| 84599     | `23 hours ago`   |          |
| 84600     | `24 hours ago`   | Q1       |
| 86399     | `24 hours ago`   | Q1       |
| 561599    | `6 days ago`     |          |
| 561600    | `7 days ago`     | Q1       |
| 604799    | `7 days ago`     | Q1       |
| 30242699  | `11 months ago`  |          |
| 30242700  | `12 months ago`  | Q1       |
| 31557599  | `12 months ago`  | Q1       |
| 47336400  | `2 years ago`    | Q2       |
| −0.4      | `in 0 seconds`   | Q3       |
| −0.5      | `in 0 seconds`   | Q3       |
| −0.6      | `in 1 second`    |          |
| −59.5     | `in 59 seconds`  | Q2       |
| −59.6     | `in 1 minute`    |          |
| −90       | `in 1 minute`    | Q2       |
| −91       | `in 2 minutes`   |          |
| −47336400 | `in 1 year`      | Q2       |

**G8. `formatSeconds` rounding, clamping and units (§3.5)**

- (0, 999) → `"0s"`
- (0, 1000) → `"1s"`
- (0, 1999.9) → `"1s"`
- (1.5, 1001.4) → `"0s"`
- (0, 59999) → `"59s"`
- (0, 60000) → `"60s"`
- (0, 3600000) → `"3,600s"`
- (0, −1) → `"0s"`
- (1000, 1000) → `"0s"`
- (0, 1234567000) → `"1,234,567s"`
- ru: (0, 5000) → `"5 с"`
- pt-br: (0, 5000) → `"5 s"`
- de: (0, 1234567000) → `"1.234.567 Sek."`

**G9. Rejected locale tags fall back to the runtime default and do not throw (§3.6)**

Clock at 1,700,000,000,000 ms.

1. Set `locale` to the runtime's own default tag (`new Intl.DateTimeFormat().resolvedOptions().locale`). Record `formatSeconds(0, 5000)`, `getFullDate(1700000000)`, and `getCommitDate(1699999700)` under each of the three formats.
2. For each of `"en_US"`, `""`, `"not a locale!!"`, `"i-klingon"` and `"en-"`, the same six calls return exactly the recorded values.

This comparison holds whatever the machine's default locale is.

**G10. A locale switch takes effect for the date exports (§3.2, §3.3)**

The existing tests check this only for `formatSeconds`.

1. en: `getCommitDate(1700000000).title` → `"Nov 14, 2023 22:13"`
2. Switch to de: the title → `"14. Nov. 2023 22:13"`, and `getFullDate(1700000000)` → `"Dienstag, 14. November 2023 um 22:13:20 UTC"`
3. Switch back to en: the title → `"Nov 14, 2023 22:13"`

**G11. Formatters are reused (§5.1)**

Replace `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` and `Intl.NumberFormat` with counting wrappers, and restore the originals afterwards. A JavaScript `Proxy` with a `construct` trap works. `vi.spyOn` on these constructors broke `new` under Vitest 4 in this repository.

Then, for locale `"fr-CA"` and again for `"not a locale!!"`, with dateFormat `"Relative"`:

1. Call `getCommitDate`, `getFullDate` and `formatSeconds` once each, and record the construction counts.
2. Call each of them 500 more times.
3. Expected: the construction counts are unchanged.

**G12. The runtime's local time zone is used (§3.7)**

Put this in a separate test file that stubs `TZ` to `"Asia/Kolkata"` in its first `beforeAll`:

- `getCommitDate(0)` → `{ title: "Jan 1, 1970 05:30", value: "Jan 1, 1970 05:30" }`
- `getCommitDate(1700000000).title` → `"Nov 15, 2023 03:43"`
- dateFormat `"Date Only"`: `getCommitDate(1700000000).value` → `"Nov 15, 2023"`
- locale en-GB: `getFullDate(0)` → `"Thursday, 1 January 1970 at 05:30:00 GMT+5:30"`

---

## 7. Behaviour that may be a bug, to decide

In each case the current behaviour is stated first, followed by what may have been intended. This document does not choose between them.

**Q1. The count can equal the size of the next unit.** Because the count is rounded within the unit chosen for |E|, these ranges show a count that should have moved up to the next unit:

| Range of E (seconds)    | Current output   |
| ----------------------- | ---------------- |
| 3,570 – 3,599           | "60 minutes ago" |
| 84,600 – 86,399         | "24 hours ago"   |
| 561,600 – 604,799       | "7 days ago"     |
| 30,242,700 – 31,557,599 | "12 months ago"  |

The same happens in future form. Weeks cannot reach 5, because a month is about 4.35 weeks.

- _Probably intended:_ move up to the next unit, giving "1 hour ago", "1 day ago", "1 week ago" and "1 year ago".

**Q2. Past and future round halves differently.** Halves round toward +∞ in the signed value. For a past date that rounds up in magnitude; for a future date it rounds down:

| Past                      | Future                   |
| ------------------------- | ------------------------ |
| 90 s → "2 minutes ago"    | 90 s → "in 1 minute"     |
| 59.5 s → "1 minute ago"   | 59.5 s → "in 59 seconds" |
| 1.5 years → "2 years ago" | 1.5 years → "in 1 year"  |

The elapsed time is also rounded to whole seconds before the count is rounded again, which is why 89.5 s gives "2 minutes ago".

- _Probably intended:_ the same magnitude in both directions, with a single rounding step.

**Q3. Zero has two forms.** A commit at the current instant, or up to half a second in the past, reads "0 seconds ago". A commit up to half a second in the future reads "in 0 seconds" (de: "in 0 Sekunden"). Clock skew between the machine that made the commit and the viewer can easily cause the second case.

- _Probably intended:_ one form for effectively-zero ages, and perhaps treating slightly-future commits as past.

**Q4. An unknown `dateFormat` string behaves like the default.** This is probably intended and harmless. It is listed because a replacement that switched only on the three declared values could leave `value` undefined.

**Q5. Reused formatters keep the time zone they were built with.** The current code builds a formatter once per locale. If the runtime's time zone changes afterwards, the date part and the full date keep the old zone, but the `HH:MM` part (taken from the `Date` object) follows the new zone. This can happen when the OS zone changes while VS Code stays open, or when a test changes `TZ`.

Observed in Vitest: "en" formatters were built while TZ was Asia/Tokyo, and TZ was then switched to UTC. After that:

- `getCommitDate(1699999700).title` → `"Nov 15, 2023 22:08"`. The date is from Tokyo and the time is from UTC. The correct UTC value is `"Nov 14, 2023 22:08"`.
- `getFullDate(0)` → `"Thursday, January 1, 1970 at 9:00:00 AM GMT+9"`.

_Probably intended:_ the date and time always agree, whether by rebuilding formatters when the zone changes or by accepting this as a rare edge case. Whichever is chosen, §5.1 still requires formatter reuse.

**Q6. Years before 1 CE carry no era.** The short and full formats ask for a numeric year with no era, so Intl prints BC years without a marker:

- 0000-01-01 (1 BC) shows as "Jan 1, 1".
- −8,640,000,000,000 shows as "Apr 20, 271822" / "Tuesday, April 20, 271822 …".

This comes from Intl. It is probably acceptable, since such timestamps are almost always bogus, but it is ambiguous.

**Q7. `formatSeconds` with non-finite input** produces "NaNs" or "∞s", and it never switches to minutes or hours: an hour-long operation shows "3,600s elapsed". No caller passes non-finite values. Staying in seconds may be deliberate, since the dialog string is "{0} elapsed". Both points are listed so that they are decided explicitly.

**Q8. Documentation mismatch (outside this module).** The setting descriptions in `package.nls.json` give examples in en-GB order ("19 Mar 2019 21:34"). The real order follows the display locale ("Mar 19, 2019 21:34" in `en`). The time part does match the promised 24-hour `HH:MM`. The full date in the details panel, however, follows the locale's clock convention (12-hour in `en`), unlike the tooltip.

---

## 8. Decisions on §7 (from the project maintainer's side)

These decisions replace the "current behaviour" wherever they differ. Build to these, and replace the G7 cases with tests of the decided behaviour.

- **Q1: move up to the next unit.** The displayed count must never equal the size of the next unit. An age that would read "60 minutes", "24 hours", "7 days" or "12 months" reads "1 hour", "1 day", "1 week" or "1 year" instead, in both directions. Weeks still stop at 4: an age of 2,629,799 s reads "4 weeks ago", and 2,629,800 s reads "1 month ago".
- **Q2: the same magnitude in both directions, one rounding step.** Compute the age's magnitude in seconds without rounding it first, pick the unit from that magnitude, and round the count to the nearest integer with halves rounding up in magnitude. Then apply the direction. So 90 s reads "2 minutes ago" and "in 2 minutes"; 89.5 s reads "1 minute ago" and "in 1 minute"; 59.5 s reads "1 minute ago" and "in 1 minute"; 1.5 years reads "2 years ago" and "in 2 years". Unit boundaries apply to the rounded count (together with Q1): whatever unit is chosen, the count shown is at least 1 once the magnitude is 0.5 s or more, and never reaches the next unit's size.
- **Q3: zero reads as past.** Any age whose count rounds to 0 (a magnitude under half a second, in either direction) reads "0 seconds ago" in the display language. A commit 0.5 s or more in the future reads in future form ("in 1 second").
- **Q4: keep.** Any unrecognised `dateFormat` string behaves like "Date & Time".
- **Q5: date and time must agree.** In `title`, the date and the HH:MM time must always come from the same time zone, even if the runtime's zone changes after formatters were built. Rebuilding formatters when the zone changes is not required. §5's reuse requirement stays.
- **Q6: keep.** No era marker.
- **Q7: non-finite input shows zero.** `formatSeconds` treats a non-finite difference as 0 and returns the locale's form of 0 seconds ("0s" in `en`). It stays in seconds for any duration.
- **Q8: out of scope** for this module.
