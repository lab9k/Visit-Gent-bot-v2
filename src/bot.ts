import {
  ActivityTypes,
  TurnContext,
  ConversationState,
  UserState,
  StatePropertyAccessor,
} from 'botbuilder';
import { DialogSet, ChoicePrompt } from 'botbuilder-dialogs';
import QuestionDialog from './dialogs/QuestionDialog';
import FeedbackPrompt from './dialogs/FeedbackPrompt';
import lang from './lang';
import CorrectConceptPrompt from './dialogs/CorrectConceptPrompt';
import { ChannelId } from './models/ChannelIds';
import AirtableApi from './api/AirtableApi';
import { ConfirmTypes } from './models/ConfirmTypes';

const DIALOG_STATE_PROPERTY = 'dialog_state_prop';
export class CityBot {
  private readonly dialogState: StatePropertyAccessor<any>;
  private readonly dialogs: DialogSet;
  private readonly questionDialog: QuestionDialog;

  constructor(
    private conversationState: ConversationState,
    private userState: UserState,
  ) {
    this.dialogState = this.conversationState.createProperty(
      DIALOG_STATE_PROPERTY,
    );
    this.dialogs = new DialogSet(this.dialogState);

    // Add all dialogs
    this.questionDialog = new QuestionDialog(userState);
    [
      this.questionDialog,
      new FeedbackPrompt(),
      new ChoicePrompt('confirm_prompt'),
      new CorrectConceptPrompt(),
    ].forEach(dialog => {
      this.dialogs.add(dialog);
    });
  }

  async onTurn(turnContext: TurnContext) {
    const dialogContext = await this.dialogs.createContext(turnContext);
    if (
      checkNested(
        dialogContext.context.activity.channelData,
        'postback',
        'payload',
      ) &&
      dialogContext.context.activity.channelId === ChannelId.Facebook
    ) {
      if (
        dialogContext.context.activity.channelData.postback.payload ===
        'get_started'
      ) {
        // user clicked get_started
        await this.welcomeUser(turnContext);
        await dialogContext.beginDialog(QuestionDialog.ID);
      }
    }
    const options = {
      [ActivityTypes.Message]: async () => {
        await this.handleDialog(turnContext);
      },
      [ActivityTypes.ConversationUpdate]: async () => {
        if (
          dialogContext.context.activity.channelId !== ChannelId.Facebook &&
          turnContext.activity.membersAdded[0].name !== 'Bot'
        ) {
          await this.welcomeUser(turnContext);
          await dialogContext.beginDialog(QuestionDialog.ID);
        }
      },
      default: () => {
        console.log('Unknown activity type, not an error');
      },
    };
    await (options[turnContext.activity.type] || options.default)();
    await this.saveChanges(turnContext);
  }

  private async handleDialog(turnContext: TurnContext) {
    const dialogContext = await this.dialogs.createContext(turnContext);
    // ? continue the multistep dialog that's already begun
    // ? won't do anything if there is no running dialog
    switch (turnContext.activity.channelId) {
      case ChannelId.Facebook:
        if (
          checkNested(
            dialogContext.context.activity.channelData,
            'postback',
            'payload',
          ) &&
          dialogContext.context.activity.channelData.postback.payload !==
            'get_started'
        ) {
          // ? postback button clicked

          const payload = JSON.parse(
            dialogContext.context.activity.channelData.postback.payload,
          );

          if (payload.type === 'feedback') {
            await dialogContext.context.sendActivity(
              `Merci voor de feedback: ${payload.value.state} op document: ${
                payload.value.uuid
              } en sessionId: ${payload.value.sessionid}`,
            );
            const airtableAPI = new AirtableApi();
            airtableAPI.addLine({
              document: payload.value.uuid,
              feedback: payload.value.state,
              question: payload.value.query,
              sessionid: payload.value.sessionid,
            });
          } else if (payload.type === 'download') {
            await this.questionDialog.sendFile(
              dialogContext,
              payload.value.uuid,
            );
            await dialogContext.repromptDialog();
          } else if (dialogContext.context.activity.text) {
            await dialogContext.continueDialog();
          }
        } else {
          // ? message or quick reply
          await dialogContext.continueDialog();
        }
        await dialogContext.continueDialog();
        break;
      default:
        const payload = JSON.parse(
          dialogContext.context.activity.value || '{}',
        );
        if (payload.type === 'feedback') {
          await dialogContext.context.sendActivity(
            `Merci voor de feedback: ${payload.value.state} op document: ${
              payload.value.uuid
            } en sessionId: ${payload.value.sessionid}`,
          );
          const airtableApi = new AirtableApi();
          airtableApi.addLine({
            document: payload.value.uuid,
            feedback: payload.value.state,
            question: payload.value.query,
            sessionid: payload.value.sessionid,
          });
        } else if (payload.type === 'download') {
          await this.questionDialog.sendFile(dialogContext, payload.value.uuid);
          await dialogContext.repromptDialog();
        } else if (dialogContext.context.activity.text) {
          await dialogContext.continueDialog();
        }
        break;
    }
  }

  private async welcomeUser(turnContext: TurnContext) {
    // Do we have any new members added to the conversation?
    if (turnContext.activity.channelId !== ChannelId.Facebook) {
      if (turnContext.activity.membersAdded.length !== 0) {
        // Iterate over all new members added to the conversation
        for (const idx in turnContext.activity.membersAdded) {
          // Greet anyone that was not the target (recipient) of this message.
          // Since the bot is the recipient for events from the channel,
          // context.activity.membersAdded === context.activity.recipient.Id indicates the
          // bot was added to the conversation, and the opposite indicates this is a user.
          if (
            turnContext.activity.membersAdded[idx].id !==
            turnContext.activity.recipient.id
          ) {
            // Send a "this is what the bot does" message to this user.
            await turnContext.sendActivity(lang.getStringFor(lang.WELCOME));
            await turnContext.sendActivity(
              lang.getStringFor(lang.PRIVACY_INFO),
            );
          }
        }
      }
    } else {
      await turnContext.sendActivity(lang.getStringFor(lang.WELCOME));
      await turnContext.sendActivity(lang.getStringFor(lang.PRIVACY_INFO));
    }
  }
  private async saveChanges(tc: TurnContext) {
    await this.userState.saveChanges(tc);
    await this.conversationState.saveChanges(tc);
  }
}

function checkNested(obj: any, ...levels: string[]) {
  for (let i = 0; i < levels.length; i += 1) {
    if (!obj || !obj.hasOwnProperty(levels[i])) {
      return false;
    }
    // tslint:disable-next-line:no-parameter-reassignment
    obj = obj[levels[i]];
  }
  return true;
}
