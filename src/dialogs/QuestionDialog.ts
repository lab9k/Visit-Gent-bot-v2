import {
  WaterfallDialog,
  WaterfallStepContext,
  DialogContext,
  ConfirmPrompt,
} from 'botbuilder-dialogs';
import {
  MessageFactory,
  ActivityTypes,
  CardFactory,
  UserState,
  StatePropertyAccessor,
  TurnContext,
} from 'botbuilder';
import CitynetApi from '../api/CitynetApi';
import { map, take } from 'lodash';
import lang from '../lang';
import conceptMapping from '../lang/conceptMapping';

import { ConfirmTypes } from '../models/ConfirmTypes';
import { readFileSync } from 'fs';
import { ChannelId } from '../models/ChannelIds';
import { FacebookCardBuilder, FacebookCard } from '../models/FacebookCard';
import nodeFetch from 'node-fetch';
import * as FormData from 'form-data';
import * as Turndown from 'turndown';
import CloudinaryApi from '../api/CloudinaryApi';
import IOptions from '../models/IOptions';
import { DocumentErrors } from '../models/DocumentErrors';

export default class QuestionDialog extends WaterfallDialog {
  public static readonly ID = 'question_dialog';
  private readonly api: CitynetApi;
  private options: IOptions;
  private readonly docsAccessor: StatePropertyAccessor<
    QueryResponse.QueryResponse
  >;
  constructor(userState: UserState) {
    super(QuestionDialog.ID);
    this.docsAccessor = userState.createProperty<QueryResponse.QueryResponse>(
      'resolved_data',
    );
    this.addStep(this.wantToStartQuestion.bind(this));
    this.addStep(this.handleStart.bind(this));
    this.addStep(this.handleUserWantsExample.bind(this));
    this.addStep(this.handleQuestion.bind(this));
    this.addStep(this.handleConcept.bind(this));
    this.addStep(this.handleFeedback.bind(this));
    // this.addStep(this.handlePersonRequest.bind(this));
    this.api = new CitynetApi();
  }

  private async wantToStartQuestion(step: WaterfallStepContext) {
    console.log(step.context.activity.text);
    await step.prompt('confirm_prompt', {
      choices: [
        { value: ConfirmTypes.POSITIVE },
        { value: ConfirmTypes.NEGATIVE },
        { value: 'Medewerker' },
      ],
      prompt: 'Citybot proberen?',
      retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
    });
  }

  private async handleStart(step: WaterfallStepContext) {
    if (step.context.activity.text === ConfirmTypes.NEGATIVE) {
      // ? user does not want to try
      await step.context.sendActivity(
        'Geen probleem. Misschien een volgende keer.' +
          ' U kunt steeds hier terecht met uw vragen. Prettige dag verder. 👏',
      );
      await step.endDialog();
    } else if (step.context.activity.text === ConfirmTypes.POSITIVE) {
      // ? user wants to try
      await step.prompt('confirm_prompt', {
        choices: [{ value: 'Ja graag' }, { value: 'Neen ik begrijp het' }],
        prompt: `Wenst u even te zien op welke manier vragen gesteld kunnen worden? `,
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      });
    } else if (step.context.activity.text === 'Medewerker') {
      // ? User wants to talk to a person
      await this.handleEmployee(step.context);
      return await step.endDialog();
    }
  }

  private async handleUserWantsExample(step: WaterfallStepContext) {
    if (step.context.activity.text === 'Ja graag') {
      // tslint:disable:max-line-length
      await step.context.sendActivity(
        `Een voorbeeldvraag zou kunnen zijn:
"Welke beslissingen werden in de Gemeenteraad genomen omtrent de vernieuwing van onze sportterreinen?" `,
      );
      // tslint:enable:max-line-length
      await step.context.sendActivity('Stel gerust je vraag. 🤖');
    } else if (step.context.activity.text === 'Neen ik begrijp het') {
      await step.context.sendActivity('Stel gerust je vraag.');
    }
  }

  private async handleQuestion(step: WaterfallStepContext) {
    // ? Send the documents
    await step.context.sendActivity(lang.getStringFor(lang.WAIT_WHILE_FETCH));

    await step.context.sendActivity({
      type: ActivityTypes.Typing,
    });
    const resolved: QueryResponse.QueryResponse = await this.api.query(
      step.context.activity.text,
      this.options,
    );

    // ? break when no documents were found
    if (!resolved.documents || resolved.documents.length <= 0) {
      await step.context.sendActivity(lang.getStringFor(lang.NO_DOCS_FOUND));
      await step.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      await step.endDialog();
      return await step.beginDialog(QuestionDialog.ID);
    }

    // ? save resolved documents to local storage
    await this.docsAccessor.set(step.context, resolved);

    // ? ask if concept is correct
    if (!resolved.conceptsOfQuery) {
      console.log('no concepts, skipping question');
      await step.next();
      return await this.handleConcept(step, true);
    }

    await this.waitFor(step, async () => {
      const formatConcepts = (conceptsArray: string[]) =>
        conceptsArray.map(concept => conceptMapping(concept)).join(', ');
      await step.prompt('confirm_prompt', {
        prompt: lang
          .getStringFor(lang.ASK_CORRECT_CONCEPTS)
          .replace('%1%', formatConcepts(resolved.conceptsOfQuery || [])),
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
        choices: [ConfirmTypes.POSITIVE, ConfirmTypes.NEGATIVE, 'Medewerker'],
      });
    });
  }

  private async handleConcept(step: WaterfallStepContext, skipped?: boolean) {
    const answer = step.context.activity.text;
    if (answer === ConfirmTypes.POSITIVE || skipped) {
      const resolved: QueryResponse.QueryResponse = await this.docsAccessor.get(
        step.context,
      );
      await step.context
        .sendActivity(`Dit is de relevante info die ik heb gevonden in
de notulen van de Gemeenteraad. U kan de bestanden downloaden door op de knop te drukken.`);
      if (step.context.activity.channelId === ChannelId.Facebook) {
        console.log(JSON.stringify(resolved.documents));
        const fbCardBuilder = new FacebookCardBuilder();
        resolved.documents
          .sort((a, b) => {
            return b.scoreInPercent - a.scoreInPercent;
          })
          .forEach((doc, i) => {
            const desc = this.getBestParagraphForDoc(doc);
            if (desc !== DocumentErrors.NO_DOC_FOUND) {
              return fbCardBuilder.addCard(
                new FacebookCard(
                  doc.originalURI,
                  `${desc}...`,
                  this.options.cardUrl,
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
            }
          });
        if (!fbCardBuilder.isEmpty()) {
          await step.context.sendActivity(fbCardBuilder.getData());
        } else {
          await step.context.sendActivity(
            'Ik je vraag begrepen, maar geen documenten gevonden.',
          );
        }
      } else {
        const cards = map(
          resolved.documents.sort((a, b) => {
            return b.scoreInPercent - a.scoreInPercent;
          }),
          document => {
            const desc = this.getBestParagraphForDoc(document);
            if (desc !== DocumentErrors.NO_DOC_FOUND) {
              return CardFactory.heroCard(
                document.originalURI,
                `${desc}...`,
                [{ url: encodeURI(this.options.cardUrl) || undefined }],
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
            }
          },
        );
        if (cards.length > 0) {
          await step.context.sendActivity(MessageFactory.carousel(cards));
        } else {
          await step.context.sendActivity(
            'Ik je vraag begrepen, maar geen documenten gevonden.',
          );
        }
      }
      await step.prompt('confirm_prompt', {
        prompt: 'Hebt u gevonden wat u zocht?',
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
        choices: [ConfirmTypes.POSITIVE, ConfirmTypes.NEGATIVE, 'Medewerker'],
      });
    } else if (answer === ConfirmTypes.NEGATIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      await step.endDialog();
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.beginDialog(QuestionDialog.ID);
      }
    } else if (answer === 'Medewerker') {
      await this.handleEmployee(step.context);
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        await step.beginDialog(QuestionDialog.ID);
      } else {
        await step.cancelAllDialogs();
      }
    }
  }

  private async handleFeedback(step: WaterfallStepContext) {
    const answer = step.context.activity.text;
    if (answer === ConfirmTypes.POSITIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.THANK_FEEDBACK));
      await step.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        await step.beginDialog(QuestionDialog.ID);
      } else {
        await step.cancelAllDialogs();
      }
    } else if (answer === ConfirmTypes.NEGATIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      await step.endDialog();
      // if (step.context.activity.channelId !== ChannelId.Facebook) {
      await step.beginDialog(QuestionDialog.ID);
      // }
    } else if (answer === 'Medewerker') {
      await this.handleEmployee(step.context);
      if (step.context.activity.channelId !== ChannelId.Facebook) {
        await step.endDialog();
        await step.beginDialog(QuestionDialog.ID);
      } else {
        await step.cancelAllDialogs();
      }
    }
  }

  public async sendHighlight(dialogContext: DialogContext, uuid: string) {
    const resolvedDocs: QueryResponse.QueryResponse = await this.docsAccessor.get(
      dialogContext.context,
    );
    const chosenDoc = resolvedDocs.documents.find(d => d.resourceURI === uuid);

    const reply = this.getBestParagraphForDoc(chosenDoc);

    await dialogContext.context.sendActivity(reply);
  }

  public async sendFile(
    dialogContext: DialogContext,
    uuid: string,
  ): Promise<any> {
    const resourceUri: string = uuid;

    console.log('downloading');
    const ret = await this.api.downloadFile(resourceUri, this.options);

    const filedata = readFileSync(`./downloads/${ret.filename}`);
    const base64file = Buffer.from(filedata).toString('base64');

    if (dialogContext.context.activity.channelId === ChannelId.Facebook) {
      const fd = new FormData();
      fd.append('filedata', ret.buffer, {
        filename: ret.filename,
        contentType: ret.contentType,
      });
      // curl -H "Max-Downloads: 1" -H "Max-Days: 5"
      // --upload-file ./hello.txt https://transfer.sh/hello.txt
      await dialogContext.context.sendActivity(
        `Ik stuur je de downloadlink onmiddelijk door.`,
      );
      try {
        const res = await CloudinaryApi.upload(`./downloads/${ret.filename}`);
        return await dialogContext.context.sendActivity(res.secure_url);

        // const res = await nodeFetch(`https://upfile.sh/${ret.filename}`, {
        //   method: 'PUT',
        //   body: fd,
        //   headers: [['Max-Downloads', '10'], ['Max-Days', '5']],
        // });
        // const resText = await res.json();
        // return await dialogContext.context.sendActivity(`${resText.dow}`);
      } catch (error) {
        throw error;
      }
    }
    const reply = {
      type: ActivityTypes.Message,
      attachments: [
        {
          name: ret.filename,
          contentUrl: `data:${ret.contentType};base64,${base64file}`,
          contentType: ret.contentType,
        },
      ],
    };

    return await dialogContext.context.sendActivity(reply);
  }

  private async handleEmployee(context: TurnContext) {
    await context.sendActivity(
      `Uw vragen worden doorgestuurd naar een medewerker van uw stad of gemeente.
Prettige dag verder ☀️`,
    );
  }

  private async waitFor(step: DialogContext, cb: Function): Promise<any> {
    await step.context.sendActivity({
      type: ActivityTypes.Typing,
    });
    return new Promise(resolve => {
      // wait 1 to 2 secs for natural feeling
      setTimeout(() => {
        resolve(cb());
      },         Math.random() * 1000 + 1000);
    });
  }

  private getBestParagraphForDoc(doc: QueryResponse.Document): string {
    const td = new Turndown();
    let highlight = '';
    if (doc.paragraphs && doc.paragraphs.length > 0) {
      highlight = td.turndown(doc.paragraphs[0].content);
    } else {
      highlight = td.turndown(doc.summary);
    }

    return td.turndown(highlight);
  }

  setOptions(options: IOptions) {
    this.options = options;
  }
}
