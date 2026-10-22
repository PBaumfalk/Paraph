// Versionierte Erklärungstexte. Der angezeigte Text und der protokollierte Hash stammen aus derselben Quelle.
import { CONSENT_VERSION } from './model.js';

export type ConsentKind = 'signer' | 'approver' | 'filler' | 'witness';

const TEXTS: Record<'de' | 'en', Record<ConsentKind, { action: string; statement: string; electronic: string }>> = {
  de: {
    signer: {
      action: 'Verbindlich unterschreiben',
      statement: 'Ich unterschreibe die oben angezeigten Dokumente in genau dieser Fassung. Mit „Verbindlich unterschreiben“ gebe ich die darin enthaltenen Erklärungen als meine eigenen ab.',
      electronic: 'Ich bin einverstanden, diese Erklärung elektronisch abzugeben. Es handelt sich um eine einfache elektronische Signatur (EES), nicht um eine qualifizierte elektronische Signatur; wo das Gesetz Schriftform oder notarielle Form verlangt, genügt sie nicht. Zum Nachweis werden Zeitpunkte, IP-Adresse, Browserkennung, der Zugangsweg und mein Unterschriftsbild protokolliert. Nach Abschluss erhalte ich eine Kopie der unterschriebenen Dokumente.',
    },
    witness: {
      action: 'Als Zeuge unterschreiben',
      statement: 'Ich bestätige als Zeuge die Unterzeichnung der oben angezeigten Dokumente in genau dieser Fassung.',
      electronic: 'Ich bin einverstanden, diese Erklärung elektronisch abzugeben (einfache elektronische Signatur); der Ablauf wird protokolliert.',
    },
    approver: {
      action: 'Freigeben',
      statement: 'Ich gebe die oben angezeigten Dokumente in genau dieser Fassung frei.',
      electronic: 'Ich bin einverstanden, diese Freigabe elektronisch zu erteilen; der Ablauf wird protokolliert.',
    },
    filler: {
      action: 'Angaben übermitteln',
      statement: 'Ich bestätige, dass meine Angaben in den von mir ausgefüllten Feldern richtig sind.',
      electronic: 'Ich bin einverstanden, die Angaben elektronisch zu übermitteln; der Ablauf wird protokolliert.',
    },
  },
  en: {
    signer: {
      action: 'Sign',
      statement: 'I sign the documents shown above in exactly this version. By clicking “Sign” I make the declarations contained therein as my own.',
      electronic: 'I agree to make this declaration electronically. This is a simple electronic signature (SES), not a qualified electronic signature; where the law requires written or notarial form, it is not sufficient. As evidence, times, IP address, browser identification, the access method and my signature image are logged. After completion I will receive a copy of the signed documents.',
    },
    witness: {
      action: 'Sign as witness',
      statement: 'As a witness, I confirm the signing of the documents shown above in exactly this version.',
      electronic: 'I agree to make this declaration electronically (simple electronic signature); the process is logged.',
    },
    approver: {
      action: 'Approve',
      statement: 'I approve the documents shown above in exactly this version.',
      electronic: 'I agree to give this approval electronically; the process is logged.',
    },
    filler: {
      action: 'Submit',
      statement: 'I confirm that my entries in the fields I completed are correct.',
      electronic: 'I agree to submit the entries electronically; the process is logged.',
    },
  },
};

export function consentText(kind: ConsentKind, locale: 'de' | 'en') {
  const t = TEXTS[locale][kind];
  return { version: CONSENT_VERSION, ...t, full: `${t.statement}\n${t.electronic}` };
}
