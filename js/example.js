/* Scénario d'exemple : une murder party complète pour découvrir l'outil. */
(function () {
  const MP = (window.MP = window.MP || {});

  MP.exampleScenario = function () {
    return MP.normalize({
      id: MP.uid('sc'),
      title: 'Le dernier toast du comte',
      type: 'murder',
      players: '5 joueurs + 1 maître du jeu',
      duration: '2 h 30',
      synopsis:
        "Printemps 1925, au château de Villeneuve, dans les monts du Forez. Le comte Armand de Villeneuve réunit ses proches pour un dîner dont il promet qu'il « changera bien des choses ». Au moment du dessert, il porte un toast, boit, et s'effondre. Personne ne quittera le château avant que la vérité soit faite.",
      truth:
        "Maître Lucien Ferrand, notaire de la famille, détournait depuis des années l'argent du comte. Celui-ci l'a découvert et s'apprêtait à le dénoncer au procureur. Ferrand a acheté de l'arsenic à la pharmacie Martin sous son propre nom, est descendu à la cave à 21 h pour empoisonner la bouteille réservée au toast, et y a perdu son mouchoir brodé.",
      characters: [
        {
          id: 'c_armand', name: 'Comte Armand de Villeneuve', role: 'La victime', player: false, color: '#64748b',
          description: "Soixante-cinq ans, autoritaire et généreux, il règne sur le domaine depuis quarante ans.",
          relations: [],
        },
        {
          id: 'c_helene', name: 'Hélène de Villeneuve', role: 'L\'épouse du comte', color: '#e11d48',
          description: "Mariée au comte depuis 1902, elle tient le château d'une main de fer et s'ennuie profondément.",
          secret: "Vous entretenez une liaison avec Maître Ferrand, le notaire, depuis deux ans.",
          objectives: "Découvrir qui a tué votre mari.\nEmpêcher que votre liaison soit révélée.\nSavoir ce que contient le nouveau testament.",
          startItems: ['i_cle_bureau'], startKnow: ['k_liaison'],
          relations: [
            { to: 'c_lucien', label: 'Amant secret' },
            { to: 'c_camille', label: 'Méfiance : elle convoite l\'héritage' },
          ],
        },
        {
          id: 'c_lucien', name: 'Maître Lucien Ferrand', role: 'Le notaire (coupable)', color: '#9333ea',
          description: "Notaire à Montbrison, il gère la fortune des Villeneuve depuis quinze ans.",
          secret: "Vous avez empoisonné le comte. Il avait découvert vos détournements et allait vous dénoncer.",
          objectives: "Ne pas être démasqué.\nOrienter les soupçons vers Camille et ses dettes.\nRécupérer la lettre au procureur avant les autres.",
          startKnow: ['k_liaison', 'k_coupable'],
          relations: [
            { to: 'c_helene', label: 'Liaison, mais la trouve imprudente' },
            { to: 'c_armand', label: 'Client principal, devenu menace' },
          ],
        },
        {
          id: 'c_colette', name: 'Docteur Colette Brun', role: 'Le médecin de famille', color: '#16a34a',
          description: "Médecin du village, amie de longue date du comte, seule personne capable d'examiner le corps.",
          secret: "Vous prescriviez de la morphine au comte, en quantités que l'Ordre des médecins n'apprécierait pas.",
          objectives: "Établir la cause de la mort.\nQue personne ne soupçonne la morphine.",
          startKnow: ['k_morphine'],
          relations: [
            { to: 'c_armand', label: 'Médecin et amie' },
            { to: 'c_lucien', label: 'Le trouve étrangement nerveux ce soir' },
          ],
        },
        {
          id: 'c_victor', name: 'Victor Maréchal', role: 'Le majordome', color: '#ea580c',
          description: "Au service des Villeneuve depuis trente ans. Il sait tout ce qui se passe au château.",
          secret: "Vous buvez en cachette les grands crus du comte. C'est pour cela que vous gardez la clé de la cave sur vous.",
          objectives: "Aider à trouver le coupable.\nQue personne ne découvre vos visites à la cave.",
          startItems: ['i_cle_cave'], startKnow: ['k_cave21h'],
          relations: [
            { to: 'c_armand', label: 'Fidèle depuis trente ans' },
            { to: 'c_camille', label: 'Affection paternelle' },
          ],
        },
        {
          id: 'c_camille', name: 'Camille de Villeneuve', role: 'La nièce', color: '#0891b2',
          description: "Vingt-quatre ans, orpheline élevée par son oncle, elle mène grand train à Lyon.",
          secret: "Vous avez accumulé 8 000 francs de dettes de jeu. Votre oncle vous avait fait signer une reconnaissance de dette.",
          objectives: "Rester l'héritière du domaine.\nCacher vos dettes.\nTrouver le coupable.",
          startKnow: ['k_date'],
          relations: [
            { to: 'c_armand', label: 'Oncle et bienfaiteur' },
            { to: 'c_helene', label: 'La juge intéressée' },
          ],
        },
      ],
      items: [
        { id: 'i_verre', name: 'Verre du comte', location: 'Salle à manger', description: "Un verre en cristal, un fond de vin rouge au goût étrange." },
        { id: 'i_lettre_anonyme', name: 'Lettre anonyme', location: 'Salon, sous un coussin', description: "« Votre femme vous trompe avec celui en qui vous avez le plus confiance. »" },
        { id: 'i_cle_cave', name: 'Clé de la cave', description: "Une lourde clé en fer forgé." },
        { id: 'i_flacon', name: 'Flacon vide', location: 'Cave, derrière les bouteilles de 1911', description: "Petit flacon brun, l'étiquette est à moitié arrachée." },
        { id: 'i_mouchoir', name: 'Mouchoir brodé « L.F. »', location: 'Cave, au pied de l\'escalier', description: "Un mouchoir de soie brodé des initiales L.F." },
        { id: 'i_cle_bureau', name: 'Clé du bureau', description: "Petite clé en laiton, gravée « Cabinet »." },
        { id: 'i_brouillon', name: 'Brouillon de testament', location: 'Bureau, tiroir du haut', description: "Un projet de testament raturé, daté de la veille." },
        { id: 'i_registre', name: 'Registre de comptes', location: 'Bureau, étagère', description: "Les comptes du domaine tenus par Maître Ferrand." },
        { id: 'i_reconnaissance', name: 'Reconnaissance de dette', location: 'Coffre-fort du bureau', description: "« Je soussignée Camille de Villeneuve reconnais devoir à mon oncle la somme de 8 000 francs. »" },
        { id: 'i_lettre_procureur', name: 'Lettre au procureur', location: 'Coffre-fort du bureau', description: "Une lettre cachetée, non envoyée, adressée au procureur de Montbrison." },
      ],
      knowledge: [
        { id: 'k_mort', name: 'Le comte s\'est effondré après le toast', description: "Il a bu une gorgée de vin et s'est effondré quelques minutes plus tard." },
        { id: 'k_empoisonne', name: 'Le comte a été empoisonné', description: "Lèvres bleuies, odeur d'ail : ce n'est pas une mort naturelle." },
        { id: 'k_arsenic', name: 'Le poison est de l\'arsenic, dans le vin', description: "L'analyse du verre révèle de l'arsenic dissous dans le vin du toast." },
        { id: 'k_liaison', name: 'Hélène et Lucien ont une liaison', redHerring: true, description: "Hélène de Villeneuve et Maître Ferrand se voient en secret." },
        { id: 'k_cave21h', name: 'Une silhouette gantée à la cave à 21 h', description: "Vers 21 h, vous avez vu quelqu'un descendre à la cave. Il portait des gants et un manteau sombre." },
        { id: 'k_pharmacie', name: 'Le flacon vient de la pharmacie Martin', description: "L'étiquette reconstituée indique « Pharmacie Martin, Saint-Galmier »." },
        { id: 'k_achat_ferrand', name: 'L\'arsenic a été acheté par L. Ferrand', description: "Le pharmacien se souvient : « Maître Ferrand, pour les rats de son étude. »" },
        { id: 'k_testament', name: 'Le comte voulait retirer ses biens à Ferrand', description: "Le brouillon confie la gestion du domaine à un autre notaire." },
        { id: 'k_detournement', name: 'Ferrand détournait de l\'argent', description: "12 000 francs manquent dans les comptes tenus par le notaire." },
        { id: 'k_date', name: 'Date du mariage : 14 juillet 1902', description: "Votre oncle répétait que c'était « le plus beau jour de sa vie »." },
        { id: 'k_denonciation', name: 'Le comte allait dénoncer Ferrand', description: "La lettre au procureur accuse Ferrand d'abus de confiance." },
        { id: 'k_dettes', name: 'Camille a 8 000 francs de dettes', redHerring: true, description: "Un mobile possible, mais une fausse piste." },
        { id: 'k_morphine', name: 'Le Dr Brun prescrivait de la morphine', redHerring: true, description: "Des ordonnances de complaisance, sans lien avec la mort." },
        { id: 'k_coupable', name: 'Vous avez empoisonné le comte', description: "Vous êtes le coupable. Ne le révélez jamais." },
      ],
      steps: [
        {
          id: 's_decouverte', title: 'Découverte du corps', type: 'revelation', act: 'Acte 1', location: 'Salle à manger', public: true,
          giveKnow: ['k_mort'], duration: '5',
          description: "Le maître du jeu lance la partie : toast, effondrement du comte, stupeur générale.",
          playerText: "Le comte lève son verre : « À la vérité, qui finit toujours par éclater ! » Il boit, pâlit, et s'effondre sur la nappe.",
        },
        {
          id: 's_verre', title: 'Récupérer le verre du comte', type: 'fouille', act: 'Acte 1', location: 'Salle à manger',
          reqSteps: ['s_decouverte'], giveItems: ['i_verre'], duration: '2',
          description: "Le verre reste sur la table tant que personne ne pense à le prendre.",
        },
        {
          id: 's_examen', title: 'Examen du corps', type: 'action', act: 'Acte 1', location: 'Salle à manger',
          who: ['c_colette'], reqKnow: ['k_mort'], giveKnow: ['k_empoisonne'], duration: '5',
          description: "Seule la docteure peut examiner le corps. Lui remettre la carte « Constatations ».",
        },
        {
          id: 's_analyse', title: 'Analyse du verre', type: 'enigme', act: 'Acte 2', location: 'Cuisine',
          who: ['c_colette'], reqItems: ['i_verre'], reqKnow: ['k_empoisonne'], giveKnow: ['k_arsenic'], duration: '10',
          description: "Mini-énigme de chimie : identifier le poison grâce au tableau des réactifs.",
          playerText: "Vous disposez de trois réactifs. Le vin devient jaune avec le premier, reste inchangé avec le deuxième, et dégage une odeur d'ail avec le troisième. Consultez le tableau des poisons.",
          solution: 'Arsenic', hints: "Regardez la colonne « odeur ».\nL'odeur d'ail est caractéristique d'un seul poison du tableau.",
        },
        {
          id: 's_salon', title: 'Fouille du salon', type: 'fouille', act: 'Acte 1', location: 'Salon',
          reqSteps: ['s_decouverte'], giveItems: ['i_lettre_anonyme'], duration: '5',
        },
        {
          id: 's_lettre', title: 'Lire la lettre anonyme', type: 'revelation', act: 'Acte 1', location: 'Salon',
          reqItems: ['i_lettre_anonyme'], giveKnow: ['k_liaison'],
          description: "Fausse piste destinée à mettre Hélène et Lucien sous pression.",
        },
        {
          id: 's_cave', title: 'Descendre à la cave', type: 'fouille', act: 'Acte 2', location: 'Cave',
          reqItems: ['i_cle_cave'], reqKnow: ['k_cave21h'], giveItems: ['i_flacon', 'i_mouchoir'], duration: '10',
          description: "Victor a la clé et le souvenir de la silhouette. Il doit accepter d'avouer qu'il a une clé de la cave.",
        },
        {
          id: 's_flacon', title: 'Reconstituer l\'étiquette du flacon', type: 'enigme', act: 'Acte 2', location: 'Cave',
          reqItems: ['i_flacon'], reqKnow: ['k_arsenic'], giveKnow: ['k_pharmacie'], duration: '10',
          description: "Puzzle : l'étiquette déchirée en 6 morceaux est à reconstituer.",
          playerText: "Rassemblez les morceaux de l'étiquette trouvés dans le flacon.",
          solution: 'Pharmacie Martin, Saint-Galmier', hints: "Commencez par les bords droits.\nLe nom de la ville est une commune thermale de la Loire.",
        },
        {
          id: 's_telephone', title: 'Téléphoner à la pharmacie', type: 'dialogue', act: 'Acte 3', location: 'Hall, téléphone',
          reqKnow: ['k_pharmacie'], giveKnow: ['k_achat_ferrand'], duration: '5',
          description: "Le maître du jeu joue le pharmacien au téléphone. Il ne parle que si on lui cite le nom de la pharmacie.",
        },
        {
          id: 's_bureau', title: 'Fouiller le bureau du comte', type: 'fouille', act: 'Acte 2', location: 'Bureau',
          reqSteps: ['s_decouverte'], reqItems: ['i_cle_bureau'], giveItems: ['i_brouillon', 'i_registre'], duration: '10',
        },
        {
          id: 's_brouillon', title: 'Lire le brouillon de testament', type: 'revelation', act: 'Acte 2', location: 'Bureau',
          reqItems: ['i_brouillon'], giveKnow: ['k_testament'],
        },
        {
          id: 's_registre', title: 'Déchiffrer le registre', type: 'enigme', act: 'Acte 2', location: 'Bureau',
          reqItems: ['i_registre'], giveKnow: ['k_detournement'], duration: '15',
          description: "Additionner les colonnes : les totaux reportés ne correspondent pas.",
          playerText: "Voici trois pages du registre des comptes du domaine. Quelque chose cloche.",
          solution: '12 000 francs manquent', hints: "Refaites les additions de chaque page.\nComparez le total d'une page avec le report en haut de la suivante.",
        },
        {
          id: 's_coffre', title: 'Ouvrir le coffre-fort', type: 'enigme', act: 'Acte 3', location: 'Bureau',
          reqSteps: ['s_bureau'], reqKnow: ['k_date'], giveItems: ['i_reconnaissance', 'i_lettre_procureur'], duration: '10',
          description: "Cadenas à 6 chiffres. Camille connaît la date sans le savoir.",
          playerText: "Sur la porte du coffre, une plaque gravée : « Le plus beau jour de ma vie ». Six molettes numérotées.",
          solution: '140702', hints: "Le comte parlait souvent du plus beau jour de sa vie.\nDemandez à la famille la date du mariage.",
        },
        {
          id: 's_lettre_proc', title: 'Lire la lettre au procureur', type: 'revelation', act: 'Acte 3', location: 'Bureau',
          reqItems: ['i_lettre_procureur'], giveKnow: ['k_denonciation'],
        },
        {
          id: 's_dettes', title: 'Confronter Camille', type: 'dialogue', act: 'Acte 3',
          reqItems: ['i_reconnaissance'], giveKnow: ['k_dettes'],
          description: "Fausse piste : Camille avait un mobile, mais pas l'occasion.",
        },
        {
          id: 's_accusation', title: 'Accusation finale', type: 'fin', act: 'Acte 3', location: 'Salon', public: true,
          reqItems: ['i_mouchoir'], reqKnow: ['k_arsenic', 'k_achat_ferrand', 'k_detournement', 'k_denonciation'], duration: '15',
          description: "Chacun désigne un coupable et explique le mobile, l'arme et l'occasion. Le maître du jeu lit ensuite la vérité.",
        },
      ],
    });
  };
})();
