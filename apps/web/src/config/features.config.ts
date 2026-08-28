/**
 * Interrupteurs de fonctionnalités — booléens uniquement, aucune valeur
 * métier ici (un tarif, un texte legal vont dans `app.config.ts` ou en
 * base, jamais ici).
 *
 * Comportement d'un interrupteur à `false` : l'écran n'apparaît pas, la
 * route n'est pas exposée. Jamais un bouton visible qui échoue.
 */
export const features = {
  /** Consentement CGU, export et suppression de compte (voir `screens/Confidentialite.tsx`, `Parametres.tsx`). */
  rgpd: true,
  /**
   * Partage d'un même espace de données entre plusieurs personnes (ex.
   * co-parents). La table `workspaces` existe déjà (migration 0013), mais
   * aucune donnée existante n'en dépend et aucune UI d'invitation n'existe
   * encore : ce drapeau reste à `false` jusqu'à la Phase 2.
   */
  workspacePartage: false,
  /** Photo de ticket à la saisie + écran « Justificatifs » (voir `screens/Justificatifs.tsx`). */
  justificatifs: true,
} as const;
