# Roadmap

Idées et demandes de fonctionnalités à venir. Une fois livrées, elles descendent
dans le `CHANGELOG`.

## Idées

- **Validation des pédales** — valider l'usage de la pédale de sustain (CC 64),
  pas seulement les notes. Très pertinent sur des pièces comme la *Sonate au clair
  de lune*. Nécessite les marques `<pedal>` dans le MusicXML et l'écoute des
  Control Change côté MIDI.

- **Marqueur de passages** — outil pour surligner / marquer les passages
  difficiles d'un morceau, afin d'attirer l'attention dessus et d'y revenir.

- **Renforcement avant un jeu complet** — les suggestions de mesures à renforcer
  ne se déclenchent qu'après une lecture complète du morceau. Sur les longs
  morceaux, on travaille la première partie et on veut renforcer des mesures
  avant d'avoir tout déchiffré. Proposer le renforcement sur les mesures déjà
  jouées, sans exiger une session complète.

- **Tempo trainer (suite du mode strict)** — l'évolution envisagée dès les
  premières PRs du mode strict (#161, #165) : construire un entraîneur de tempo
  par-dessus le moteur existant, avec **sélection d'une plage de mesures**,
  **boucle** sur cette plage et **auto-progression** du BPM (accélération
  graduelle quand la passe est propre). À coupler avec l'intégration du mode
  strict dans le suivi de pratique (stats séparées des lectures libres).

- **Validation des silences / durées** — aujourd'hui rien ne signale qu'on
  maintient une note trop longtemps (ou qu'on ne respecte pas un silence), ni
  à l'inverse qu'on ne la tient pas assez longtemps. Valider la durée et le
  relâchement (Note Off), pas seulement l'attaque (Note On). Questions ouvertes :
  bloquant ou seulement pris en compte dans le score d'un jeu ? Et interaction
  avec la pédale (inutile de maintenir le doigt sur la touche si la pédale de
  sustain est enfoncée — cf. validation des pédales).

- **Validation des nuances (vélocité)** — on valide la hauteur des notes mais
  jamais la dynamique. Comparer la vélocité MIDI aux indications de nuance de la
  partition (`p`, `f`, `cresc.`, etc.).

- **Scoring des jeux complets en mode libre** — attribuer une note à une lecture
  libre complète selon le respect du tempo, les fausses notes, les durées, etc.
  Donne un repère global de progression sans imposer le cadre du mode strict.

- **Sélection multi-mesures en mode entraînement** — étendre le mode
  entraînement actuel pour sélectionner une plage de mesures (et non une seule),
  afin de travailler un passage en boucle.

- **Accès prof** — permettre à un professeur de suivre la pratique d'un élève :
  consulter sa progression, ses mesures faibles, ses jeux récents, voire lui
  assigner des morceaux ou passages à travailler.
