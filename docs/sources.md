# Sources: the reference library

The sources the game's numbers are checked against, with where to find
each one, what it gives, and how far it was read. It is a reference: what
a source **says** is quoted, with page detail, in
[validation.md](validation.md); what the game **does** with it is in the
README's rules decisions; what it **moved** is in [balance.md](balance.md).

How to read them from a cloud session: the session's network proxy
blocks most of these sites. The Apify fetch tool (`apify--web-fetch`)
opens them, PDFs included; Consensus searches the peer-reviewed literature.
See validation.md, *second pass*, for how that was done.

**Read** below means read on the page itself, not in a search summary.

## The reports

| Source | Where | What it gives | Read |
|---|---|---|---|
| **ARES Special Report No. 3**, *Indirect Fire: A Technical Analysis of the Employment, Accuracy, and Effects of Indirect-fire Artillery Weapons* — Dullum, Fish, Jenzen-Jones et al., Armament Research Services, Jan. 2017, 93 pp. | armamentresearch.com/wp-content/uploads/2017/01/ARES-Special-Report-Indirect-Fire_web.pdf | Projectile and mortar specifications and lethal areas (Tables 1.1–1.5); 155 mm CEP by range (Table 3.1); error as a share of range (Table 3.3); adjust fire, suppression, time on target; fuzes and buildings; dud rates | In full, 2026-10-03 |
| **GICHD**, *Explosive Weapon Effects – Final Report*, Geneva, Feb. 2017, 145 pp., ISBN 978-2-940369-61-4 | gichd.org/fileadmin/uploads/gichd/Publications/Explosive_weapon_effects_web.pdf | What a lethal area is; incapacitation by distance (Table 6); open against enclosed (Table 7); 155 mm injuries by distance (Table 8); explosive fill (Table 9); risk estimate distances (Table 10); Mk 82 bombs and guided variants; tank HE's "more limited lethal area" | Main chapters, 2026-10-03. Annexes C (mortars), D (tank guns) and E (Mk 82) were on characterisationexplosiveweapons.org, which no longer answers |
| **FM 3-06.11**, *Combined Arms Operations in Urban Terrain*, ch. 7, US Army | globalsecurity.org/military/library/policy/army/fm/3-06-11/ch7.htm | Weapon effects on buildings: a tank HEAT round breaches a wall; a shaped charge through a window is wasted; M203 window accuracy; mortar and artillery against roofs; rubble as cover; 25% of HE glancing off hard surfaces | In full, 2026-10-03 |
| *Fort Sill Fire Suppression Symposium Report*, 24–25 July 1979, ADA081134 — annex III-C summarises CDEC's SASE II (1976) and SUPEX (1977) | archive.org/details/DTIC_ADA081134 (OCR; apps.dtic.mil refuses automated fetches) | Rounds a minute on a 100 m front to suppress foxhole defenders 50% / 90% (Table II); burst interval matters, burst length does not; frontal-parapet foxholes less suppressed; men alone 43–115% more | Annex III-C read, 2026-10-12 |
| Kubala & Warnick, *A Further Look at the Prediction of Weapons Effectiveness in Suppressive Fire*, ARI TR-79-A19, 1979, ADA071116 | archive.org/details/DTIC_ADA071116 | M60 probability of suppression by miss distance (p. 2-9); kinetic energy explains the weapons' differences | Read, 2026-10-12 |
| Kushnick & Duffy, *Objective Relationships between Small Arms Fire Characteristics and Effectiveness of Suppressive Fire*, Litton-Mellonics for ARPA, 1972, AD0519874 | archive.org/details/DTIC_AD0519874 | Perceived danger by weapon, in foxholes and in the assault (pp. 3-18/19); first reactions to fire (p. 3-9) | Read, 2026-10-12 |
| Mueller & Pietsch, *Human Factors in Field Experimentation: Design and Analysis of an Analytical Suppression Model*, NPS, 1978, ADA061417 | archive.org/details/DTIC_ADA061417 | Time down per HE round, SUPEX II (pp. 80–81) | Read, 2026-10-12 |
| Hitchman, *Operational Requirements for an Infantry Hand Weapon*, ORO-T-160, 1952, AD0000346 | archive.org/details/DTIC_AD0000346 | Trials hit probability of aimed rifle fire by range (Table 1); engagement ranges | Read, 2026-10-12 |
| **FM 7-90**, *Tactical Employment of Mortars* (1992), full text | archive.org/details/FM_7_90_T_E_M_1992 (OCR) | B-7 suppression as a *probability* by distance; p. 7-16 casualties by protection under a test barrage | B-7 and ch. 7 read, 2026-10-12 |
| Fort Sill symposium (above), indirect-fire parts: SUPEX IIIA/IIIB, Bryson's Table I, the AMSAA/RARDE, CARMONETTE and DIVLEV suppression rules | archive.org/details/DTIC_ADA081134 | Distance for P = .5/.9 by calibre; open vs closed foxhole; volley vs single round; per-volley density models | Read (agent, partly checked), 2026-10-12 |
| Frame, McEnany & Kladivko, *Combat Operational Data Analysis: An Examination of WWII Suppression Data*, SAIC for CAA, 1989, ADA206606 | archive.org/details/DTIC_ADA206606 | British OR on bombardment: recovery in minutes; neutralisation against demoralisation | Read, 2026-10-12 |
| Millikan, Wong & Grieger, MODSIM 2013 (DSTO), a suppression model like the UK CAEn's | mssanz.org.au/modsim2013/D1/millikan.pdf | +4 per near miss, ×0.1 prone or behind cover, −2 a second | Read, 2026-10-12 |
| **FM 7-90**, *Tactical Employment of Mortars*, App. B, US Army | globalsecurity.org/military/library/policy/army/fm/7-90/Appb.htm | Suppression radii by mortar (B-7); standing against prone (B-5a); overhead cover | Read, 2026-10-03 |
| USMC TBS, *Principles of Fire Support* (B2C2437) | trngcmd.marines.mil (PDF) | Rates of fire (M777A2 2 sustained, 5 maximum); estimated casualty radii (81 mm 35 m, 120 mm 45 m, 155 mm about 50 m) | Read |
| Grau, *Russian-Manufactured Armored Vehicle Vulnerability in Urban Combat: The Chechnya Experience*, FMSO, 1997 | man.fas.org/dod-101/sys/land/row/rusav.htm | 3–6 lethal hits for each armoured vehicle destroyed at Grozny | Read |
| **Lawrence & Anderson**, *Measuring the Effects of Combat in Cities, Phase I*, The Dupuy Institute for CAA, 11 Jan 2002 | dupuyinstitute.org/pdf/urbanwar.pdf | 137 division engagements, ETO 1944, urban against open: attacker wins, losses per day, advance rates; outcome by force ratio (pp. 49–50) | In full (agent), 2026-10-15 |
| **Syms**, Dstl, ISMOR 2023 slides | (conference slides) | 145 battles 1943–2008, brigade to company: attacker wins 88% urban against 59% open; losses per day; duration | Read (agent), 2026-10-15 |
| Gott (ed.), *Eyewitness to War* Vol. II: *The US Army in Operation AL FAJR*, CSI Press 2006, DTIC ADA460457 | archive.org/details/DTIC_ADA460457 | 1SG Peter Smith (A Co, TF 2-2 IN), pp. 199–200: "80 to 100 houses a day with a platoon or a company-sized element", two- and three-storey houses, eight men a house | The quote checked on the text, 2026-10-16 |
| Redden & Blackwell, ARL-TR-2583, 2001 | (ARL technical report) | A Ranger squad against 2–5 OpFor at the McKenna MOUT site: about 30 min an iteration, approach included | Read (agent), 2026-10-16 |
| Kaya et al., *Military Medicine*, 2024 | (journal) | Room entry about 2.4 s, a room finished in about 7.5–8.4 s, n = 110, augmented reality | Read (agent), 2026-10-16 |
| Matthews, *Operation AL FAJR* (Fallujah), Combat Studies Institute | armyupress.army.mil (PDF) | No rounds-per-building figure; one Bradley penetrated | Searched in full text |

## Combat records

| Source | Where | What it gives | Read |
|---|---|---|---|
| StrategyPage, "Merkava Muddles and Miracles in Lebanon", 2007-01-15 | strategypage.com/htmw/htarm/articles/20070115.aspx | 2006: about 10% of Merkavas hit; Kornet could not get through the front; 2 of 18 seriously damaged tanks destroyed, both by IEDs; "over a hundred tank crewmen killed or wounded by ATGMs" | Read |
| GlobalSecurity, *Merkava – Combat* | globalsecurity.org/military/world/israel/merkava-combat.htm | 2006: 52 knocked out, 50 by missiles and RPGs, 22 penetrated, 23 tankers killed. 1982: about 50 out of action, 7 lost, 9 crew killed | Read (it disagrees with StrategyPage on tanks destroyed) |
| Dupuy Institute, "Human Factors In Warfare: Combat Effectiveness" | dupuyinstitute.org/2017/10/04/human-factors-in-warfare-combat-effectiveness/ | P = S × V × CEV: quality multiplies strength; Germans better than US and British troops attacking or defending | Read (through Apify) |
| Dupuy Institute, "Measuring Human Factors based upon Casualty Effectiveness" | dupuyinstitute.org/2019/12/03/measuring-human-factors-based-upon-casualty-effectiveness/ | Israeli CEV 1.75 (1967) and 1.98 (1973) against Egypt; at even odds, exchanges of 0.43 against 4.91 | Read (through Apify) |
| Dupuy Institute, "Measuring Human Factors … in Italy 1943–1944" and "CEV Calculations in Italy, 1943" | dupuyinstitute.org/2019/12/05/…, dupuyinstitute.org/2018/05/23/cev-calculations-in-italy-1943/ | Germans 20–30% more effective; Zetterling 1.4–1.5 | Read (through Apify) |
| Dupuy Institute, "Force Ratios and Counterinsurgency II" | dupuyinstitute.org/2016/01/08/force-ratios-and-counterinsurgency-ii/ | Over 10:1 nearly always beats an insurgency; 2:1 or less favours it | Read (through Apify) |
| Rowland, *The Stress of Battle* (2006), through reviews | themself.org/2013/12/stress-of-battle-5-ww2-heroism-surprise/; diningtablenapoleon.com | Troop quality largely absent from the data; Gurkhas about 60% more casualties inflicted | Reviews read, book not |
| Dupuy Institute, "The 40% Rule" | dupuyinstitute.org/2024/03/26/the-40-rule/ | Breakpoints from FM 105-5 (1964), with no study behind them; Clark 1954 and McQuie 1987 reject a fixed breakpoint | Read |
| Melashchenko et al., survey of war-damaged panel buildings, *Наука та будівництво* 36(2) | doi.org/10.33644/2313-6679-2-2023-5 | 20 direct shell hits leave a large panel block unfit for use, not rubble | Read |

## Peer-reviewed (through Consensus)

| Source | What it gives |
|---|---|
| Arnold et al., *Ann Emerg Med* 2004 — 29 bombings, 8,364 casualties | Immediate mortality: open air 4%, confined space 8%, structural collapse 25% |
| Leibovici et al., *J Trauma* 1996 | Open air 7.8% against buses 49% |
| Lai, *J Traumatic Surgery* 2008 (rats) | Enclosure 21.7% against free field 6.7% |
| Silk 2013, *Mil Med*; Billing 2015, *JSCR* | Assault simulations: about 15–23 m a minute |
| Le et al. 2024, camouflage patterns | Best patterns first seen at 30–35 m (10 observers) |
| Leaper et al. 2023, distance estimation (sightings at sea) | Naked eye about 39% error; reticle binoculars 19–33% |
| Rooney 2020, *Tactical Psychology in Operation Veritable* | Combined threats more than double surrenders (abstract) |
| Ito et al. 1999, US Army (rifle accuracy after exhausting exercise) | Hits −26% after running, −20% after a loaded march; back to normal within 1.5 minutes |
| Hunt et al. 2016, *Ergonomics*; Billing et al. 2015, *JSCR* (repeated 30 m sprints and 6 m bounds under load) | Each sprint slower than the last; the slow men lose nearly twice as much per kg as the fast |
| Billing 2011, *Mil Med* (30 m sprint, 21.6 kg fighting load) | 8.2 s loaded against 6.2 s unloaded |

## Reference pages

Wikipedia, read on the page, for published specifications only: RPG-7
(PG-7V 260 mm, PG-7VL more than 500 mm, PG-7VR 600 mm behind reactive
armour and 900 mm bare; 50% first-round hit at 180 m in a crosswind;
the 1976 trial table); 9M133 Kornet (1,000–1,300 mm); Namer ("more
heavily armored than the Merkava IV"); M113 (7.62 mm and splinter
protection); M18 Claymore (60° fan; 30% at 50 m, about 10% at 100 m);
M252 mortar (8–16 rounds a minute sustained); fireteam (one grenadier in
four); Trophy (trial interception rates only). FAS: M433 40 mm (5 m
casualty radius).

**Weak:** a 2025 post on secretprojects.co.uk is the only source found for
the 155 mm lethal areas standing and prone (971 / 346 m²) and for the
105 mm's 271–290 m² on impact. Its author derives them from BRL 530 and
Mott's formulas, since JMEM is classified.

## Doctrine: the manuals, as a corpus (2026-10-09)

The author's doctrine library, in `docs/Doctrine` — **426 US Army
publications, 77,597 pages**, parsed and chunked for retrieval
(`docs/Doctrine/US/doctrine_current/<timestamp>/`). This is the material
backlog 21 was waiting for; the brief is
[doctrine-handoff.md](doctrine-handoff.md).

Search it with **[`tools/doctrine.py`](../tools/doctrine.py)**; a full scan
takes about a second, so there is nothing to build and nothing to go stale:

```bash
PYTHONUTF8=1 py tools/doctrine.py --list 3-21
PYTHONUTF8=1 py tools/doctrine.py --find "base-of-fire element" --doc 3-21.8
```

Every chunk carries its **doctrine paragraph numbers**, so a finding is
quotable the way this file wants one: *ATP 3-21.8 (2024), para 3-102*.

| Manual | Edition in the corpus | What it gives |
|---|---|---|
| **ATP 3-21.8** *Infantry Platoon and Squad* | 2024-01-11, 598 pp (ARN44065) | The body of squad and platoon tactics: base-of-fire and bounding elements, formations, movement techniques, offense, defense |
| **ATP 3-21.10** *Infantry Rifle Company* | **2026-06-01**, 296 pp (ARN46667) | The company level: the layer `company.ts` stands in for |
| **FM 3-90** *Tactics* | 2023-05-01, 480 pp (ARN38160) | Forms of manoeuvre, hasty and deliberate attack, the defence |
| **TC 3-21.76** *Ranger Handbook* | 2025-09-19, 380 pp (ARN45113) | **The drill steps themselves**, as a quick-reference (App. A) — see the caveat below |
| **ATP 3-21.90** *Tactical Employment of Mortars* | 2019-10-09, 208 pp | The current edition of the **FM 7-90** this file reads above from a third-party mirror |
| **ATP 3-06** *Urban Operations* | 2022-07-21, 278 pp | The current edition behind the **FM 3-06.11** chapter read above; for backlog 23 |
| **ATP 3-21.51** *Subterranean Operations* | 2019-11-01, 228 pp | For backlog 5 |
| **FM 5-0** *Planning and Orders Production* | 2024-11-04, 412 pp | For the OPORD rewrite (`sim/opord.ts`) |

All are Distribution A from armypubs.army.mil, which is what the commercial
edition requires (business-plan.md, *Editions*). The documents.csv beside
the index carries each one's source URL, date and sha256, and is tracked in
git; **the chunk index itself is not** — it runs to hundreds of MB and is
gitignored, so it is fetched, not versioned.

**Three cautions, each paid for once:**

- **The battle drills are not in ATP 3-21.8.** Appendix E only *names* them
  with their task numbers and points at the Army Training Network. The full
  task steps are in the **Ranger Handbook, Chapter 8** (TC 3-21.76, 2025,
  pp. 169–203), and the reasoning behind them in ATP 3-21.8's chapters 3–5.
  The drill-by-drill table is in
  [doctrine-handoff.md](doctrine-handoff.md).
- **Search the doctrine's words, not ours.** `--semantic` exists (it needs
  `VOYAGE_API_KEY` in `.env`) but ranks only roughly: the index's vectors
  are contextualized over chunk groups, so a query vector is never a close
  match — scores sit at 0.3–0.55 and a near-verbatim query put its own
  target third. Use it to find doctrine's term, then quote from a text
  search. "base of fire" and "support by fire" hit; "covering fire" does
  not.
- **Chunk counts are not measurements.** The manifest says so itself: it is
  a retrieval index, not a unit set. Quote paragraphs, never "N chunks say".

### Who decides that a defender leaves its building (2026-10-21, decision 106)

Searched for any drill or rule that has defenders leave a building, or move
between positions, without a leader's decision. **None found**: the only
automatic act in any drill is taking cover under indirect fire.
- **React to Indirect Fire While Dismounted – Squad (07-SQD-D9504)**, TC
  3-21.76 (2025), ch. 8, step 3: "The squad leader orders the squad to move
  to a rally point". It is written for a squad in the open, and there is no
  building version.
- **Break Contact – Squad (07-SQD-D9505)**, TC 3-21.76 (2025): "the squad
  leader decides to break contact". It is written for the attack and the
  movement to contact.
- **Disengagement criteria**, ATP 3-21.8 (2024), paras 5-35 and 5-38: set in
  advance, and still "The platoon leader makes a displacement decision".
  The urban delay, ATP 3-06.11 (2024) para 4-130, is the same: criteria
  leaders set beforehand, for a delay mission.
- **Stay and fight**: ATP 3-06.11 (2024) para 4-137, "Defending units stay
  in place and continue to fight unless they can … break contact"; ATTP
  3-06.11 (2011) para 6-76, a strongpoint "is defended until the unit is
  formally ordered out of it"; ATP 3-21.8 (2024) para 5-25, withdrawing from
  a strongpoint needs "permission from the higher headquarters".
- Not found: leaving a building on fire, falling back floor by floor (as a
  rule), or a building version of React to Indirect Fire. FM 3-06.11 (2002)
  is not in the corpus.
- **Who breaches** (decision 125): ATP 3-21.9 (2025) para 3-178, "a
  dismounted Infantry squad as the breach element"; ATP 3-21.8 (2024) para
  1-31, riflemen on "demolitions and wire/mine breach teams"; ATTP 3-06.11
  (2011) paras 5-14, 5-15, 5-92, breaching "by a separate element or
  integrated into the assault element", extra training for explosive
  breaching, engineers "should support all breach operations"; ATTP
  3-06.11 para 7-74, after detonation "the clearing team moves to the entry
  point and enters". **How many: no number** — ATP 3-06.11 (2024) para
  6-107, "the supplies needed to breach many doors based on the size of the
  objective".

## Not yet read, worth reading

- DTIC was down for maintenance all of 2026-10-03:
  - ADA374995, *Heavy Artillery in MOUT* (rounds to bring a building down);
  - ADA206606, Frame 1989, WWII suppression data — read 2026-10-12: 54
    British actions, all bombardment, judged "inadequate" for modelling suppression;
  - ADA182415, BRL tank-gun accuracy;
  - BRL Report 761, *A Study of the Variation of Weapon Effectiveness With
    Foxhole Cover* (1954) — the one source for how much a hole cuts hits.
- Rowland, *The Stress of Battle*, and Rowland 1987 and 1991 in *JORS*
  (combat degradation; the urban battle).
- WO 291/946 (British WWII: morale under bombardment, open against
  covered).
- GICHD's annexes C–E (mortars, tank guns, Mk 82), if a copy turns up.

## The figures in play

A new game plays these (rules decisions 41, 62, 75–80). Each row gives the
figure and where it comes from.

| Figure | Value | Source |
|---|---|---|
| Lethal area, 155 mm (standing) | 665 m² | ARES Table 1.1 (decision 80) |
| Lethal area, 81 mm | 250 m² | ARES Table 1.2 |
| Lethal area, tank HE | 280 m² | 105 mm on impact (forum post); GICHD: tank HE "more limited" |
| Lethal area, 40 mm / RPG against men | 79 / 154 m² | FAS M433 5 m; RPG-7 OG-7V 7 m |
| Air burst against standing men | ×1.15 | ARES Table 1.5 (rockets, 1.08–1.22) |
| A mortar against men down | ×0.5 | FM 7-90 B-5a |
| A 155 mm against men down | ×0.36 | 155 mm prone ÷ standing (forum post) |
| Full cover against a shell, impact: hole / roof | ×0.03 / ×0.02 | FM 7-90; WWII trench figures (decision 62) |
| Room against open air | ×2.5 | Arnold 2004 ×2, Leibovici 1996 ×6 |
| Building collapse kills | 25% | Arnold 2004 |
| Suppression reach, 81 mm | 30 / 75 / 125 m | FM 7-90 B-7 |
| Suppression reach, 155 mm | 65 / 125 / 200 m | FM 7-90's heavy-mortar row (⚠️ stands in) |
| 155 mm first-round CEP | 115 m (20 km assumed) | ARES Table 3.1 |
| Mortar first-round CEP | 100 m | ARES Table 3.3: about 90 × 75 m at 3 km |
| 155 mm rate | 2 sustained, 5 maximum | USMC TBS (M777A2) |
| RPG against armour, to hit | 100 / 96 / 51 / 22 / 9 / 4% at 50–500 m | 1976 US Army trial |
| RPG against a tank: front / side / rear | 2 / 40 / 90% | Estimate; 2006 Lebanon agrees in total (44%) |
| Crew out a penetration | 35% each | 2006 Lebanon: 23 killed over 22 penetrations |
| AP charge | 60° fan, 30% at 50 m, 10% at 100 m | M18 Claymore |
| AT charge | 665 m² against men; vehicles within 20 m | 155 mm shell IED |
| A tank round breaches a wall | men inside at ×0.5 | FM 3-06.11 (the 0.5 is ours) |
| A trait at 1 or 10 | ×0.8 / ×1.2 on what it acts on | The author (decision 69); linear between is ours |
| Fatigue: a tired / exhausted man | pace and aim ×0.9 / ×0.75 | Ito 1999 (−20 to −26% hits); the steps are ours (decision 82) |
| Fatigue: recovery | a quiet minute takes off a run's worth | Ito 1999: accuracy back within 1.5 minutes |

**The balance on these figures**, 2026-10-03, standard measurement, 200
battles each (balance.md, *Fifty-second round*):

| Battle | Attacker wins | Target |
|---|---|---|
| Tel Azeka, 3:1 | 41% | 40–55% (decision 68) |
| Tel Azeka, 2:1 | 36% | 20–35%; accepted (decision 81) |
| Yokneam, urban (company, 2 tanks, 2 APCs against a platoon in houses) | 18% | — |
| Explosives' share of losses, tel | 64% | 60–80% (decision 81) |

## Air-delivered munitions: for when they come (backlog 10)

Nothing below is in the game. These are the figures to start from, from
GICHD's *Explosive Weapon Effects* (read on the page) unless marked.

**Mk 82 general-purpose bomb, 500 lb (227 kg) class**

| Figure | Value | GICHD source |
|---|---|---|
| Explosive fill | 89 kg in a 142 kg forged-steel body; NEQ 87 kg (Mk 82), 102 kg (BLU-111, PBXN-109) | p. 48; Table 9 |
| Similar bombs | FAB-250 M79 105 kg TNT; BM-250E 97 kg; AC 500 (Pakistan) 119.7 kg NEQ | Table 9 |
| Blast | 117 kPa at 16 m; 34 kPa at 31 m | p. 48, after Ordtech |
| Within 31 m (3,019 m²) | "the collapse of most buildings, severely damage heavily built concrete structures … injuries to all persons present, killing the majority of them" | p. 48 |
| Reinforced concrete | destroyed "within 16 m of the point of detonation"; "non-reinforced buildings offer almost no protection from a direct hit" | Effects analysis |
| 100% lethality | an area about 32 m across, butterfly-shaped (wider to the sides of the line of flight) | Figure 20, Fraunhofer-EMI model |
| Fragments | design fragment under 20 g at 2,400 m/s; at 16 m it gets through 32 mm of steel; beyond, under 1,900 m/s, up to 200 mm of concrete | p. 48, after ConWep |
| Crater | 4.6–10.7 m across, 0.76–4.27 m deep | p. 48 |
| Risk estimate distance (friendly troops) | 10% incapacitated at 250 m; 0.1% at 425 m | Table 10 |
| Case: Basra, 5 April 2003 | the target house and the houses on either side destroyed; 17 killed, 5 injured | Case study E1 |

**Accuracy (CEP)** — GICHD Table 3, after Raytheon and the US Navy:

| Munition | CEP |
|---|---|
| Unguided Mk 82, from 15,000 ft (4,572 m) | 94.5 m |
| GBU-12, laser-guided | 1.1 m |
| GBU-38, GPS/INS (JDAM) | 5 m |
| GBU-38, GPS jammed after release | 30 m |
| GBU-49, GPS/INS and laser | 1.1 m |

- A laser-guided bomb loses its guidance with the designator's line of
  sight: "rain, cloud, fog, smoke and dust". It may then land "hundreds of
  metres from its intended target".
- GBU-12s in 1991 struck their targets "88% of the time", mostly single
  vehicles. 66 aircraft destroyed 920 armoured vehicles in two weeks.
- Guided bombs are "100-200 times as effective as conventional bombs
  against hardened targets and between 20-40 times as effective against
  soft and area targets" (Blachly, Conine & Sharkey, 1973, as GICHD cites
  it).
- "Most Mk 82 aircraft bombs found in contemporary conflicts are guided."

**For comparison:** a 122 mm Grad rocket has 6.4 kg of explosive and a
lethal area of 700 m² on impact (standing); a 155 mm shell has 7–11 kg and
665 m². The Mk 82 carries about ten times a shell's explosive. Its blast,
not its fragments, is what decides against buildings.

**Open for the design:**
- how a side calls an air strike, and at what echelon;
- time on station;
- weather against laser guidance (backlog 19);
- what one bomb does to a building in decision 76's points: at 31 m "most
  buildings collapse", so rubble in one hit.
