import {
  WaterfallDialog,
  WaterfallStepContext,
  DialogContext,
} from 'botbuilder-dialogs';
import {
  MessageFactory,
  ActivityTypes,
  CardFactory,
  UserState,
  StatePropertyAccessor,
} from 'botbuilder';
import CitynetApi from '../api/CitynetApi';
import { FeedbackTypes } from '../models/FeedbackTypes';
import { map, take } from 'lodash';
import FeedbackPrompt from './FeedbackPrompt';
import lang from '../lang';
import conceptMapping from '../lang/conceptMapping';

import QueryResponse from '../models/QueryResponse';
import CorrectConceptPrompt from './CorrectConceptPrompt';
import { ConfirmTypes } from '../models/ConfirmTypes';
import { readFileSync } from 'fs';
import { ChannelId } from '../models/ChannelIds';
import { FacebookCardBuilder, FacebookCard } from '../models/FacebookCard';
import nodeFetch from 'node-fetch';
import * as FormData from 'form-data';
import * as path from 'path';

export default class QuestionDialog extends WaterfallDialog {
  public static readonly ID = 'question_dialog';
  private readonly api: CitynetApi;
  private readonly docsAccessor: StatePropertyAccessor<QueryResponse>;
  constructor(userState: UserState) {
    super(QuestionDialog.ID);
    this.docsAccessor = userState.createProperty<QueryResponse>(
      'resolved_data',
    );
    this.addStep(this.handleQuestion.bind(this));
    this.addStep(this.handleConcept.bind(this));
    // this.addStep(this.handleFeedback.bind(this));
    // this.addStep(this.handlePersonRequest.bind(this));
    this.api = new CitynetApi();
  }

  private async handleQuestion(sctx: WaterfallStepContext) {
    // ? Send the documents
    await sctx.context.sendActivity(lang.getStringFor(lang.WAIT_WHILE_FETCH));

    await sctx.context.sendActivity({
      type: ActivityTypes.Typing,
    });
    const resolved: QueryResponse = await this.api.query(
      sctx.context.activity.text,
    );

    // ? break when no documents were found
    if (resolved.documents.length <= 0) {
      await sctx.endDialog();
      return await this.waitFor(sctx, async () => {
        await sctx.context.sendActivity(lang.getStringFor(lang.NO_DOCS_FOUND));
        await sctx.context.sendActivity(lang.getStringFor(lang.MORE_QUESTIONS));
      });
    }

    // ? save resolved documents to local storage
    await this.docsAccessor.set(sctx.context, resolved);

    // ? ask if concept is correct
    if (!resolved.conceptsOfQuery) {
      console.log('no concepts, skipping question');
      await sctx.next();
      return await this.handleConcept(sctx, true);
    }

    await this.waitFor(sctx, async () => {
      const formatConcepts = (conceptsArray: string[]) =>
        conceptsArray.map(concept => conceptMapping(concept)).join(', ');
      await sctx.prompt(CorrectConceptPrompt.ID, {
        prompt: lang
          .getStringFor(lang.ASK_CORRECT_CONCEPTS)
          .replace('%1%', formatConcepts(resolved.conceptsOfQuery || [])),
        retryPrompt: lang.getStringFor(lang.NOT_UNDERSTOOD_USE_BUTTONS),
      });
    });
  }

  private async handleConcept(sctx: WaterfallStepContext, skipped?: boolean) {
    const answer = sctx.context.activity.text;
    if (answer === ConfirmTypes.POSITIVE || skipped) {
      const resolved: QueryResponse = await this.docsAccessor.get(sctx.context);
      if (sctx.context.activity.channelId === ChannelId.Facebook) {
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
        await sctx.context.sendActivity(fbCardBuilder.getData());
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
        await sctx.context.sendActivity(MessageFactory.carousel(cards));
      }
    } else if (answer === ConfirmTypes.NEGATIVE) {
      await sctx.context.sendActivity(lang.getStringFor(lang.REPHRASE));
      await sctx.endDialog();
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

  public async askFeedback(sctx: DialogContext): Promise<any> {
    await this.waitFor(sctx, async () => {
      await sctx.prompt(FeedbackPrompt.ID, {
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

    // TODO: split fb and other channels
    if (dialogContext.context.activity.channelId === ChannelId.Facebook) {
      const filePath = path.resolve(
        __dirname,
        '..',
        '..',
        'downloads',
        ret.filename,
      );
      const fd = new FormData();
      fd.append('file', ret.buffer, {
        filename: ret.filename,
        contentType: ret.contentType,
      });
      return nodeFetch('http://file.io/?expires=1d', {
        method: 'POST',
        body: fd,
      })
        .then(async res => res.json())
        .then(async res => {
          await dialogContext.context.sendActivity(
            'Ik stuur je de downloadlink onmiddelijk door.',
          );
          return this.waitFor(dialogContext, async () => {
            return await dialogContext.context.sendActivity(`${res.link}`);
          });
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

  private async waitFor(sctx: DialogContext, cb: Function): Promise<any> {
    await sctx.context.sendActivity({
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
