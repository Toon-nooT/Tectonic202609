# Oplossingssleutel – Tegenstrijdigheden IKEA-testset (FICTIEVE TESTDATA)

Alle documenten zijn fictief en bedoeld als testdata. Namen, nummers en bedragen zijn verzonnen.

| # | Onderwerp | Document A | Document B (en C) | Type |
|---|---|---|---|---|
| 1 | Ondernemingsnummer | 01, 09: 0412.345.**678** | 02: 0412.345.**687** | Tikfout / cijferomwisseling |
| 2 | Geboortedatum werknemer | 02: 21/04/1995 (ook in rijksregisternr.) | 09: 12/04/1995 | Masterdata |
| 3 | Startdatum | 02, 09: 1 maart 2026 | 08: 15 maart 2026 | Datum |
| 4 | Anciënniteitsdatum | 02: in dienst 01/03/2026 | 09: anciënniteit 01/03/2025 | Datum / logisch |
| 5 | Vestiging | 02, 09, 10: IKEA Gent | 08: IKEA Zaventem | Masterdata |
| 6 | Functie | 02, 08, 10: Verkoopmedewerker Keukens | 09: Logistiek medewerker | Masterdata |
| 7 | Statuut | 02: bediende | 09: arbeider | Masterdata |
| 8 | Paritair comité | 01, 02, 09: PC 311 | 10: PC 201 | Masterdata |
| 9 | Arbeidsduur | 01, 02, 10: 38 u voltijds | 09: deeltijds 36 u | Regime |
| 10 | Brutoloon | 02, 08: € 2.465,00 | 10: € 2.385,00 | Bedrag |
| 11 | Betaaldatum loon | 01, 08: laatste werkdag lopende maand | 02: 5de werkdag volgende maand; 10: 07/04 | Datum / beleid |
| 12 | Proefperiode | 01: geen proefperiode (eenheidsstatuut) | 02: 6 maanden proefperiode | Beleid + wettelijk conflict |
| 13 | ADV-dagen | 01: 4 dagen | 03: 6 dagen (tekst) vs 5 dagen (tabel) | Intern + extern conflict |
| 14 | Zondagtoeslag | 01: 100% | 03, 10: 50% | Percentage |
| 15 | Eindejaarspremie – uitbetaling | 04: één keer in december | 03: 50% juni / 50% december | Beleid |
| 16 | Eindejaarspremie – voorwaarde | 04: 6 maanden anciënniteit | 03: 3 maanden | Beleid |
| 17 | Fietsvergoeding | 05: € 0,35/km | 03: € 0,30/km; 10: € 0,27/km | Tarief |
| 18 | Telewerk toegestaan | 06: verkoopmedewerkers uitgesloten | 02 (bijlage A): 1 dag/week toegestaan; 09: telewerk "Nee"; 10: bureauvergoeding uitbetaald | Beleid + masterdata |
| 19 | Telewerkfrequentie | 06: max. 2 dagen | 02: 1 dag | Beleid (geen strikt conflict – binnen maximum) |
| 20 | Bureauvergoeding | 06: € 150,00 | 02, 10: € 129,48 | Bedrag |
| 21 | Maaltijdcheque waarde | 07: € 8,00 | 10: € 7,00 | Bedrag |
| 22 | Hospitalisatieverzekering | 02, 03: vanaf dag 1, incl. gezin, gratis | 08: na 12 maanden, enkel werknemer | Beleid |

**Extra aandachtspunten voor de software:**
- Nr. 13 bevat een **interne** tegenstrijdigheid binnen één document (03).
- Nr. 12 is naast een documentconflict ook een **conflict met de Belgische wetgeving** (proefperiode afgeschaft sinds 1/1/2014).
- Nr. 18 vereist **redeneren over categorieën** (functie valt onder een uitgesloten groep), geen letterlijke waardevergelijking.
- Nr. 19 is een **valse positief-test**: 1 dag is verenigbaar met "maximaal 2 dagen".
- In 10 is het aantal maaltijdcheques (21) niet gelijk aan het aantal fietsdagen (22) – mogelijk plausibel (bv. halve dag), bruikbaar als twijfelgeval.
