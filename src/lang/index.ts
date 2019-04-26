import { sample } from 'lodash';

export default new class {
  public readonly WELCOME = 'welcome';
  public readonly WAIT_WHILE_FETCH = 'wait_while_fetch';
  public readonly NO_DOCS_FOUND = 'no_docs_found';
  public readonly NOT_UNDERSTOOD_USE_BUTTONS = 'NOT_UNDERSTOOD_USE_BUTTONS';
  public readonly USEFULLNESS_QUERY = 'USEFULLNESS_QUERY';
  public readonly MORE_QUESTIONS = 'more_questions';
  public readonly THANK_FEEDBACK = 'thank_feedback';
  public readonly REAL_PERSON = 'real_person';
  public readonly EMAIL_SENT = 'email_sent';
  public readonly POSITIVE = 'Ja';
  public readonly NEGATIVE = 'Nee';
  public readonly READ_MORE = 'lees_meer';
  public readonly ASK_CORRECT_CONCEPTS = 'ask_correct_concepts';
  public readonly REPHRASE = 'rephrase_question';
  public readonly PRIVACY_INFO = 'privacy info';

  private options = {
    [this.WELCOME]: [
      `Hallo!
      Ik ben een bot, mij kan je verschillende vragen stellen over e-besluitvorming in Gent.`,
      `Ik ben een bot aan wie je vragen kan stellen over e-besluitvorming in Gent`,
    ],
    [this.WAIT_WHILE_FETCH]: [
      `Even geduld terwijl ik de juiste documenten zoek.`,
      'Ok, ik zal even gaan zoeken naar de juiste documenten.',
    ],
    [this.NO_DOCS_FOUND]: [
      `Helaas heb ik niets teruggevonden.`,
      'Hier heb ik geen enkel document over gevonden.',
      'Jammer genoeg vind ik niets terug.',
    ],
    [this.NOT_UNDERSTOOD_USE_BUTTONS]: [
      'Dat heb ik niet verstaan. Gelieve de knoppen te gebruiken.',
      'Wat?',
    ],
    [this.USEFULLNESS_QUERY]: [
      'Waren deze documenten nuttig?',
      'Wat vond je van deze documenten?',
    ],
    [this.REAL_PERSON]: [
      'Wil je dat ik een echte persoon haal?',
      'Als je wil kan ik er een echte persoon bij halen. Goed?',
    ],
    [this.EMAIL_SENT]: [
      'Ok, ik heb de vraag behandeld, er komt binnenkort iemand op terug.',
      'Ok, ik heb een mail verzonden. Binnekort word deze behandeld door een echte persoon.',
    ],
    [this.THANK_FEEDBACK]: [
      'Bedankt voor de feedback!',
      'Merci! Door deze feedback word ik alleen maar slimmer.',
    ],
    [this.MORE_QUESTIONS]: [
      'Heb je nog meer vragen? Wees niet bang om ze hier te stellen.',
      'Indien je nog vragen hebt, kan je ze hier stellen.',
    ],
    [this.READ_MORE]: ['Download pdf'],
    [this.ASK_CORRECT_CONCEPTS]: [
      'Ik heb documenten teruggevonden over: "%1%", is dit correct?',
      'Ik heb een jouw vraag gelinkt aan de volgende concepten:\n"%1%"\nKlopt dit?',
    ],
    [this.REPHRASE]: [
      'Kan je de vraag op een andere manier stellen zodat ik in het juiste domein ga zoeken?',
      'Gelieve de vraag iets specifieker te maken, zodat ik op de juiste plek ga zoeken',
    ],
    [this.PRIVACY_INFO]: [
      'Uw vragen en privacy worden volgens GDPR wetgeving behandeld. U' +
        'kan zich evenwel ten alle tijde richten tot een medewerker van uw Stad of ' +
        'Gemeente door op \'Medewerker\' te klikken.',
    ],
    default: [],
  };

  getStringFor(key: string): string {
    return sample(this.options[key] || this.options.default);
  }
}();
