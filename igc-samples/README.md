# Flown tracks

221 IGC logs of hike & fly and other paraglider flights, April 2025 to September 2026,
mostly in the Vaud and Valais Alps (7 outside the Swiss elevation archive, in France). The
tests check the model against them ([`flights.test.ts`](../src/lib/compute/flights.test.ts)).

- Recorder: Syride SYS'Nav XL, one fix per second, GNSS altitude above the geoid
  (`HFALGALTGPS:GEO`) and ISA pressure altitude.
- The recorder starts logging only once in flight: most tracks begin some meters above the
  ground, after the takeoff run. It keeps logging after the landing, on the ground.
- The pilot's name was removed (`HFPLTPILOTINCHARGE:NKN`); the logs have no G record, so
  no signature was broken.
