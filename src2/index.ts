import { MainDialog } from './dialogs';
import { NalantisBot } from './bot';
import * as path from 'path';
import * as restify from 'restify';
import { config } from 'dotenv';
import { ILogger } from './logger';
import {
  BotFrameworkAdapter,
  ConversationState,
  UserState,
  MemoryStorage,
} from 'botbuilder';
import { BlobStorage } from 'botbuilder-azure';

const ENV_FILE = path.join(__dirname, '..', '.env');
config({ path: ENV_FILE });

const logger = console as ILogger;

const server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
  logger.log(`\n${server.name} listening to ${server.url}`);
});

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
});

adapter.onTurnError = async (context, error) => {
  // This check writes out errors to console log .vs. app insights.
  console.error(`\n [onTurnError]: ${error}`);
  // Send a message to the user
  await context.sendActivity(`Oeps. Er ging iets mis, probeer opnieuw aub.!`);
  await context.sendActivity(
    `Indien er is mis blijft gaan, contacteer de admins van deze pagina.`,
  );
  await conversationState.delete(context);
  if (process.env.NODE_ENV === 'development') throw error;
};

let conversationState: ConversationState;
let userState: UserState;

const memoryStorage = new MemoryStorage();
conversationState = new ConversationState(memoryStorage);
userState = new UserState(memoryStorage);

if (process.env.NODE_ENV === 'production') {
  const blobStorage = new BlobStorage({
    containerName: process.env.BLOB_NAME,
    storageAccountOrConnectionString: process.env.BLOB_STRING,
  });
  conversationState = new ConversationState(blobStorage);
  userState = new UserState(blobStorage);
}

const dialog = new MainDialog(logger);
const myBot = new NalantisBot(conversationState, userState, dialog, logger);

server.post('/api/messages', (req, res) => {
  adapter.processActivity(req, res, async context => {
    await myBot.run(context);
  });
});
