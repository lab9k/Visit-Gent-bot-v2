import {
  ComponentDialog,
  DialogState,
  DialogSet,
  DialogTurnStatus,
  ChoicePrompt,
  WaterfallDialog,
  WaterfallStepContext,
  DialogContext,
  DialogTurnResult,
  TextPrompt,
} from 'botbuilder-dialogs';
import { ILogger } from '../logger';
import {
  TurnContext,
  StatePropertyAccessor,
  ActivityTypes,
  CardFactory,
  MessageFactory,
} from 'botbuilder';
import conceptMapping from '../lang/conceptMapping';
import { ConfirmTypes } from '../models/ConfirmTypes';
import lang from '../lang';
import { ChannelId } from '../models/ChannelIds';
import { FacebookCardBuilder, FacebookCard } from '../models/FacebookCard';
import * as Turndown from 'turndown';
import { map } from 'lodash';
import CitynetApi from '../api/CitynetApi';
import { checkNested, isFacebook } from '../util';

const MAIN_WATERFALL_DIALOG = 'MAIN_WATERFALL_DIALOG';
const CONFIRM_PROMPT_ID = 'confirm_prompt';
const QUESTION_PROMPT_ID = 'question_prompt_id';
export class MainDialog extends ComponentDialog {
  private api: CitynetApi;
  private docsAccessor: StatePropertyAccessor<QueryResponse.QueryResponse>;
  constructor(private logger: ILogger) {
    super('MainDialog');

    this.addDialog(new ChoicePrompt(CONFIRM_PROMPT_ID));
    this.addDialog(new TextPrompt(QUESTION_PROMPT_ID));
    this.addDialog(
      new WaterfallDialog(MAIN_WATERFALL_DIALOG, [
        this.introStep.bind(this),
        this.handleIntro.bind(this),
        this.handleUserWantsExample.bind(this),
        this.handleQuestion.bind(this),
        this.handleConcept.bind(this),
        this.handleFeedback.bind(this),
      ]),
    );

    this.api = new CitynetApi();
    this.initialDialogId = MAIN_WATERFALL_DIALOG;
  }

  public async run(
    context: TurnContext,
    accessor: StatePropertyAccessor<DialogState>,
    docsAccessor: StatePropertyAccessor<QueryResponse.QueryResponse>,
  ) {
    this.docsAccessor = docsAccessor;
    const dialogSet = new DialogSet(accessor);
    dialogSet.add(this);

    const dialogContext = await dialogSet.createContext(context);
    const results = await dialogContext.continueDialog();

    if (results.status === DialogTurnStatus.empty) {
      await dialogContext.beginDialog(this.id);
    }
  }

  private async introStep(step: WaterfallStepContext) {
    return await step.prompt(CONFIRM_PROMPT_ID, {
      choices: [
        { value: ConfirmTypes.POSITIVE },
        { value: ConfirmTypes.NEGATIVE },
        { value: 'Medewerker' },
      ],
      prompt: 'Citybot proberen?',
      retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
    });
  }

  private async handleIntro(step: WaterfallStepContext) {
    this.logger.log('handleIntro');
    if (step.context.activity.text === ConfirmTypes.NEGATIVE) {
      console.log('sending yes reply');
      await step.context.sendActivity(
        'Geen probleem. Misschien een volgende keer.' +
          ' U kunt steeds hier terecht met uw vragen. Prettige dag verder. 👏',
      );
      return await step.endDialog();
    }
    if (step.context.activity.text === ConfirmTypes.POSITIVE) {
      return await step.prompt(CONFIRM_PROMPT_ID, {
        choices: [{ value: 'Ja graag' }, { value: 'Neen ik begrijp het' }],
        prompt: `Wenst u even te zien op welke manier vragen gesteld kunnen worden? `,
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      });
    }
    if (step.context.activity.text === 'Medewerker') {
      // ? User wants to talk to a person
      await this.handleEmployee(step.context);
      return await step.endDialog();
    }
  }

  private async handleUserWantsExample(
    step: WaterfallStepContext,
  ): Promise<DialogTurnResult> {
    if (step.context.activity.text === 'Ja graag') {
      // tslint:disable:max-line-length
      await step.context.sendActivity(
        `Een voorbeeldvraag zou kunnen zijn:
"Welke beslissingen werden in de Gemeenteraad genomen omtrent de vernieuwing van onze sportterreinen?" `,
      );
      // tslint:enable:max-line-length
      return await step.prompt(QUESTION_PROMPT_ID, {
        prompt: 'Stel gerust je vraag. 🤖',
      });
    }
    if (step.context.activity.text === 'Neen ik begrijp het') {
      return await step.prompt(QUESTION_PROMPT_ID, {
        prompt: 'Stel gerust je vraag. 🤖',
      });
    }
  }

  private async handleQuestion(
    step: WaterfallStepContext,
  ): Promise<DialogTurnResult> {
    // ? Send the documents
    console.log('handleQuestion');
    await step.context.sendActivity(lang.getStringFor(lang.WAIT_WHILE_FETCH));

    await step.context.sendActivity({
      type: ActivityTypes.Typing,
    });
    const resolved: QueryResponse.QueryResponse = await this.api.query(
      step.context.activity.text,
    );

    // ? break when no documents were found
    if (!resolved.documents || resolved.documents.length <= 0) {
      await step.context.sendActivity(lang.getStringFor(lang.NO_DOCS_FOUND));
      await step.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      await step.endDialog();
      return await step.beginDialog(this.id);
    }

    // ? save resolved documents to local storage
    await this.docsAccessor.set(step.context, resolved);

    // ? ask if concept is correct
    if (!resolved.conceptsOfQuery) {
      console.log('no concepts, skipping question');
      await step.next();
      return await this.handleConcept(step, true);
    }

    const formatConcepts = (conceptsArray: string[]) =>
      conceptsArray.map(concept => conceptMapping(concept)).join(', ');
    return await step.prompt('confirm_prompt', {
      prompt: lang
        .getStringFor(lang.ASK_CORRECT_CONCEPTS)
        .replace('%1%', formatConcepts(resolved.conceptsOfQuery || [])),
      retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      choices: [ConfirmTypes.POSITIVE, ConfirmTypes.NEGATIVE, 'Medewerker'],
    });
  }

  private async handleConcept(
    step: WaterfallStepContext,
    skipped?: boolean,
  ): Promise<DialogTurnResult> {
    const answer = step.context.activity.text;
    if (answer === ConfirmTypes.POSITIVE || skipped) {
      const resolved: QueryResponse.QueryResponse = await this.docsAccessor.get(
        step.context,
      );
      await step.context
        .sendActivity(`Dit is de relevante info die ik heb gevonden in
de notulen van de Gemeenteraad. U kan de bestanden downloaden door op de knop te drukken.`);
      if (step.context.activity.channelId === ChannelId.Facebook) {
        const fbCardBuilder = new FacebookCardBuilder();
        resolved.documents
          .sort((a, b) => {
            return b.scoreInPercent - a.scoreInPercent;
          })
          .forEach((doc, i) => {
            const desc = this.getBestParagraphForDoc(doc);
            return fbCardBuilder.addCard(
              new FacebookCard(
                doc.originalURI,
                `${desc}...`,
                {
                  type: 'postback',
                  title: 'Download pdf',
                  payload: JSON.stringify({
                    type: 'download',
                    value: {
                      uuid: doc.resourceURI,
                    },
                  }),
                },
                {
                  type: 'postback',
                  title: 'Paragraaf',
                  payload: JSON.stringify({
                    type: 'highlight',
                    value: {
                      uuid: doc.resourceURI,
                    },
                  }),
                },
              ),
            );
          });
        await step.context.sendActivity(fbCardBuilder.getData());
      } else {
        const cards = map(
          resolved.documents.sort((a, b) => {
            return b.scoreInPercent - a.scoreInPercent;
          }),
          document => {
            const desc = this.getBestParagraphForDoc(document);
            return CardFactory.heroCard(
              document.originalURI,
              `${desc}...`,
              [{ url: encodeURI(process.env.CARD_LOGO) || undefined }],
              [
                {
                  type: 'messageBack',
                  title: 'download document',
                  value: JSON.stringify({
                    type: 'download',
                    value: { uuid: document.resourceURI },
                  }),
                },
                {
                  type: 'messageBack',
                  title: 'Paragraaf',
                  value: JSON.stringify({
                    type: 'highlight',
                    value: { uuid: document.resourceURI },
                  }),
                },
              ],
            );
          },
        );
        await step.context.sendActivity(MessageFactory.carousel(cards));
      }
      return await step.prompt('confirm_prompt', {
        prompt: 'Hebt u gevonden wat u zocht?',
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
        choices: [ConfirmTypes.POSITIVE, ConfirmTypes.NEGATIVE, 'Medewerker'],
      });
    }
    if (answer === ConfirmTypes.NEGATIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      const r = await step.endDialog();
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        return await step.beginDialog(this.id);
      }
      return r;
    }
    if (answer === 'Medewerker') {
      await this.handleEmployee(step.context);
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        return await step.beginDialog(this.id);
      }
      return await step.cancelAllDialogs();
    }
  }

  private async handleFeedback(step: WaterfallStepContext) {
    const answer = step.context.activity.text;
    if (answer === ConfirmTypes.POSITIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.THANK_FEEDBACK));
      await step.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        await step.beginDialog(this.id);
      } else {
        await step.cancelAllDialogs();
      }
    } else if (answer === ConfirmTypes.NEGATIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      await step.endDialog();
      // if (step.context.activity.channelId !== ChannelId.Facebook) {
      await step.beginDialog(this.id);
      // }
    } else if (answer === 'Medewerker') {
      await this.handleEmployee(step.context);
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        await step.beginDialog(this.id);
      } else {
        await step.cancelAllDialogs();
      }
    }
  }

  private async handleEmployee(context: TurnContext) {
    await context.sendActivity(
      `Uw vragen worden doorgestuurd naar een medewerker van uw stad of gemeente.
Prettige dag verder ☀️`,
    );
  }
  private getBestParagraphForDoc(doc: QueryResponse.Document): string {
    const bestParagraph = doc.paragraphs.sort((a, b) => {
      return b.scoreInPercent - a.scoreInPercent;
    })[0];
    const td = new Turndown();
    const p = bestParagraph.highlighting
      ? bestParagraph.highlighting.join(' ')
      : bestParagraph.content;
    const reply = td.turndown(p);
    return reply;
  }
}
