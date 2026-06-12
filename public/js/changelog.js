// In-app changelog ("Nouveautés"), shown in a modal from the library page.
//
// Antechronological order (most recent first), grouped by publication date.
// The bar is high: an entry must be worth the reader's time. Put **real
// user-facing changes** here — a new feature, a notable behaviour change, a
// fix to something the player would have noticed. Do NOT list per-score
// notation fixes, refactors, CI, lint, or purely technical changes. When in
// doubt, leave it out. Keep each item short, concrete, and in French.
//
// See CLAUDE.md ("Changelog in-app") for the update rule.

export const CHANGELOG = [
  {
    date: '2026-06-10',
    items: [
      "Les durées de parcours ne comptent plus les temps morts : quand vous mettez en pause ou êtes interrompu en plein milieu, ce temps est retranché. La comparaison entre vos passages reflète mieux votre progression réelle.",
      "Les fenêtres (résultats, historique, aide…) se ferment désormais avec la touche Échap.",
    ],
  },
  {
    date: '2026-06-07',
    items: [
      "Retour à la bibliothèque depuis le clavier : appuyez sur la touche la plus aiguë du piano pour revenir à la liste des partitions, en conservant les filtres en cours.",
    ],
  },
  {
    date: '2026-06-05',
    items: [
      "Chargement par glisser-déposer : déposez un fichier MusicXML — y compris les .mxl compressés — directement sur la page pour l'ouvrir, sans passer par le bouton.",
    ],
  },
  {
    date: '2026-05-28',
    items: [
      "Raccourci « / » : appuyez sur la touche slash pour placer aussitôt le curseur dans la recherche de la bibliothèque.",
    ],
  },
  {
    date: '2026-05-22',
    items: [
      "Nouveau filtre par période musicale (baroque, classique, romantique, moderne…) dans la bibliothèque.",
    ],
  },
  {
    date: '2026-05-21',
    items: [
      "Le statut « répertoire » est plus exigeant : une partition n'y accède qu'après une maîtrise plus solidement démontrée, pour que le répertoire reste un vrai repère.",
    ],
  },
  {
    date: '2026-05-20',
    items: [
      "Mode strict plus pratique : les contrôles restent visibles pendant le jeu, un clic sur une mesure définit le point de départ, et le tempo choisi est mémorisé d'une séance à l'autre.",
    ],
  },
  {
    date: '2026-05-11',
    items: [
      "Refonte de l'interface : nouveau système de design, pages repensées et modes de jeu unifiés pour une navigation plus claire.",
    ],
  },
  {
    date: '2026-05-10',
    items: [
      "Nouveau mode « parcours strict » : jouez la partition du début à la fin au tempo imposé par un métronome, pour mesurer votre régularité plutôt que votre seule justesse.",
    ],
  },
  {
    date: '2026-05-04',
    items: [
      "Graphique d'évolution dans l'historique d'une partition : visualisez la durée de vos parcours au fil des séances pour voir si vous gagnez en aisance.",
    ],
  },
  {
    date: '2026-04-10',
    items: [
      "Ouvrez une partition en la jouant : depuis la bibliothèque, jouez les premières notes d'un morceau sur le piano et l'appli l'ouvre automatiquement.",
      "Pédale de sustain prise en compte pendant l'écoute de la partition.",
    ],
  },
  {
    date: '2026-03-24',
    items: [
      "Retour à l'accueil en appuyant sur la touche la plus grave du piano (le La0 tout à gauche).",
    ],
  },
  {
    date: '2026-03-19',
    items: [
      "Parcourez la bibliothèque par niveau de travail — déchiffrage, perfectionnement, répertoire — grâce aux pages de statut.",
    ],
  },
  {
    date: '2026-03-15',
    items: [
      "Curseur et défilement automatique pendant l'écoute : le curseur suit la musique et la page défile toute seule.",
      "Pages compositeur pour parcourir les partitions regroupées par compositeur.",
    ],
  },
  {
    date: '2026-02-21',
    items: [
      "Écoute avec un vrai son de piano : la partition peut désormais être jouée avec un rendu audio réaliste, en plus de l'envoi vers un piano MIDI connecté.",
    ],
  },
  {
    date: '2026-02-18',
    items: [
      "Reconnaissance des ornements : trilles, mordants, grupettos et appoggiatures sont validés avec une tolérance adaptée lorsque vous les jouez.",
    ],
  },
  {
    date: '2026-02-09',
    items: [
      "Aide à la connexion : si aucun clavier n'est détecté, une fenêtre explique comment connecter votre piano selon votre système (macOS, Windows, Linux).",
    ],
  },
  {
    date: '2026-02-06',
    items: [
      "Doigtés à plusieurs chiffres pris en charge (par exemple pour les changements de doigt sur une même note).",
    ],
  },
  {
    date: '2026-01-30',
    items: [
      "Mode renforcement ciblé : à la fin d'un parcours complet, l'appli vous propose de retravailler précisément les mesures où vous avez fait des erreurs.",
    ],
  },
  {
    date: '2026-01-18',
    items: [
      "Annotation des doigtés : ajoutez vos propres doigtés directement sur la partition. Ils sont sauvegardés et réaffichés à chaque ouverture.",
    ],
  },
  {
    date: '2026-01-15',
    items: [
      "Historique de pratique et journal quotidien : suivez, partition par partition et jour par jour, le temps passé et les mesures travaillées.",
    ],
  },
  {
    date: '2026-01-13',
    items: [
      "Sauvegarde de vos données : exportez puis réimportez un fichier contenant vos doigtés, votre historique et votre progression — utile pour changer d'appareil.",
    ],
  },
  {
    date: '2026-01-10',
    items: [
      "Recherche multi-mots dans la bibliothèque : tapez plusieurs mots (titre et compositeur) pour affiner les résultats.",
    ],
  },
  {
    date: '2026-01-04',
    items: [
      "Choix de la main à travailler — main droite, main gauche ou les deux — et bouton plein écran pour la partition.",
    ],
  },
  {
    date: '2026-01-02',
    items: [
      "Bibliothèque de partitions classiques du domaine public, et connexion du clavier via la Web MIDI API (USB ou Bluetooth).",
    ],
  },
]
