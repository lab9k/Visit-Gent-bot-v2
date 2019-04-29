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
import FeedbackPrompt from './FeedbackPrompt';
import lang from '../lang';
import conceptMapping from '../lang/conceptMapping';

import QueryResponse from '../models/QueryResponse';
import { ConfirmTypes } from '../models/ConfirmTypes';
import { readFileSync } from 'fs';
import { ChannelId } from '../models/ChannelIds';
import { FacebookCardBuilder, FacebookCard } from '../models/FacebookCard';
import nodeFetch from 'node-fetch';
import * as FormData from 'form-data';

export default class QuestionDialog extends WaterfallDialog {
  public static readonly ID = 'question_dialog';
  private readonly api: CitynetApi;
  private readonly docsAccessor: StatePropertyAccessor<QueryResponse>;
  constructor(userState: UserState) {
    super(QuestionDialog.ID);
    this.docsAccessor = userState.createProperty<QueryResponse>(
      'resolved_data',
    );
    this.addStep(this.wantToStartQuestion.bind(this));
    this.addStep(this.handleStart.bind(this));
    this.addStep(this.handleUserWantsExample.bind(this));
    this.addStep(this.handleQuestion.bind(this));
    this.addStep(this.handleConcept.bind(this));

    // this.addStep(this.handleFeedback.bind(this));
    // this.addStep(this.handlePersonRequest.bind(this));
    this.api = new CitynetApi();
  }

  private async wantToStartQuestion(step: WaterfallStepContext) {
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
      await step.endDialog();
    } else if (step.context.activity.text === ConfirmTypes.POSITIVE) {
      // ? user wants to try
      await step.prompt('confirm_prompt', {
        choices: [{ value: 'Ja graag' }, { value: 'Neen ik begrijp het' }],
        prompt: `Wenst u even te zien op welke manier vragen gesteld kunnen worden?`,
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      });
    } else if (step.context.activity.text === 'Medewerker') {
      // ? User wants to talk to a person
      await this.handleEmployee(step.context);
      await step.endDialog();
    }
  }

  private async handleUserWantsExample(step: WaterfallStepContext) {
    if (step.context.activity.text === 'Ja graag') {
      // tslint:disable:max-line-length
      await step.context.sendActivity(
        `Een voorbeeldvraag zou kunnen zijn:
        "Welke beslissingen werden in de Gemeenteraad genomen omtrent de vernieuwing van onze sportterreinen?"`,
      );
      // tslint:enable:max-line-length
      await step.context.sendActivity('Stel gerust je vraag.');
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
    const resolved: QueryResponse = await this.api.query(
      step.context.activity.text,
    );

    // ? break when no documents were found
    if (resolved.documents.length <= 0) {
      await step.endDialog();
      return await this.waitFor(step, async () => {
        await step.context.sendActivity(lang.getStringFor(lang.NO_DOCS_FOUND));
        await step.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      });
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
      const resolved: QueryResponse = await this.docsAccessor.get(step.context);
      await step.context
        .sendActivity(`Dit is de relevante info die ik heb gevonden in
de notulen van de Gemeenteraad. U kan de bestanden downloaden door op de knop te drukken.`);
      if (step.context.activity.channelId === ChannelId.Facebook) {
        const fbCardBuilder = new FacebookCardBuilder();
        resolved.documents.forEach((doc, i) =>
          fbCardBuilder.addCard(
            new FacebookCard(
              `Document ${i}`,
              `${take(doc.summary.split(' '), 50).join(' ')}...`,
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
            ),
          ),
        );
        await step.context.sendActivity(fbCardBuilder.getData());
      } else {
        const cards = map(resolved.documents, document => {
          return CardFactory.heroCard(
            `${take(document.content.split(' '), 5).join(' ')}...`,
            `${take(document.content.split(' '), 20).join(' ')}...`,
            [],
            [
              {
                type: 'messageBack',
                title: 'download document',
                value: JSON.stringify({
                  type: 'download',
                  value: {
                    uuid: document.resourceURI,
                  },
                }),
              },
            ],
          );
        });
        await step.context.sendActivity(MessageFactory.carousel(cards));
        // await step.prompt('confirm_prompt', {
        //   prompt: 'Hebt u gevonden wat u zocht?',
        //   retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
        //   choices: [ConfirmTypes.POSITIVE, 'Nee'],
        // });
      }
    } else if (answer === ConfirmTypes.NEGATIVE) {
      await step.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      await step.endDialog();
      await step.beginDialog(QuestionDialog.ID);
    } else if (answer === 'Medewerker') {
      return await this.handleEmployee(step.context);
    }
  }

  // private async handleFeedback(sctx: WaterfallStepContext) {
  //   const answer = sctx.context.activity.text;
  //   if (answer === FeedbackTypes.GOOD) {
  //     await sctx.context.sendActivity(lang.getStringFor(lang.THANK_FEEDBACK));
  //     await this.waitFor(sctx, async () => {
  //       await sctx.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
  //     });
  //     await sctx.endDialog();
  //   }
  //   if (answer === FeedbackTypes.BAD) {
  //     await sctx.prompt('confirm_prompt', {
  //       prompt: lang.getStringFor(lang.REAL_PERSON),
  //       retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
  //       choices: [lang.POSITIVE, lang.NEGATIVE],
  //     });
  //   }
  // }

  public async askFeedback(step: DialogContext): Promise<any> {
    await this.waitFor(step, async () => {
      await step.prompt(FeedbackPrompt.ID, {
        prompt: lang.getStringFor(lang.USEFULLNESS_QUERY),
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      });
    });
  }

  // private async handlePersonRequest(sctx: WaterfallStepContext) {
  //   if (
  //     sctx.context.activity.text.toUpperCase() === lang.POSITIVE.toUpperCase()
  //   ) {
  //     await sctx.context.sendActivity(lang.getStringFor(lang.EMAIL_SENT));
  //   } else {
  //     await sctx.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
  //   }
  //   await sctx.endDialog();
  // }

  public async sendFile(
    dialogContext: DialogContext,
    uuid: string,
  ): Promise<any> {
    const resourceUri: string = uuid;

    console.log('downloading');
    const ret = await this.api.downloadFile(resourceUri);

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
      return nodeFetch(`https://transfer.sh/`, {
        method: 'POST',
        body: fd,
        headers: [['Max-Downloads', '10'], ['Max-Days', '5']],
      })
        .then(async res => res.text())
        .then(async res => {
          console.log(res);

          return await dialogContext.context.sendActivity(`${res}`);
        });
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
    return await context.sendActivity(
      `Uw vragen worden doorgestuurd naar een medewerker van uw stad of gemeente.
      Prettige dag verder`,
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
}
