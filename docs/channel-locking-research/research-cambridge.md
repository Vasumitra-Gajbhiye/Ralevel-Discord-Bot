# Cambridge International exam timing: research for the auto channel-lock system

Researched 2026-09-30. Scope: Cambridge IGCSE / O Level / International AS & A Level (CAIE). Everything below is either (a) quoted or read from a primary Cambridge source (URL given), (b) computed by me from primary-source data (marked **[computed]**), or (c) flagged as unverified or inferred.

Raw data I collected, useful for seeding the dashboard, is in the same scratchpad folder:

- `pdfs/`: every official timetable PDF (June 2026 and Nov 2026 for all 6 zones plus UK, and March 2027), Handbook 2026, Handbook 2025, UK supplement, March supplement, Information for candidates, and the Pearson start-time docs. Each has a `.txt` extraction.
- `zones.json`: location → zone for all 266 locations in Cambridge's zone-lookup tool.
- `keytimes.json`: location → local and UTC key times for the same 266 locations, from Cambridge's key-times tool.
- `nov2026_keytimes_data.json`: the JSON embedded in Cambridge's "November 2026 – Find your key times" help-centre widget. It is per country, and per state or province for 8 federal countries.
- `cambridge_2026_timetables_parsed.csv`: 3,490 rows, one per zone × component for June 2026 and Nov 2026, parsed from the PDFs, with a computed UTC key time for each row.
- `tt_week.json`: the same parsed rows as JSON. The parser is `parse_week.py` and the analysis scripts are `analyze.py` and `examples.py`.

---

## 1. Exam series

| Series | Who sits it | Qualifications | Timetabled dates (latest published) | Timetables |
|---|---|---|---|---|
| **February/March** ("March series") | **India and Romania only**. The timetable is labelled "Administrative zone 4". Romania uses Zone-4-aligned UTC key times in March (see §3). | Cambridge IGCSE and Cambridge International AS & A Level only. No O Level. Syllabus availability is limited. | **March 2027: 3 Feb – 4 Mar 2027**, with practical and speaking test-date windows in Jan–early Feb. The March 2026 series ran about 5 Feb – 9 Mar 2026 (third-party source, unverified). | One timetable. Final V1 is dated July 2026 and has been on Direct since 10 June 2026. |
| **May/June** ("June series") | All 6 zones plus the UK | IGCSE, IGCSE (9–1), O Level, AS & A Level | **June 2026: 23 Apr – 9 Jun 2026** (Zone 6's last local date is 10 Jun, because Zone 6 AM falls on the previous UTC day) | 7 PDFs: Zones 1–6 plus UK |
| **October/November** ("November series") | All 6 zones plus the UK | IGCSE, IGCSE (9–1), O Level, AS & A Level | **Nov 2026: 28 Sep – 12/13 Nov 2026**. Zones 3 and 4 end 13 Nov; the others end 12 Nov. | 7 PDFs, all "Version 1, April 2026" |

Sources:
- March: "This page has all key documents that exams officers in **India and Romania** need to deliver the March series" (https://www.cambridgeinternational.org/exam-administration/march-series/). The March 2027 timetable is https://www.cambridgeinternational.org/Images/686092-cambridge-final-examination-timetable.pdf. The March 2027 key-dates document says "3 February March 2027 series starts … 4 March March 2027 series ends" (https://www.cambridgeinternational.org/Images/183437-key-dates-for-march-series.pdf). A help article says a syllabus is "available for examination in March 2025, 2026 and 2027 for India only" (https://help.cambridgeinternational.org/hc/en-gb/articles/19634244252690).
- June 2026 key dates: "23 April Start of timetabled exam period … 9 June End of timetabled exam period" (https://www.cambridgeinternational.org/Images/746005-key-dates-for-june-2026-series-international-.pdf).
- November 2026: "Late September Start of timetabled exam period … Mid-November End" (https://www.cambridgeinternational.org/Images/746006-key-dates-for-november-2026-series-international-.pdf). The exact dates come from the PDFs **[computed]**.

**Which 2026–27 timetables are published** (the timetables page, https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/exam-timetables/, as of today):
- **November 2026: final, public.**
- **March 2027: final, public** (the March series page).
- **June 2027: not yet public.** The provisional timetable went on Direct at the end of May 2026, for logged-in centres only. The Monthly calendar 2026 says the final "June 2027 series available from Direct" at the end of October 2026 (https://www.cambridgeinternational.org/Images/746010-monthly-calendar-2026-international-.pdf).
- **November 2027: not yet published.** The provisional version is due on Direct at the end of October 2026. The final version is due around late March 2027.

**Contingency day:** I found **no Cambridge contingency day**. No timetable, handbook, or key-dates document mentions one, unlike the UK JCQ boards. Cambridge's disruption mechanism is a timetable deviation, which must be "no more than 24 hours after the Key Time of the timetabled session". Otherwise schools use special consideration or re-enter candidates in the next series ("Advice for severe weather, political unrest and natural disasters", https://www.cambridgeinternational.org/Images/347210-advice-regarding-severe-weather-political-unrest-and-natural-disasters.pdf). This is an absence of evidence, flagged as such.

**Windowed (non-timetabled) components:** speaking tests, art & design, some practicals, and coursework run in multi-week "test date windows" listed at the front of each timetable. **Key Times do not apply to them** (Handbook 2026: "Key Times do not apply for windowed exams, for example, speaking tests, art & design exams"). For these, discussion is embargoed "until … end of the assessment window has passed" (see §6). One detail: some IGCSE ICT practicals appear as single-date "windows", for example 0417/21 on 01/04/2026–01/04/2026.

---

## 2. Administrative zones

**Definition.** "An administrative zone is a part of the world where the clocks read similar times. We have six administrative zones and allocate every school to one depending on which country they are in. We publish a different version of the timetable and Cambridge Guide to Making Entries for each administrative zone for each series." (Help centre: https://help.cambridgeinternational.org/hc/en-gb/articles/29506176260242. Reached through the Zendesk API at `/api/v2/help_center/en-gb/articles/29506176260242.json`, because the HTML page returns 403 to scripts.)

- **"Timetable zone" = administrative zone.** Each zone has exactly one timetable version per series. The only extra version is the **UK timetable**, a Zone 3 variant. **[computed]** Its June 2026 exam rows are identical to the Zone 3 timetable (428 rows, same codes, dates and sessions).
- Zones have colour codes (Z1 orange, Z2 red, Z3 green, Z4 lilac, Z5 blue, Z6 yellow), from the zone-lookup response text.
- **Zones are assigned by country, or by state/province, and not by UTC offset.** Some counter-intuitive examples: Saudi Arabia, Qatar, Kuwait, Bahrain and Kenya (UTC+3) are **Zone 3**, but Moscow (UTC+3) is **Zone 4**. Oman, UAE and Mauritius (UTC+4) are **Zone 4**. Jakarta (UTC+7) is **Zone 4**, but Bali/Makassar (UTC+8) is **Zone 5**. Thailand and Vietnam (UTC+7) are **Zone 4**. So **the model must store location → zone explicitly** and must not derive it from a timezone.

**Split countries** (from the Nov 2026 key-times widget, which is per state/province):
- **USA:** Pacific, Mountain and Central states (CA, WA, AZ, TX, IL, AL, AR, LA, MS) are **Zone 1**. Eastern states (NY, NJ, PA, MA, CT, DE, DC, MD, VA, NC, SC, GA, KY, IN) are **Zone 2**. Nebraska is listed as Zone 2, which looks odd; flagged. **Florida, Tennessee and Michigan "span zones"**, with this note: "Your state crosses two administration zones, so your Key Time depends on where your centre sits… In UTC, Zone 1 is 17:00 morning and 21:00 afternoon; Zone 2 is 13:00 morning and 17:00 afternoon." The Michigan note says the western Upper Peninsula is Zone 1 and the rest is Zone 2.
- **Canada:** Alberta, BC and Manitoba (Winnipeg) are Zone 1. Ontario, Quebec, Halifax and St John's are Zone 2.
- **Indonesia:** WIB provinces (Jakarta, Java, Sumatra, West Kalimantan, Banten, Riau) are **Zone 4**. WITA/WIT provinces (Bali, East Kalimantan, Sulawesi, Nusa Tenggara, Jayapura) are **Zone 5**.
- **Brazil:** all Zone 2. **Mexico:** all Zone 1. **Australia:** all Zone 5. **New Zealand:** all Zone 6. **Spain:** all Zone 3, including the Canary Islands.

**Large-population countries** (zone plus local key times AM/PM[/EV], from the Cambridge tools):

| Country | Zone | Local key times (AM / PM / EV) |
|---|---|---|
| Pakistan | 4 | 10:00 / 14:00 / 18:00 PKT |
| India | 4 | 10:30 / 14:30 / 18:30 IST |
| Sri Lanka | 4 | 10:30 / 14:30 / 18:30 |
| Bangladesh | 4 | 11:00 / 15:00 / 19:00 |
| UAE | 4 | 09:00 / 13:00 / 17:00 |
| Oman | 4 | 09:00 / 13:00 / 17:00 |
| Mauritius | 4 | 09:00 / 13:00 / 17:00 |
| Nepal | 4 | 10:45 / 14:45 / 18:45 |
| Indonesia (Jakarta/WIB) | 4 | 12:00 / 16:00 / 20:00 |
| Indonesia (WITA, e.g. Bali, Makassar) | 5 | 09:00 / 13:00 / 17:00 |
| Thailand, Vietnam, Cambodia | 4 | 12:00 / 16:00 / 20:00 |
| Egypt | 3 | 11:00 / 15:00 (12:00 / 16:00 during Egyptian DST) |
| Nigeria | 3 | 10:00 / 14:00 |
| Kenya | 3 | 12:00 / 16:00 |
| Saudi Arabia, Qatar, Kuwait, Bahrain | 3 | 12:00 / 16:00 |
| UK | 3 | 09:00 / 13:00 GMT; **10:00 / 14:00 BST** |
| South Africa | 3 | 11:00 / 15:00 |
| Türkiye | 3 | 12:00 / 16:00 |
| USA (Eastern) | 2 | 08:00 / 12:00 EST; 09:00 / 13:00 EDT |
| USA (Central, e.g. TX, IL) | 1 | 11:00 / 15:00 CST; 12:00 / 16:00 CDT |
| USA (Pacific, e.g. CA) | 1 | 09:00 / 13:00 PST; 10:00 / 14:00 PDT |
| Brazil (São Paulo) | 2 | 10:00 / 14:00 |
| Argentina | 2 | 10:00 / 14:00 |
| China, Hong Kong, Malaysia, Singapore, Philippines, Taiwan | 5 | 09:00 / 13:00 / 17:00 |
| Japan, South Korea | 5 | 10:00 / 14:00 / 18:00 |
| Australia (NSW/VIC) | 5 | 11:00 / 15:00 / 19:00 (12:00 / 16:00 / 20:00 DST) |
| New Zealand | 6 | 09:00 / 13:00 NZST; 10:00 / 14:00 NZDT |

**Full zone → location table.** This is every location in Cambridge's zone-lookup dropdown. I obtained it by calling the page's own backend, `POST https://www.cambridgeinternational.org/administrativezonesearch/getzones/`, once for each of the 266 locations (page: https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/administrative-zone/):

**Zone 1** (Orange; 26 locations): Belize, Belize; Canada, Edmonton; Canada, Vancouver; Canada, Winnipeg; Cayman Islands, Cayman; Colombia, Bogota; Costa Rica, Costa Rica; Ecuador, Guayaquil; El Salvador, El Salvador; French Polynesia, Marquesas; Guatemala, Guatemala; Haiti, Port-au-Prince; Honduras, Tegucigalpa; Jamaica, Jamaica; Mexico, Chihuahua; Mexico, Mexico City; Mexico, Tijuana; Nicaragua, Managua; Panama, Panama; Peru, Lima; Pitcairn, Pitcairn; United States, Anchorage; United States, Chicago; United States, Denver; United States, Los Angeles; United States, Phoenix

**Zone 2** (Red; 47 locations): Åland Islands, Mariehamn; Anguilla, Anguilla; Antigua and Barbuda, Antigua; Argentina, Buenos Aires; Aruba, Aruba; Bahamas, Nassau; Barbados, Barbados; Bermuda, Bermuda; Bolivia, La Paz; Brazil, Boa Vista; Brazil, Noronha; Brazil, Rio Branco; Brazil, Sao Paulo; British Virgin Islands, Tortola; Canada, Halifax; Canada, Montreal; Canada, St Johns; Cape Verde, Cape Verde; Chile, Santiago; Cuba, Havana; Dominica, Dominica; Dominican Republic, Santo Domingo; Falkland Islands, Stanley; French Guiana, Cayenne; Greenland, Godthab; Greenland, Scoresbysund; Greenland, Thule; Grenada, Grenada; Guadeloupe, Guadeloupe; Guyana, Guyana; Martinique, Martinique; Montserrat, Montserrat; Netherlands Antilles, Curacao; Paraguay, Asuncion; Puerto Rico, Puerto Rico; Saint Barthélemy, St Barthélemy; Saint Kitts and Nevis, St Kitts; Saint Lucia, St Lucia; Saint Pierre and Miquelon, Miquelon; Saint Vincent and the Grenadines, St Vincent; Suriname, Paramaribo; Trinidad and Tobago, Port of Spain; Turks and Caicos Islands, Grand Turk; United States Virgin Islands, St Thomas; United States, New York; Uruguay, Montevideo; Venezuela, Caracas

**Zone 3** (Green; 118 locations): Albania, Tirane; Algeria, Algiers; Andorra, Andorra; Angola, Luanda; Ascension Islands, Georgetown; Austria, Vienna; Bahrain, Bahrain; Belarus, Minsk; Belgium, Brussels; Benin, Porto-Novo; Bosnia and Herzegovina, Sarajevo; Botswana, Gaborone; Bulgaria, Sofia; Burkina Faso, Ouagadougou; Burundi, Bujumbura; Cameroon, Douala; Canary Islands, Canary; Central African Republic, Bangui; Chad, Ndjamena; Comoros, Comoro; Côte d'Ivoire, Abidjan; Croatia, Zagreb; Cyprus, Nicosia; Czech Republic, Prague; Democratic Republic of the Congo, Kinshasa; Democratic Republic of the Congo, Lubumbashi; Denmark, Copenhagen; Djibouti, Djibouti; Egypt, Cairo; Equatorial Guinea, Malabo; Eritrea, Asmara; Estonia, Tallinn; Eswatini, Mbabane; Ethiopia, Addis Ababa; Faroe Islands, Faroe; Finland, Helsinki; France, Paris; Gabon, Libreville; Gambia, Banjul; Germany, Berlin; Ghana, Accra; Gibraltar, Gibraltar; Greece, Athens; Greenland, Danmarkshavn; Guernsey, Guernsey; Guinea, Conakry; Guinea-Bissau, Bissau; Hungary, Budapest; Iceland, Reykjavik; Iraq, Baghdad; Ireland, Dublin; Isle of Man, Isle of Man; Israel, Jerusalem; Italy, Rome; Jersey, Jersey; Jordan, Amman; Kenya, Nairobi; Kuwait, Kuwait; Latvia, Riga; Lebanon, Beirut; Lesotho, Maseru; Liberia, Monrovia; Libya, Tripoli; Liechtenstein, Vaduz; Lithuania, Vilnius; Luxembourg, Luxembourg; Madagascar, Antananarivo; Malawi, Blantyre; Mali, Bamako; Malta, Malta; Mauritania, Nouakchott; Mayotte, Mayotte; Moldova, Chisinau; Monaco, Monaco; Montenegro, Podgorica; Morocco, Casablanca; Mozambique, Maputo; Namibia, Windhoek; Netherlands, Amsterdam; Niger, Niamey; Nigeria, Lagos; Norway, Oslo; Palestinian territories, Gaza; Poland, Warsaw; Portugal, Lisbon; Qatar, Qatar; Republic of Macedonia, Skopje; Republic of the Congo, Brazzaville; Romania, Bucharest; Rwanda, Kigali; Saint Helena, St Helena; San Marino, San Marino; São Tomé and Príncipe, Sao Tome; Saudi Arabia, Riyadh; Senegal, Dakar; Serbia, Belgrade; Sierra Leone, Freetown; Slovakia, Bratislava; Slovenia, Ljubljana; Somalia, Mogadishu; South Africa, Johannesburg; Spain, Madrid; Sudan, Khartoum; Sweden, Stockholm; Switzerland, Zurich; Syria, Damascus; Tanzania, Dar es Salaam; Togo, Lome; Tunisia, Tunis; Türkiye, Istanbul; Uganda, Kampala; Ukraine, Kiev; United Kingdom, London; Vatican City, Vatican; Western Sahara, El Aaiun; Yemen, Aden; Zambia, Lusaka; Zimbabwe, Harare

**Zone 4** (Lilac; 34 locations): Afghanistan, Kabul; Armenia, Yerevan; Azerbaijan, Baku; Bangladesh, Dhaka; Bhutan, Thimphu; British Indian Ocean Territory, Chagos; Cambodia, Phnom Penh; Christmas Island, Christmas; Cocos (Keeling) Islands, Cocos; French Southern Territories, Kerguelen; Georgia (country), Tbilisi; India, Kolkata; Indonesia, Jakarta; Iran, Tehran; Kazakhstan, Almaty; Kazakhstan, Oral; Kyrgyzstan, Bishkek; Laos, Vientiane; Maldives, Maldives; Mauritius, Mauritius; Myanmar, Rangoon; Nepal, Katmandu; Oman, Muscat; Pakistan, Karachi; Réunion, Reunion; Russia, Moscow; Seychelles, Mahe; Sri Lanka, Colombo; Tajikistan, Dushanbe; Thailand, Bangkok; Turkmenistan, Ashgabat; United Arab Emirates, Dubai; Uzbekistan, Samarkand; Viet Nam, Ho Chi Minh

**Zone 5** (Blue; 29 locations): Australia, Adelaide; Australia, Eucla; Australia, Lord Howe; Australia, Perth; Australia, Sydney; Brunei Darussalam Brunei; China, Shanghai; China, Hong Kong SAR; China, Macau SAR; Federated States of Micronesia, Kosrae; Federated States of Micronesia, Truk; Guam, Guam; Indonesia, Jayapura; Indonesia, Makassar; Japan, Tokyo; Malaysia, Kuala Lumpur; Mongolia, Ulaanbaatar; New Caledonia, Noumea; North Korea, Pyongyang; Northern Mariana Islands, Saipan; Palau, Palau; Papua New Guinea, Port Moresby; Philippines, Manila; Singapore, Singapore; Solomon Islands, Guadalcanal; South Korea, Seoul; Taiwan, Taipei; Timor-Leste, Dili; Vanuatu, Efate

**Zone 6** (Yellow; 12 locations): Fiji, Fiji; Kiribati, Enderbury; Kiribati, Kiritimati; Kiribati, Tarawa; Marshall Islands, Kwajalein; Nauru, Nauru; New Zealand, Auckland; New Zealand, Chatham; Norfolk Island, Norfolk; Tonga, Tongatapu; Tuvalu, Funafuti; Wallis and Futuna, Wallis

Anomalies in Cambridge's lookup data (flagged):
- **Åland Islands (Finland) → Zone 2**, with a 09:00 UTC AM key time, which is Zone 3's slot. This is almost certainly a data error; it should be Zone 3.
- **Liberia** is the only Zone 3 location returned with an **Evening** key time (15:00 UTC). The Handbook says evening sessions exist only in Zones 4 and 5, so this is probably also an error.
- The older lookup tool and the newer Nov 2026 widget disagree on local times for **Jordan and Syria** (12:00 vs 11:00) and **Morocco** (09:00 vs 10:00). These are timezone-rule changes, not zone changes: Jordan and Syria moved to permanent UTC+3 in 2022, and Morocco uses UTC+1 except during Ramadan. The widget has an explicit "Ramadan" column for Morocco. **Lesson: store UTC key times and convert with the IANA tz database. Do not store Cambridge's local times.**
- The newer widget omits Russia and many small territories that the older tool includes. It says "Key Time data current as of February 2026."

**Do zone memberships change between series?** There is no evidence of a country changing zone between June and November. The help centre says "The Key Times will remain the same indefinitely" (https://help.cambridgeinternational.org/hc/en-gb/articles/29505758799506). There are two caveats:
1. In the **March series, Romania (a Zone 3 country) uses Zone 4's UTC key times.** The March 2027 supplement says: "The Key Times for schools in Romania are: Morning session: 07:00 Eastern European Standard Time (05:00 Greenwich Mean Time / Coordinated Universal Time); Afternoon session: 11:00 Eastern European Standard Time (09:00 GMT/UTC)" (https://www.cambridgeinternational.org/Images/403459-cambridge-handbook-supplement.pdf). **So key times are effectively per (series, location)**, not only per zone.
2. Handbook 2026, clause D5: "You must comply with any request from us to reschedule assessments from the times previously published to ensure the integrity and security of assessments."

**Sub-zones and special cases:** the UK timetable (a Zone 3 copy with UK-specific notes), states that span zones (FL, TN, MI), and split countries (US, Canada, Indonesia). There are no formal "sub-zones" beyond these.

---

## 3. Key times and session timing

### Definitions (primary quotes)
- Handbook 2026, p.22 (https://www.cambridgeinternational.org/Images/746922-cambridge-handbook-2026.pdf): "Key Times are a defined point in a timetabled session when candidates must be in the exam or under Full Centre Supervision. Key Times do not apply for windowed exams… **You can choose when your exams start as long as you make sure that your candidates are in the exam or under Full Centre Supervision at the Key Time.**" and "We timetable all our exams in morning and afternoon sessions (and an **evening session for administrative zones 4 and 5**)."
- Handbook 2026: "In any session, you can also choose to start your exam after the Key Time, or finish your exam before the Key Time. If you do this, you must make sure candidates are under Full Centre Supervision until the Key Time has passed." And: "Candidates must not leave the exam before the Key Time. If an exam ends at the Key Time, candidates can leave the exam room shortly after, as soon as the Key Time has passed."
- Full Centre Supervision (FCS) means no phones or devices, no contact outside the supervised group, and at least 1 supervisor per 30 candidates. "NEW … when timetabling exams, you must limit the length of time that candidates spend under Full Centre Supervision to minimise the risk to question paper security and candidate wellbeing."
- Sessions: "We timetable our exams in either the morning (before 12:00) or afternoon session (after 12:00)… As long as you follow our Key Time regulations you can timetable your exams at any time within the relevant morning or afternoon session." (help article 29506176260242). This is informal: in Zone 3 Gulf and East Africa the *morning* key time is 12:00 local.
- Every timetable PDF says: "Exams must be taken in the morning (AM), afternoon (PM) or evening (EV) session as shown on this timetable and in accordance with the Key Time regulations… If centres timetable exams after the Key Time, candidates must be kept under Full Centre Supervision from the Key Time until the candidates start the exam. If the candidates have already completed the exam before the Key Time, they must be kept under Full Centre Supervision until the Key Time."

### Key times are fixed in UTC per zone and session, and do not move with DST
Cambridge's key-times backend (`POST /keytimessearch/getkeytimes/`, page https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/key-times/) returns a local time, a DST-adjusted local time, and a "Key Time GMT/UTC" value. **[computed]** Across all 266 locations, the UTC value depends only on zone and session:

| Zone | AM key (UTC) | PM key (UTC) | EV key (UTC) | Notes |
|---|---|---|---|---|
| 1 | **17:00** | **21:00** | none | e.g. LA 09:00/13:00 PST (10:00/14:00 PDT); Chicago/Mexico City 11:00/15:00; Lima/Bogotá 12:00/16:00 |
| 2 | **13:00** | **17:00** | none | e.g. New York 08:00/12:00 EST (09:00/13:00 EDT); São Paulo 10:00/14:00 |
| 3 | **09:00** | **13:00** | none (Handbook) | e.g. London 09:00/13:00 GMT, 10:00/14:00 BST; Lagos 10:00/14:00; Riyadh/Nairobi 12:00/16:00 |
| 4 | **05:00** | **09:00** | **13:00** | e.g. Karachi 10:00/14:00/18:00; India 10:30/14:30/18:30; Dubai 09:00/13:00/17:00 |
| 5 | **01:00** | **05:00** | **09:00** | e.g. Singapore/KL/Shanghai 09:00/13:00/17:00; Tokyo 10:00/14:00/18:00 |
| 6 | **21:00 on the previous UTC day** | **01:00** | none | e.g. Auckland 09:00/13:00 NZST (10:00/14:00 NZDT) |

Corroboration:
- The Nov 2026 widget note says "In UTC, Zone 1 is 17:00 morning and 21:00 afternoon; Zone 2 is 13:00 morning and 17:00 afternoon."
- The Handbook 2026 UK Supplement gives the UK key times as "June series: 10:00 BST and 14:00 BST; November series before the clocks go back: 10:00 BST and 14:00 BST; November series after the clocks go back: 09:00 GMT and 13:00 GMT" (https://www.cambridgeinternational.org/Images/746923-cambridge-handbook-uk-supplement-2026.pdf). That is 09:00/13:00 UTC in every case.
- The help centre says "Schools are responsible for making sure that any local Daylight Saving Time (DST) is allowed for" (https://help.cambridgeinternational.org/hc/en-gb/articles/29505938086930).
- **[computed]** In the June 2026 timetables, 902 of 950 component variants are sat by all their zones at exactly one UTC instant under this table. In Nov 2026 the figure is 773 of 868. That strongly confirms the UTC model.

**So there is a global ladder of six UTC "slots", 4 hours apart. Each zone uses 2 or 3 consecutive slots:**

| UTC slot | Sessions sitting at this instant |
|---|---|
| 01:00 | Z5 AM, Z6 PM |
| 05:00 | Z4 AM, Z5 PM |
| 09:00 | Z3 AM, Z4 PM, Z5 EV |
| 13:00 | Z2 AM, Z3 PM, Z4 EV |
| 17:00 | Z1 AM, Z2 PM |
| 21:00 | Z1 PM, Z6 AM (Z6's local date is the next calendar day) |

**Does this differ June vs November?** In UTC, no. In local time, yes, wherever DST applies (UK, EU, US, Chile, NZ, AU, Egypt, etc.). Some DST changes fall *inside* the November series: EU/UK on 25 Oct 2026 and US on 1 Nov 2026 (dates from the tool). So a given school's local key time changes mid-series. The UK supplement notes the JCQ 13:30 afternoon start no longer covers the key time after the clocks go back.

**Full per-country local key times** (Nov 2026 widget, standard time / DST; the data behind https://help.cambridgeinternational.org/hc/en-gb/articles/38915385583378):

**Zone 1**: Belize 11:00/15:00; Cayman Islands 12:00/16:00; Colombia 12:00/16:00; Costa Rica 11:00/15:00; Ecuador 12:00/16:00; El Salvador 11:00/15:00; Guatemala 11:00/15:00; Honduras 11:00/15:00; Jamaica 12:00/16:00; Panama 12:00/16:00; Peru 12:00/16:00; United States of America – Florida [spans zones] 11:00/15:00 (DST: 12:00/16:00); United States of America – Tennessee [spans zones] 11:00/15:00 (DST: 12:00/16:00); United States of America – Alabama 11:00/15:00 (DST: 12:00/16:00); United States of America – Arizona 10:00/14:00; United States of America – Arkansas 11:00/15:00 (DST: 12:00/16:00); United States of America – California 09:00/13:00 (DST: 10:00/14:00); United States of America – Illinois 11:00/15:00 (DST: 12:00/16:00); United States of America – Louisiana 11:00/15:00 (DST: 12:00/16:00); United States of America – Michigan [spans zones] 11:00/15:00 (DST: 12:00/16:00); United States of America – Mississippi 11:00/15:00 (DST: 12:00/16:00); United States of America – Texas 11:00/15:00 (DST: 12:00/16:00); United States of America – Washington 09:00/13:00 (DST: 10:00/14:00); Canada – Alberta 10:00/14:00 (DST: 11:00/15:00); Canada – British Columbia 09:00/13:00 (DST: 10:00/14:00); Mexico – Mexico City 11:00/15:00; Mexico – Mexico State 11:00/15:00; Mexico – Queretaro 11:00/15:00; Mexico – Quintana Roo 12:00/16:00; Mexico – Yucatan 11:00/15:00

**Zone 2**: Antigua and Barbuda 09:00/13:00; Argentina 10:00/14:00; Bahamas 08:00/12:00 (DST: 09:00/13:00); Barbados 09:00/13:00; Bermuda 09:00/13:00 (DST: 10:00/14:00); Bolivia 09:00/13:00; Chile 09:00/13:00 (DST: 10:00/14:00); Cuba 08:00/12:00 (DST: 09:00/13:00); Curacao 09:00/13:00; Dominica 09:00/13:00; Dominican Republic 09:00/13:00; Falkland Islands 10:00/14:00; Grenada 09:00/13:00; Guyana 09:00/13:00; Montserrat 09:00/13:00; Paraguay 10:00/14:00; Saint Kitts and Nevis 09:00/13:00; Sint Maarten 09:00/13:00; St. Vincent And The Grenadines 09:00/13:00; Trinidad and Tobago 09:00/13:00; Turks and Caicos Islands 08:00/12:00 (DST: 09:00/13:00); Uruguay 10:00/14:00; Venezuela 09:00/13:00; Virgin Islands (U.S.) 09:00/13:00; United States of America – Florida [spans zones] 08:00/12:00 (DST: 09:00/13:00); United States of America – Tennessee [spans zones] 08:00/12:00 (DST: 09:00/13:00); United States of America – Michigan [spans zones] 08:00/12:00 (DST: 09:00/13:00); United States of America – Connecticut 08:00/12:00 (DST: 09:00/13:00); United States of America – Delaware 08:00/12:00 (DST: 09:00/13:00); United States of America – District of Columbia 08:00/12:00 (DST: 09:00/13:00); United States of America – Georgia 08:00/12:00 (DST: 09:00/13:00); United States of America – Indiana 08:00/12:00 (DST: 09:00/13:00); United States of America – Kentucky 08:00/12:00 (DST: 09:00/13:00); United States of America – Maryland 08:00/12:00 (DST: 09:00/13:00); United States of America – Massachusetts 08:00/12:00 (DST: 09:00/13:00); United States of America – Nebraska 07:00/11:00 (DST: 08:00/12:00); United States of America – New Jersey 08:00/12:00 (DST: 09:00/13:00); United States of America – New York 08:00/12:00 (DST: 09:00/13:00); United States of America – North Carolina 08:00/12:00 (DST: 09:00/13:00); United States of America – Pennsylvania 08:00/12:00 (DST: 09:00/13:00); United States of America – South Carolina 08:00/12:00 (DST: 09:00/13:00); United States of America – Virginia 08:00/12:00 (DST: 09:00/13:00); Canada – Ontario 08:00/12:00 (DST: 09:00/13:00); Canada – Quebec 08:00/12:00 (DST: 09:00/13:00); Brazil – Amazonas 09:00/13:00; Brazil – Bahia 10:00/14:00; Brazil – Distrito Federal 10:00/14:00; Brazil – Espirito Santo 10:00/14:00; Brazil – Goias 10:00/14:00; Brazil – Mato Grosso 09:00/13:00; Brazil – Minas Gerais 10:00/14:00; Brazil – Parana 10:00/14:00; Brazil – Pernambuco 10:00/14:00; Brazil – Rio Grande do Sul 10:00/14:00; Brazil – Rio de Janeiro 10:00/14:00; Brazil – Santa Catarina 10:00/14:00; Brazil – Sao Paulo 10:00/14:00; Brazil – Tocantins 10:00/14:00

**Zone 3**: Albania 10:00/14:00 (DST: 11:00/15:00); Algeria 10:00/14:00; Andorra 10:00/14:00 (DST: 11:00/15:00); Angola 10:00/14:00; Austria 10:00/14:00 (DST: 11:00/15:00); Bahrain 12:00/16:00; Belgium 10:00/14:00 (DST: 11:00/15:00); Benin 10:00/14:00; Bosnia and Herzegovina 10:00/14:00 (DST: 11:00/15:00); Botswana 11:00/15:00; Bulgaria 11:00/15:00 (DST: 12:00/16:00); Cameroon 10:00/14:00; Cote d'Ivoire 09:00/13:00; Croatia 10:00/14:00 (DST: 11:00/15:00); Cyprus 11:00/15:00 (DST: 12:00/16:00); Czech Republic 10:00/14:00 (DST: 11:00/15:00); Denmark 10:00/14:00 (DST: 11:00/15:00); Egypt 11:00/15:00 (DST: 12:00/16:00); Eritrea 12:00/16:00; Estonia 11:00/15:00 (DST: 12:00/16:00); Eswatini 11:00/15:00; Ethiopia 12:00/16:00; Finland 11:00/15:00 (DST: 12:00/16:00); France 10:00/14:00 (DST: 11:00/15:00); Gambia 09:00/13:00; Germany 10:00/14:00 (DST: 11:00/15:00); Ghana 09:00/13:00; Gibraltar 10:00/14:00 (DST: 11:00/15:00); Greece 11:00/15:00 (DST: 12:00/16:00); Hungary 10:00/14:00 (DST: 11:00/15:00); Iceland 09:00/13:00; Iraq 12:00/16:00; Ireland 09:00/13:00 (DST: 10:00/14:00); Israel 11:00/15:00 (DST: 12:00/16:00); Italy 10:00/14:00 (DST: 11:00/15:00); Jordan 11:00/15:00; Kenya 12:00/16:00; Kosovo 10:00/14:00 (DST: 11:00/15:00); Kuwait 12:00/16:00; Latvia 11:00/15:00 (DST: 12:00/16:00); Lebanon 11:00/15:00 (DST: 12:00/16:00); Lesotho 11:00/15:00; Libya 11:00/15:00; Lithuania 11:00/15:00 (DST: 12:00/16:00); Luxembourg 10:00/14:00 (DST: 11:00/15:00); Macedonia 10:00/14:00 (DST: 11:00/15:00); Madagascar 12:00/16:00; Malawi 11:00/15:00; Malta 10:00/14:00 (DST: 11:00/15:00); Moldova 11:00/15:00 (DST: 12:00/16:00); Monaco 10:00/14:00 (DST: 11:00/15:00); Montenegro 10:00/14:00 (DST: 11:00/15:00); Morocco 10:00/14:00 (Ramadan: 09:00/13:00); Mozambique 11:00/15:00; Namibia 11:00/15:00; Nigeria 10:00/14:00; Norway 10:00/14:00 (DST: 11:00/15:00); Palestine 11:00/15:00 (DST: 12:00/16:00); Poland 10:00/14:00 (DST: 11:00/15:00); Portugal 09:00/13:00 (DST: 10:00/14:00); Qatar 12:00/16:00; Romania 11:00/15:00 (DST: 12:00/16:00); Rwanda 11:00/15:00; Saint Helena 09:00/13:00; Saudi Arabia 12:00/16:00; Senegal 09:00/13:00; Serbia 10:00/14:00 (DST: 11:00/15:00); Sierra Leone 09:00/13:00; Slovakia 10:00/14:00 (DST: 11:00/15:00); Slovenia 10:00/14:00 (DST: 11:00/15:00); South Africa 11:00/15:00; Sweden 10:00/14:00 (DST: 11:00/15:00); Switzerland 10:00/14:00 (DST: 11:00/15:00); Syria 11:00/15:00; Tanzania 12:00/16:00; The Netherlands 10:00/14:00 (DST: 11:00/15:00); Togo 09:00/13:00; Tunisia 10:00/14:00; Türkiye 12:00/16:00; Uganda 12:00/16:00; Ukraine 11:00/15:00 (DST: 12:00/16:00); United Kingdom 09:00/13:00 (DST: 10:00/14:00); Yemen 12:00/16:00; Zambia 11:00/15:00; Zimbabwe 11:00/15:00; Spain – A Coruña 10:00/14:00 (DST: 11:00/15:00); Spain – Alicante 10:00/14:00 (DST: 11:00/15:00); Spain – Almería 10:00/14:00 (DST: 11:00/15:00); Spain – Asturias 10:00/14:00 (DST: 11:00/15:00); Spain – Baleares 10:00/14:00 (DST: 11:00/15:00); Spain – Barcelona 10:00/14:00 (DST: 11:00/15:00); Spain – Burgos 10:00/14:00 (DST: 11:00/15:00); Spain – Cantabria 10:00/14:00 (DST: 11:00/15:00); Spain – Castellón 10:00/14:00 (DST: 11:00/15:00); Spain – Cuenca 10:00/14:00 (DST: 11:00/15:00); Spain – Cáceres 10:00/14:00 (DST: 11:00/15:00); Spain – Cádiz 10:00/14:00 (DST: 11:00/15:00); Spain – Córdoba 10:00/14:00 (DST: 11:00/15:00); Spain – Granada 10:00/14:00 (DST: 11:00/15:00); Spain – Guadalajara 10:00/14:00 (DST: 11:00/15:00); Spain – Las Palmas 09:00/13:00 (DST: 10:00/14:00); Spain – León 10:00/14:00 (DST: 11:00/15:00); Spain – Madrid 10:00/14:00 (DST: 11:00/15:00); Spain – Murcia 10:00/14:00 (DST: 11:00/15:00); Spain – Málaga 10:00/14:00 (DST: 11:00/15:00); Spain – Palencia 10:00/14:00 (DST: 11:00/15:00); Spain – Pontevedra 10:00/14:00 (DST: 11:00/15:00); Spain – Salamanca 10:00/14:00 (DST: 11:00/15:00); Spain – Santa Cruz de Tenerife 09:00/13:00 (DST: 10:00/14:00); Spain – Segovia 10:00/14:00 (DST: 11:00/15:00); Spain – Sevilla 10:00/14:00 (DST: 11:00/15:00); Spain – Tarragona 10:00/14:00 (DST: 11:00/15:00); Spain – Valencia 10:00/14:00 (DST: 11:00/15:00); Spain – Valladolid 10:00/14:00 (DST: 11:00/15:00); Spain – Vizcaya 10:00/14:00 (DST: 11:00/15:00); Spain – Zaragoza 10:00/14:00 (DST: 11:00/15:00); Spain – Ávila 10:00/14:00 (DST: 11:00/15:00)

**Zone 4**: Afghanistan 09:30/13:30/17:30; Armenia 09:00/13:00/17:00; Azerbaijan 09:00/13:00/17:00; Bangladesh 11:00/15:00/19:00; Bhutan 11:00/15:00/19:00; Cambodia 12:00/16:00/20:00; Georgia 09:00/13:00/17:00; India 10:30/14:30/18:30; Iran 08:30/12:30/16:30; Kazakhstan 10:00/14:00/18:00; Kyrgyzstan 11:00/15:00/19:00; Laos 12:00/16:00/20:00; Maldives 10:00/14:00/18:00; Mauritius 09:00/13:00/17:00; Myanmar 11:30/15:30/19:30; Nepal 10:45/14:45/18:45; Oman 09:00/13:00/17:00; Pakistan 10:00/14:00/18:00; Seychelles 09:00/13:00/17:00; Sri Lanka 10:30/14:30/18:30; Tajikistan 10:00/14:00/18:00; Thailand 12:00/16:00/20:00; United Arab Emirates 09:00/13:00/17:00; Uzbekistan 10:00/14:00/18:00; Vietnam 12:00/16:00/20:00; Indonesia – Aceh 12:00/16:00/20:00; Indonesia – Banten 12:00/16:00/20:00; Indonesia – Central Java 12:00/16:00/20:00; Indonesia – East Java 12:00/16:00/20:00; Indonesia – Jakarta Special Capital Region 12:00/16:00/20:00; Indonesia – Jambi 12:00/16:00/20:00; Indonesia – Lampung 12:00/16:00/20:00; Indonesia – North Sumatra 12:00/16:00/20:00; Indonesia – Riau 12:00/16:00/20:00; Indonesia – Riau Islands 12:00/16:00/20:00; Indonesia – South Sumatra 12:00/16:00/20:00; Indonesia – Special Region of Yogyakarta 12:00/16:00/20:00; Indonesia – West Java 12:00/16:00/20:00; Indonesia – West Kalimantan 12:00/16:00/20:00

**Zone 5**: Brunei Darussalam 09:00/13:00/17:00; China 09:00/13:00/17:00; Hong Kong, SAR of China 09:00/13:00/17:00; Japan 10:00/14:00/18:00; Macao, SAR of China 09:00/13:00/17:00; Malaysia 09:00/13:00/17:00; Mongolia 09:00/13:00/17:00; Papua New Guinea 11:00/15:00/19:00; Philippines 09:00/13:00/17:00; Singapore 09:00/13:00/17:00; Solomon Islands 12:00/16:00/20:00; South Korea 10:00/14:00/18:00; Taiwan (Province of China) 09:00/13:00/17:00; Indonesia – Bali 09:00/13:00/17:00; Indonesia – East Kalimantan 09:00/13:00/17:00; Indonesia – East Nusa Tenggara 09:00/13:00/17:00; Indonesia – South Sulawesi 09:00/13:00/17:00; Indonesia – Southeast Sulawesi 09:00/13:00/17:00; Indonesia – West Nusa Tenggara 09:00/13:00/17:00; Australia – Australian Capital Territory 11:00/15:00/19:00 (DST: 12:00/16:00/20:00); Australia – New South Wales 11:00/15:00/19:00 (DST: 12:00/16:00/20:00); Australia – Northern Territory 10:30/14:30/18:30; Australia – Queensland 11:00/15:00/19:00; Australia – South Australia 10:30/14:30/18:30 (DST: 11:30/15:30/19:30); Australia – Tasmania 11:00/15:00/19:00 (DST: 12:00/16:00/20:00); Australia – Victoria 11:00/15:00/19:00 (DST: 12:00/16:00/20:00); Australia – Western Australia 09:00/13:00/17:00

**Zone 6**: Fiji 09:00/13:00; Tonga 10:00/14:00; New Zealand – Auckland 09:00/13:00 (DST: 10:00/14:00); New Zealand – Bay of Plenty 09:00/13:00 (DST: 10:00/14:00); New Zealand – Canterbury 09:00/13:00 (DST: 10:00/14:00); New Zealand – Gisborne 09:00/13:00 (DST: 10:00/14:00); New Zealand – Hawke's Bay 09:00/13:00 (DST: 10:00/14:00); New Zealand – Manawatū-Whanganui 09:00/13:00 (DST: 10:00/14:00); New Zealand – Northland 09:00/13:00 (DST: 10:00/14:00); New Zealand – Otago 09:00/13:00 (DST: 10:00/14:00); New Zealand – Southland 09:00/13:00 (DST: 10:00/14:00); New Zealand – Waikato 09:00/13:00 (DST: 10:00/14:00); New Zealand – Wellington 09:00/13:00 (DST: 10:00/14:00)

### Start and end windows, extra time and rest breaks
- **No fixed "must start within X minutes of key time" rule exists** under the 2026 regulations. The only hard rule is: in the exam or under FCS at the key time, and the exam held in the timetabled session. The 2025 Handbook already said "You can start the exam any time within the session, but you must follow our Key Time and Full Centre Supervision regulations". The 2026 Handbook adds a "NEW" instruction to limit time spent under FCS.
- Soft limits from Handbook 2026 §1.2.3(c), given as grounds for applying for a deviation: exams "in the same session lasting a total of more than three hours and 45 minutes in a session, or more than six hours in a day"; "Candidates can sit exams for up to six hours in one day"; "A single period of Full Centre Supervision that is more than four hours long." In practice FCS padding stays at 4 hours or less.
- **Extra time** (Handbook 2026 §1.3.5.4): "extra time up to 25% (this should meet the needs of most candidates)" or "extra time over 25%" with strong justification. "NEW … one or two of the arrangements … 25% extra time … three or more … 50% extra time." For dictating spelling to a scribe in language syllabuses, "up to 100% extra time". **No absolute maximum is stated.**
- **Supervised rest breaks** (§1.3.5.11): "You must not include the length of the break in the time allowed … stop the clock." **No maximum is stated.**
- Listed durations already include reading time: "Any time for candidates to read through question papers … is already included in the total time shown in the timetable. You must not allow any additional time." (every timetable PDF)
- **Late arrivals** (Handbook §5.1.10): a candidate who arrives after the key time *while the exam is still running* may still be allowed to sit. The centre must report it, and Cambridge "may not accept their script". A candidate who arrives after the key time *after the exam has finished* is not allowed to sit.

### Earliest start and latest end for a paper worldwide [computed and inferred]
- Among timetabled sittings, the **first key time** for a paper on a given day is 01:00 UTC (Z5 AM) or 05:00 UTC (Z4 AM). The **last** is 21:00 UTC (Z1 PM or Z6 AM). A paper sat in all six zones in one session-day spans **16 hours from first to last key time** (e.g. 9702/1x June 2026: 05:00 → 21:00 UTC 3 June; Nov 2026: 01:00 → 17:00 UTC 10 Nov). 279 of 447 June paper-sittings and 208 of 384 Nov ones fall in the 4–16 h band.
- **Earliest possible start:** before the first key time by roughly the paper's duration, or more if the centre puts candidates under FCS afterwards. Realistic bound: first key time minus (duration × 1.25) minus about 1 h. Cambridge sets no hard floor beyond "within the morning session".
- **Latest possible end:** the last key time plus any FCS before the start (should be under 4 h), plus duration × (1 + extra time: 25%, 50%, up to 100%), plus rest breaks. Realistic bound for a 2 h paper starting at the last key time with 25% extra: last key + 2.5 h (e.g. 23:30 UTC). Worst case with a **timetable deviation**: up to **24 h after the key time** of the timetabled session, plus duration. The candidate is supervised throughout, possibly overnight.
- **Important security property:** once the last key time for a paper has passed, every candidate worldwide who has not yet finished it is supposed to be either in the exam room or under FCS with no devices. The exceptions are late arrivals (script may be rejected) and deviation candidates (supervised, but sometimes by a "responsible adult" under Form 7 rather than centre staff).

---

## 4. Timetable structure

### Paper identification
- Format: **`SSSS/CV`**, e.g. `9702/42`. `SSSS` is the 4-digit syllabus code (e.g. 0625 IGCSE Physics, 0972 IGCSE (9–1) Physics, 5054 O Level Physics, 9702 AS & A Level Physics). `C` is the **component (paper) number** from the syllabus. `V` is the **variant**.
- Official explanation (help centre, https://help.cambridgeinternational.org/hc/en-gb/articles/29564314813970): "we generally need to produce three different variants of each question paper. Each of these variants will be taken by centres in two of the six administrative zones, whose key times will align for all candidates taking the same variant of a paper… the first digit is the component number given in the syllabus… the second digit is the paper variant specific to your administrative zone for that exam series. For example, component 23 is the third variant of Paper 2. **Be aware that the variant allocated for a zone can vary from series to series and from syllabus to syllabus.**"
- Some components have single-variant codes such as `/01`, `/02` or `/03`, used for low-entry syllabuses (e.g. 8686/02 Urdu, 0448/01 Pakistan Studies). One variant is then sat worldwide at up to three different UTC instants. **[computed]** 8686/02 on 27 Apr 2026 was sat at 09:00, 17:00 and 21:00 UTC.
- **Practicals break the simple "first digit = one paper" rule.** For example, 9702 June 2026 has /31 and /32 as two *different* Advanced Practical Skills papers on different days (28 Apr and 14 May). /33 and /34 are their Zone 4/5 counterparts. /35 is the only Zone 1/6 paper (28 Apr only). **Grouping a component into a "logical paper" therefore cannot be derived from digits alone.** Group by (syllabus, component digit, sitting date cluster), or let the admin define it.

### Variant ↔ zone pairing [computed from all June and Nov 2026 PDFs]
Variants shared by exactly two zones, counted by zone-session pair:
- June 2026: Z3-AM+Z4-PM 182; Z4-AM+Z5-PM 158; Z2-AM+Z3-PM 122; Z1-AM+Z2-PM 119; Z1-PM+Z6-AM 112; Z5-AM+Z6-PM 86. Irregular pairs: Z5-EV+Z6-AM 33 (12 h apart in UTC); Z3-PM+Z4-EV 4.
- Nov 2026: Z3-AM+Z4-PM 174; Z1-AM+Z2-PM 130; Z4-AM+Z5-PM 116; Z5-AM+Z6-PM 114; Z2-AM+Z3-PM 91. Irregular pairs: **Z1-AM+Z6-AM 55** (different UTC instants, sometimes different days); Z1-PM+Z6-AM 32; Z5-EV+Z6-AM 23; Z2-AM+Z3-AM 3; Z4-EV+Z5-AM 3.
- **Which zones pair up changes by syllabus and series.** In June 2026, 9702 used {Z4 AM, Z5 PM} → v2, {Z2 AM, Z3 PM} → v1, and {Z1 PM, Z6 AM} → v3. In Nov 2026, 9702 used {Z5 AM, Z6 PM} → v3, {Z3 AM, Z4 PM} → v2, and {Z1 AM, Z2 PM} → v1.
- The regular pairs share both a variant and a UTC instant. **But not always:** 48 of 950 June variants and 95 of 868 Nov variants are sat at two or more different UTC instants, so a variant can be "exposed" to one zone hours or days before another zone sits the same variant.

### Do all zones sit a paper on the same date and session? Usually on the same UTC day, but often not
- The **session differs by zone** for the same paper (AM in one zone, PM in the paired zone), and Zone 6's local date is +1 when it sits in the AM.
- **[computed] Different dates:** in June 2026, 10 of 447 paper-sittings have zones sitting on dates more than 24 h apart. In **Nov 2026 it is 38 of 384, plus 28 in the 17–24 h band.** Examples:

| Paper | Nov 2026 sittings (UTC key time, zone, code) |
|---|---|
| 9709 Pure Maths 1 | 30 Sep 09:00 Z3/Z4 (/12); 30 Sep 17:00 Z1/Z2 (/11); **13 Oct 01:00 Z5/Z6 (/13)** |
| 9701 Chemistry P4 | **16 Oct 09:00 Z3/Z4 (/42)**; 03 Nov 01:00 Z5/Z6 (/43); 03 Nov 17:00 Z1/Z2 (/41) |
| 0625 Physics P3/P4 | 07 Oct 05:00 Z4/Z5 (/32, /42); 07 Oct 13:00 Z2/Z3 (/31, /41); **21 Oct 21:00 Z1/Z6 (/33, /43)** |
| 0580 Maths P1/P2 | 08 Oct 05:00 Z4/Z5; 08 Oct 13:00 Z2/Z3; **11 Oct 21:00 Z6, 12 Oct 17:00 Z1 (/13, /23)** |
| 0580 Maths P3/P4 | **13 Oct 17:00 Z1, 13 Oct 21:00 Z6 (/33, /43)**, i.e. *before* 14 Oct 05:00 Z4/Z5 and 14 Oct 13:00 Z2/Z3 |
| 0500 First Lang English P1 | 05 Oct 09:00 Z3/Z4; 05 Oct 17:00 Z1/Z2; **19 Oct 01:00 Z5/Z6** |

June 2026 examples: 0607 P1/P2 (Z4/Z5 on 27 Apr; the others on 29 Apr); 0607 P3/P4 (Z4/Z5 on 29 Apr; the others on 4 May); 8021 English General Paper P1 (Z1–3 on 23 Apr, Z6 on 24 Apr local, which is 23 Apr 21:00 UTC; Z4/Z5 on 27 Apr); 0500 P2 (15 May for Z1, Z4, Z5, Z6; 21 May for Z2/Z3).

**Worked example: Physics 9702, June 2026 and Nov 2026** (UTC key time computed from zone and session):


#### june 2026 — 9702
| Code | Zone | Local date | Session | Duration | Key time (UTC) |
|---|---|---|---|---|---|
| 9702/12 | 4 | 2026-06-03 | AM | 1h 15m | Wed 03 Jun 05:00 |
| 9702/12 | 5 | 2026-06-03 | PM | 1h 15m | Wed 03 Jun 05:00 |
| 9702/11 | 2 | 2026-06-03 | AM | 1h 15m | Wed 03 Jun 13:00 |
| 9702/11 | 3 | 2026-06-03 | PM | 1h 15m | Wed 03 Jun 13:00 |
| 9702/13 | 1 | 2026-06-03 | PM | 1h 15m | Wed 03 Jun 21:00 |
| 9702/13 | 6 | 2026-06-04 | AM | 1h 15m | Wed 03 Jun 21:00 |
| 9702/22 | 4 | 2026-05-20 | AM | 1h 15m | Wed 20 May 05:00 |
| 9702/22 | 5 | 2026-05-20 | PM | 1h 15m | Wed 20 May 05:00 |
| 9702/21 | 2 | 2026-05-20 | AM | 1h 15m | Wed 20 May 13:00 |
| 9702/21 | 3 | 2026-05-20 | PM | 1h 15m | Wed 20 May 13:00 |
| 9702/23 | 1 | 2026-05-20 | PM | 1h 15m | Wed 20 May 21:00 |
| 9702/23 | 6 | 2026-05-21 | AM | 1h 15m | Wed 20 May 21:00 |
| 9702/33 | 4 | 2026-04-28 | AM | 2h | Tue 28 Apr 05:00 |
| 9702/33 | 5 | 2026-04-28 | PM | 2h | Tue 28 Apr 05:00 |
| 9702/31 | 2 | 2026-04-28 | AM | 2h | Tue 28 Apr 13:00 |
| 9702/31 | 3 | 2026-04-28 | PM | 2h | Tue 28 Apr 13:00 |
| 9702/35 | 1 | 2026-04-28 | PM | 2h | Tue 28 Apr 21:00 |
| 9702/35 | 6 | 2026-04-29 | AM | 2h | Tue 28 Apr 21:00 |
| 9702/34 | 4 | 2026-05-14 | AM | 2h | Thu 14 May 05:00 |
| 9702/34 | 5 | 2026-05-14 | PM | 2h | Thu 14 May 05:00 |
| 9702/32 | 2 | 2026-05-14 | AM | 2h | Thu 14 May 13:00 |
| 9702/32 | 3 | 2026-05-14 | PM | 2h | Thu 14 May 13:00 |
| 9702/42 | 4 | 2026-05-11 | AM | 2h | Mon 11 May 05:00 |
| 9702/42 | 5 | 2026-05-11 | PM | 2h | Mon 11 May 05:00 |
| 9702/41 | 2 | 2026-05-11 | AM | 2h | Mon 11 May 13:00 |
| 9702/41 | 3 | 2026-05-11 | PM | 2h | Mon 11 May 13:00 |
| 9702/43 | 1 | 2026-05-11 | PM | 2h | Mon 11 May 21:00 |
| 9702/43 | 6 | 2026-05-12 | AM | 2h | Mon 11 May 21:00 |
| 9702/52 | 4 | 2026-05-20 | AM | 1h 15m | Wed 20 May 05:00 |
| 9702/52 | 5 | 2026-05-20 | PM | 1h 15m | Wed 20 May 05:00 |
| 9702/51 | 2 | 2026-05-20 | AM | 1h 15m | Wed 20 May 13:00 |
| 9702/51 | 3 | 2026-05-20 | PM | 1h 15m | Wed 20 May 13:00 |
| 9702/53 | 1 | 2026-05-20 | PM | 1h 15m | Wed 20 May 21:00 |
| 9702/53 | 6 | 2026-05-21 | AM | 1h 15m | Wed 20 May 21:00 |

#### november 2026 — 9702
| Code | Zone | Local date | Session | Duration | Key time (UTC) |
|---|---|---|---|---|---|
| 9702/13 | 5 | 2026-11-10 | AM | 1h 15m | Tue 10 Nov 01:00 |
| 9702/13 | 6 | 2026-11-10 | PM | 1h 15m | Tue 10 Nov 01:00 |
| 9702/12 | 3 | 2026-11-10 | AM | 1h 15m | Tue 10 Nov 09:00 |
| 9702/12 | 4 | 2026-11-10 | PM | 1h 15m | Tue 10 Nov 09:00 |
| 9702/11 | 1 | 2026-11-10 | AM | 1h 15m | Tue 10 Nov 17:00 |
| 9702/11 | 2 | 2026-11-10 | PM | 1h 15m | Tue 10 Nov 17:00 |
| 9702/23 | 5 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 01:00 |
| 9702/23 | 6 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 01:00 |
| 9702/22 | 3 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 09:00 |
| 9702/22 | 4 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 09:00 |
| 9702/21 | 1 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 17:00 |
| 9702/21 | 2 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 17:00 |
| 9702/35 | 5 | 2026-10-08 | AM | 2h | Thu 08 Oct 01:00 |
| 9702/35 | 6 | 2026-10-08 | PM | 2h | Thu 08 Oct 01:00 |
| 9702/33 | 3 | 2026-10-08 | AM | 2h | Thu 08 Oct 09:00 |
| 9702/33 | 4 | 2026-10-08 | PM | 2h | Thu 08 Oct 09:00 |
| 9702/31 | 1 | 2026-10-08 | AM | 2h | Thu 08 Oct 17:00 |
| 9702/31 | 2 | 2026-10-08 | PM | 2h | Thu 08 Oct 17:00 |
| 9702/36 | 5 | 2026-10-22 | AM | 2h | Thu 22 Oct 01:00 |
| 9702/36 | 6 | 2026-10-22 | PM | 2h | Thu 22 Oct 01:00 |
| 9702/34 | 3 | 2026-10-22 | AM | 2h | Thu 22 Oct 09:00 |
| 9702/34 | 4 | 2026-10-22 | PM | 2h | Thu 22 Oct 09:00 |
| 9702/43 | 5 | 2026-10-12 | AM | 2h | Mon 12 Oct 01:00 |
| 9702/43 | 6 | 2026-10-12 | PM | 2h | Mon 12 Oct 01:00 |
| 9702/42 | 3 | 2026-10-12 | AM | 2h | Mon 12 Oct 09:00 |
| 9702/42 | 4 | 2026-10-12 | PM | 2h | Mon 12 Oct 09:00 |
| 9702/41 | 1 | 2026-10-12 | AM | 2h | Mon 12 Oct 17:00 |
| 9702/41 | 2 | 2026-10-12 | PM | 2h | Mon 12 Oct 17:00 |
| 9702/53 | 5 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 01:00 |
| 9702/53 | 6 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 01:00 |
| 9702/52 | 3 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 09:00 |
| 9702/52 | 4 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 09:00 |
| 9702/51 | 1 | 2026-10-14 | AM | 1h 15m | Wed 14 Oct 17:00 |
| 9702/51 | 2 | 2026-10-14 | PM | 1h 15m | Wed 14 Oct 17:00 |


### Durations
Durations are listed as `2h`, `1h 15m`, `45m`, and so on, per component, and are identical across zones for the same paper. They include reading time. The PDFs also mark qualification with `IG`, `9–1`, `OL`, `AS` or `AL`.

---

## 5. Timetable clashes and deviations

- **Same session:** "If a candidate is entered for two papers which are timetabled for the same session they may have a fully supervised break between the two papers. The regulations regarding Key Time and Full Centre Supervision must be followed" (all timetable PDFs). The help centre adds: "the second question paper must not be given out until the time allocated to the first question paper has been allowed and the scripts for the first paper have been collected."
- **Timetable deviation** (Handbook 2026 §1.2.3): it needs written approval, and the application is due at least 4 weeks before the exam. The deadlines are 14 Dec (March), 17 Apr (June) and 21 Sep (November), per Form 2 (https://www.cambridgeinternational.org/Images/731618-timetable-deviation-preparation-form-2.pdf). "We will reject your application if a timetable deviation could put the security of the assessment at risk. This means you must not move an exam: **(i) to an earlier date (ii) more than 24 hours after the Key Time of the timetabled session.**" Also: "The exam moved to the next day must be the exam with the latest Key Time."
  - The 2025 Handbook also forbade moving an exam "so it finishes in an earlier session on the timetabled date". The 2026 international Handbook dropped that clause, but the **2026 UK supplement still has it**. UK centres "do not need to apply for a timetable deviation".
- **Supervision of deviated candidates:** "NEW Candidates with a timetable deviation must still follow our Key Times and Full Centre Supervision regulations." Transport between centres must be under FCS. "The candidate must not access any information about the exam." A responsible adult signs Form 7. **Overnight supervision:** "When no other options are available, we may approve the overnight supervision of candidates."
- **Additional sittings** (large cohorts, §1.2.4): these need approval, and "There must be no contact between groups until all groups have finished the exam."
- **Implication for "safe to discuss":** a legitimately deviated candidate can sit a paper **up to 24 h after the key time of their zone's timetabled session**, and can never sit it before that session's date. Until then they are meant to be supervised with no device access, but that control is only as good as the supervision. **The global worst case for a paper is therefore the last zone's key time + 24 h + duration.** Cambridge's own storage rule uses the same 24 h figure (see §6).

---

## 6. Confidentiality and the social-media rule

**What Cambridge says to candidates (2026)**, from *Information for candidates*, © 2026, created 21 Apr 2026 (https://www.cambridgeinternational.org/images/86457-information-for-candidates.pdf):
> "After the exam — You must not: • Remove any question papers or question paper content from the exam room. • Discuss the content of a question paper of [sic] other confidential material, such as speaking test topics, with any other candidate until either the Key Time or end of the assessment window has passed."

The same document, on FCS: "We have candidates in over 160 countries. It is important that question papers are kept secure… You are not allowed to have mobile phones or use any communication or electronic device, including the internet, during Full Centre Supervision."

**What Cambridge says to centres**, Handbook 2026 §5.3.2, "The 24-hour security rule":
> "Candidates must not remove any question papers or question paper content from the exam room… **NEW Candidates must not discuss the contents of a question paper or other confidential material, such as speaking test topics, with any other candidate until either the Key Time or end of the assessment window has passed.** If they do, this may be considered malpractice (see section 5.6.1). You must apply the 24-hour rule to keep question papers and their contents secure. All unused question papers, answer booklets and any other confidential exam material must be stored in your approved secure storage **until at least 24 hours after the end of the exam or Key Time, whichever is later.** After this time, you can dispose of the unused question papers or return them to candidates / centre staff. NEW However, it is important you do not share question papers or other confidential materials with anyone outside your centre. **These materials must not be uploaded to publicly accessible platforms, social media or chat groups.**"

**Interpretation:**
- The "24 hours" in Cambridge's rules is a **centre storage and release rule for physical question papers**, counted from "the end of the exam or Key Time, whichever is later" *at that centre*. It is **not** a candidate "no discussion for 24 h" rule.
- The **candidate discussion embargo** is "until … the Key Time … has passed" for timetabled exams. It is new in 2026; the 2025 version of *Information for candidates* has no such clause (checked via Wayback, 25 Apr 2025 capture). The wording does not say whose Key Time. Read literally, and in context ("Your Key Times are based on your centre's location"), it is **the candidate's own zone and session key time, not a global one**. A Zone 4 candidate may therefore "legally" discuss a paper at 09:00 UTC, while Zone 1/2 candidates sit their variant at 17:00 or 21:00 UTC. Cambridge relies on the variants being different papers.
- **Posting papers publicly or in chat groups is banned outright** ("must not be uploaded to publicly accessible platforms, social media or chat groups"), with no time limit. That points to a server rule of no photos or copies of question papers, even after the embargo.
- Context: Cambridge's June 2025 leak statement (https://www.cambridgeinternational.org/media-statement/) says parts of 9709/12, 9709/42 and 9618/22 were leaked *before* the exams. The remedy was full marks for those questions. Cambridge warned: "We urge candidates not to engage with anyone claiming to have access to question papers, and that doing so can be malpractice." Dawn (29 Apr 2026, https://www.dawn.com/news/1996140) reports a June 2026 AS Maths leak allegation spread on social media. All three 2025 leaked papers were variant-2 components. Pre-exam leaks are a separate threat from post-exam discussion.

---

## 7. How timetables are published

- **Format:** one **PDF per zone per series, plus a UK PDF**. The PDFs are "interactive": a contents page, a "Test date windows" section, a **weekly view** (day headers such as `Monday 05 October`, then rows `IG  Name  0454/11  1h 30m  AM`), and a **syllabus view (A–Z)** with full dates. Links: https://www.cambridgeinternational.org/exam-administration/cambridge-exams-officers-guide/phase-1-preparation/timetabling-exams/exam-timetables/, e.g.
  - June 2026: `/Images/745755-june-2026-zone-1-timetable.pdf` through `745761-…zone-6…`, with `745757-…zone-3-uk…`
  - Nov 2026: `/Images/757645-november-2026-zone-1-timetable.pdf` through `757651-…zone-6…`, with `757647-…zone-3-uk…`
  - March 2027: `/Images/686092-cambridge-final-examination-timetable.pdf`
- **Machine-readable sources:**
  - **Direct CSV (centre login only):** "Visit the 'Timetables' section of Cambridge International Direct (https://direct.cie.org.uk) to download the exam dates in .csv format or download a timetable which only includes the exams you have made entries for." (every timetable PDF). The Handbook also mentions a "timetable generator on Direct". **There is no public CSV, iCal or JSON timetable.**
  - **Undocumented endpoints behind the public pages** (found in page JS; they return HTML fragments, not JSON):
    - `POST https://www.cambridgeinternational.org/administrativezonesearch/getzones/` with form fields `selectedLocation=<option value, e.g. Karachi>` and `xmlFilename=D:\PrdLivePublic\live\400_CIE.org.uk\Website\App_Data\Zones\KeyTimes.xml` (the hidden field value). Returns the zone.
    - `POST https://www.cambridgeinternational.org/keytimessearch/getkeytimes/` with the same fields. Returns zone, DST dates, and local plus GMT/UTC key times per session.
    - Help-centre article 38915385583378 ("November 2026 – Find your key times") embeds a JSON object `var KT = {"single":{…},"multi":{…}}` with per-country and per-state zone and key times. It is readable through the public Zendesk API: `https://help.cambridgeinternational.org/api/v2/help_center/en-gb/articles/38915385583378.json`.
  - None of these carry exam dates. **Exam dates exist publicly only in the PDFs.** **[computed]** The PDFs parse reliably with `pdftotext -layout` and a regex over the weekly view. I parsed all 14 June/Nov 2026 PDFs this way.
- **Data-quality warning [computed]:** the Nov 2026 **Zone 6** PDF (V1) weekly view has the header "**Saturday 07 October**" where it means **Saturday 07 November** (8238/23, 9482/13). The syllabus view has the correct date. Any importer should check that each weekday matches its date and cross-check against the syllabus view.
- **Lead time** (help centre, https://help.cambridgeinternational.org/hc/en-gb/articles/29505585906194):
  - June series: provisional in May of the previous year; final in October of the previous year.
  - November series: provisional in October of the previous year; final in March of the same year.
  - March series: provisional in April; final in June of the previous year.
  - Provisional versions are on Direct only; finals are public.
  - This is roughly 6 months before each series starts. The video transcript says the final is published "about six months before the start of the exam series".
- **Revisions:** "Sometimes, we need to revise the final timetable after it has been published… You can find the version number at the bottom of the page… We will tell you about any changes… in the Exams Officer eNewsletter" (timetables page). "Once the final timetable has been published any items that appear in red indicate a change from the provisional timetable" (help article). Observed: **June 2026 Zone 2, Zone 3 and UK are "Version 2, January 2026"**, while the other zones are "Version 1, October 2025". I could not retrieve the V1 files to diff them. All Nov 2026 PDFs are "Version 1, April 2026". The March 2027 PDF is "Version 1, July 2026".

---

## 8. Secondary: Pearson Edexcel International A Level (IAL)

- One global timetable of dates, with **no zone variants**: one paper worldwide. Start times are published per country in **UK clock time**, with a local-time column, in separate documents per series.
  - May/June IAL (updated May 2026): https://qualifications.pearson.com/content/dam/pdf/Support/Examination-timetables/Start-Times-for-International-Centres/edexcel-exam-start-times-international-a-levels-may-june-exams.pdf
  - October IAL (updated Aug 2026): `…edexcel-exam-start-times-international-a-levels-october-exams.pdf`
- Pattern: **AM starts at 07:00 UK time** for Africa, Europe and most of the Middle East, and **06:00 UK time** for UTC+4 and further east. **PM starts at 10:00 or 09:00 UK time.** In May/June that is BST, so AM ≈ 05:00–06:00 UTC and PM ≈ 08:00–09:00 UTC. Examples: Pakistan 10:00 and 13:00 local; Hong Kong 13:00 and 16:00; Egypt 09:00 and 12:00.
- "To allow some flexibility, centres can start examinations by up to 30 minutes earlier or later than the published time… For examinations started 30 minutes early, students must still stay under centre supervision until at least one hour after the start time listed below." Larger variations need Pearson approval.
- **For a generic data model:** Pearson looks like a single sitting per paper with a near-simultaneous global start (about a 1 h spread, ±30 min flex). It fits a model of "exam sitting = (paper, group of locations, UTC start or key instant, duration)", where Pearson would have one or two groups and Cambridge up to six zones. The Americas were not listed in the IAL start-time document I read.

---

## 9. Community practice

- **r/IGCSE (subreddit):** the rule, as quoted by a search snippet of a mirror of the rules page, is: "You are only allowed to discuss papers after all the variants have been completed, by making a post on the subreddit. Paper discussion should use available paper discussion threads only…" **Unverified**, because Reddit blocked direct fetches. I could not find the r/alevel rule text.
- **r/IGCSE Discord bot** (TypeScript; "62,000 members… used in 550+ other servers"; https://github.com/r-IGCSE/r-igcse-bot, master pushed 2026-09-28). It has a `/lockdown` command (`src/commands/moderation/Lockdown.ts`, schema `src/mongo/schemas/ChannelLockdown.ts`):
  - `create`: channel, optional `mode: "exam"`, and `lock` and `unlock` as **epoch seconds**. The default is lock now and **unlock after 86,400 s (1 day)**.
  - `remove`.
  - `bulk`: a JSON array of `{channel_id, lock_time, unlock_time, mode}`, where times are an epoch, `"now"`, or a relative value like `"2h"`.
  - It sets `SendMessages`/thread permissions to false for @everyone, rejects overlapping windows, and posts a "locked" GIF in exam mode.
  - **It has no zone, timetable or key-time logic.** Moderators compute the windows by hand. Older versions: https://github.com/Sachin-dot-py/r-igcse-bot and https://github.com/Sachin-dot-py/r-IGCSEBot.

---

## Key design implications

1. **Store UTC key times, not local times.** Model `KeyTimeSlot(series, zone, session) → utc_time_of_day, day_offset`, where Z6 AM has day offset −1. The defaults are the six-slot ladder: Z1 17/21; Z2 13/17; Z3 09/13; Z4 05/09/13; Z5 01/05/09; Z6 21(−1d)/01. Keep it editable per series: the March series uses Z4 slots for Romania, and Cambridge could change them. Convert to users' local time with IANA tz only for display.
2. **Admins should enter (zone, local date, session) and not clock times.** The bot then computes the UTC key instant. Clock times are chosen by each centre and are not published by Cambridge.
3. **The unit to lock is a "paper sitting group", not a component code.** Suggested entities:
   - `Series` (e.g. `2026-11`)
   - `Syllabus` (9702, mapped to one or more Discord channels, with IGCSE and A Level kept separate)
   - `Paper` (logical paper within a syllabus, e.g. "9702 Paper 4"; admin-defined, because practical codes like /31 vs /32 are different papers)
   - `Sitting` (`paper_id, component_code e.g. 9702/42, zone, local_date, session, duration_minutes`)
   Lock intervals come from the set of sittings.
4. **One paper can have sittings days or weeks apart** (Nov 2026: 9709 P1 for Z5/Z6 is 13 days after the others; 9701 P4 is 18 days). This is common in November and occasional in June. Decide the policy explicitly:
   - (a) Lock only around each cluster of sittings, and allow discussion between clusters. Risk: talk about v1/v2 spoils topics for the v3 zones.
   - (b) Lock around each cluster, and keep a softer "no paper-X discussion" rule, or a separate spoiler thread, until the last cluster finishes.
   Do not merge a whole 2-week span into one lock.
5. **Lock window formula** (per cluster, UTC). With `K_first` = earliest key instant and `K_last` = latest:
   - `lock_start = K_first − max_duration × 1.25 − pre_buffer`. Something like 1 h, or longer to cover pre-exam leak sharing.
   - `unlock` options:
     - "Cambridge-literal": `K_last`. After this, every un-sat candidate is under FCS or in the exam.
     - "Practical": `K_last + duration × 1.5 + buffer`, which covers late finishers.
     - "Conservative": `K_last + 24 h`, which covers deviations and mirrors Cambridge's 24-hour QP rule.
   Make the buffer configurable per server. A typical all-zone paper then locks for about 16 h + duration + buffers.
6. **Evening sessions** (Z4 EV 13:00 UTC, Z5 EV 09:00 UTC) and Z6's +1 local date must be supported. Z6 sittings can fall on a **Saturday local date**.
7. **Merge overlapping intervals per channel.** On busy days, several papers of the same syllabus family (e.g. 9709 P2/P4/P6 on 06 May) share a channel.
8. **Windowed components** (speaking, art, coursework) have no key time. Support "window" sittings (`start_date`, `end_date`) that lock from the window start to the window end (+ buffer), following Cambridge's "end of the assessment window" rule. Or ignore them, as a policy choice.
9. **Import tooling:** there is no public machine-readable timetable. Options:
   - A PDF parser. It worked on all 2026 PDFs, but needs weekday/date validation because of the Cambridge typo found.
   - Paste from a centre's Direct CSV export, if an admin has access.
   - The `cambridge_2026_timetables_parsed.csv` produced here, which can seed the June and Nov 2026 data directly.
   Keep a `source_version` field (e.g. "Version 2, January 2026") and support re-import and diff.
10. **Generic across boards:** if the model is "sitting = (paper, location-group, UTC instant, duration)" and "location-group = zone", Pearson IAL fits as one or two groups with a UTC start time and ±30 min flex. Keep the Cambridge-specific key-time ladder in a board-specific config table.
11. **The zone lookup can drive user-facing features** (e.g. "your zone's key time is…" or zone roles). Remember that countries are not UTC offsets, and that FL/TN/MI, Canada and Indonesia are split.

---

## Unverified / uncertain

- **The key-time table is derived from Cambridge's live tools** (queried 30 Sep 2026) and the Nov 2026 widget ("data current as of February 2026"). For June 2026 I assumed the same UTC values. This is corroborated for the UK by the 2026 UK supplement and by the variant/UTC alignment in the June PDFs (902/950), but no single document states the whole zone → UTC table.
- **Anomalies in Cambridge data:** Åland → Zone 2; Liberia with an EV slot; Nebraska → Zone 2; Jordan, Syria and Morocco local-time mismatches between the two tools. Treat Cambridge's local times as possibly stale.
- **Zone membership stability:** no documented changes between June and Nov were found. The March-series Romania exception is documented. Historical changes before 2025 were not researched.
- **"Discussion until the Key Time has passed":** the wording does not specify whose key time. My reading (the candidate's own zone) is an inference. The same Handbook elsewhere says Key Times "prevent your candidates from sharing confidential exam information with other candidates".
- **Timetable parsing is automated.** Counts (e.g. 950 June variants, the 38 Nov multi-date clusters) come from my regex parser. They cover all components that have a date, duration and session. Rows whose name wraps are captured but may have a blank or garbled `name`. Grouping components into "papers" by first digit is approximate, especially for practicals.
- **June 2026 V1 → V2 changes** for Zones 2 and 3 are unknown (V1 not retrieved). The r/IGCSE rule text is from a search snippet, not a direct fetch. r/alevel practice was not found.
- **"No contingency day"** is an absence of evidence, not an explicit statement.
- **March 2026 dates** (5 Feb – 9 Mar 2026) come from a third-party site in search results and were not verified. The March 2027 dates are verified.
- **Pearson:** the IAL date timetable PDF did not download (HTML was returned). I only read the start-time documents. I did not check Pearson's January series or Americas coverage.
- **Whether variants share questions** (i.e. whether v1 discussion spoils v3) is not documented by Cambridge.
