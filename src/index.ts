// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { config } from 'dotenv';
import * as path from 'path';
import * as restify from 'restify';
import { stringify } from 'flatted';

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import {
  BotFrameworkAdapter,
  ConversationState,
  MemoryStorage,
  UserState,
} from 'botbuilder';
import { BlobStorage } from 'botbuilder-azure';

// Import required bot configuration.
import { BotConfiguration, IEndpointService } from 'botframework-config';

import { CityBot } from './bot';
import IOptions from './models/IOptions';

// Read botFilePath and botFileSecret from .env file
// Note: Ensure you have a .env file and include botFilePath and botFileSecret.
const ENV_FILE = path.join(__dirname, '..', '.env');
const loadFromEnv = config({ path: ENV_FILE });

// Get the .bot file path
// See https://aka.ms/about-bot-file to learn more about .bot file its use and bot configuration.
// const BOT_FILE = path.join(__dirname, '..', process.env.botFilePath || '');
// let botConfig: BotConfiguration;
// try {
//   // read bot configuration from .bot file.
//   botConfig = BotConfiguration.loadSync(BOT_FILE, process.env.botFileSecret);
// } catch (err) {
//   console.error(
//     'Error reading bot file. Please ensure you have ' +
//       'valid botFilePath and botFileSecret set for your environment.',
//   );
//   console.error(
//     `The botFileSecret is available under appsettings for your Azure Bot Service bot.`,
//   );
//   console.error(
//     'If you are running this bot locally, consider ' +
//       'adding a .env file with botFilePath and botFileSecret.',
//   );
//   console.error(
//     'See https://aka.ms/about-bot-file to learn more' +
//       ' about .bot file its use and bot configuration.',
//   );
//   process.exit();
// }

// For local development configuration as defined in .bot file.
const DEV_ENVIRONMENT = 'development';

// Define name of the endpoint configuration section from the .bot file.
const BOT_CONFIGURATION = process.env.NODE_ENV || DEV_ENVIRONMENT;
// const BOT_CONFIGURATION = DEV_ENVIRONMENT;
// Get bot endpoint configuration by service name.
// Bot configuration as defined in .bot file.
// const endpointConfig = botConfig.findServiceByNameOrId(
//   BOT_CONFIGURATION,
// ) as IEndpointService;

// Create adapter.
// See https://aka.ms/about-bot-adapter to learn more about to learn more about bot adapter.
const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
});

// Catch-all for any unhandled errors in your bot.
adapter.onTurnError = async (context, error) => {
  // This check writes out errors to console log .vs. app insights.
  console.error(`\n [onTurnError]: ${error}`);
  console.log(error.stack);
  if (error.message === 'Facebook API error') {
    console.log(JSON.stringify(error['response'].body));
  }
  console.log(stringify(error));
  console.log(error.message);
  console.log(error.name);

  // Send a message to the user.
  await context.sendActivity(`Er ging iets mis! Probeer opnieuw aub`);
  // Clear out state
  await conversationState.delete(context);
};

// Define a state store for your bot.
// See https://aka.ms/about-bot-state to learn more about using MemoryStorage.
// A bot requires a state store to persist the dialog and user state between messages.
let conversationState: ConversationState;

// For local development, in-memory storage is used.
// CAUTION: The Memory Storage used here is for local bot debugging only. When the bot
// is restarted, anything stored in memory will be gone.
const memoryStorage = new MemoryStorage();
conversationState = new ConversationState(memoryStorage);
let userState = new UserState(memoryStorage);

// CAUTION: You must ensure your product environment has the NODE_ENV set
//          to use the Azure Blob storage or Azure Cosmos DB providers.
if (process.env.NODE_ENV === 'production') {
  const blobStorage = new BlobStorage({
    containerName: process.env.BLOB_NAME,
    storageAccountOrConnectionString: process.env.BLOB_STRING,
  });
  conversationState = new ConversationState(blobStorage);
  userState = new UserState(blobStorage);
}

// Create the Citybot.
const bot = new CityBot(conversationState, userState);

// Create HTTP server
const server = restify.createServer();
server.use(restify.plugins.queryParser());

// Listen for incoming activities and route them to your bot for processing.
server.post('/api/messages', (req, res) => {
  adapter.processActivity(req, res, async turnContext => {
    // Call bot.onTurn() to handle all incoming messages.

    let fbPageId = '';
    if (checkNested(req.body, 'channelData', 'recipient', 'id')) {
      const {
        body: {
          channelData: {
            recipient: { id },
          },
        },
      } = req;
      fbPageId = id;
    }
    const options = createOptions(fbPageId);
    await bot.onTurn(turnContext, options);
  });
});

server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log(`\n${server.name} listening to ${server.url}`);
  console.log(
    `\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator.`,
  );
  console.log(
    `\nTo talk to your bot, open citybot-gent.bot file in the Emulator.`,
  );
  console.log(`ENVIRONMENT:
  BOT_CONFIGURATION: ${BOT_CONFIGURATION}
  `);
});
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

function createOptions(pageId: string): IOptions {
  switch (pageId) {
    case '304854067077825':
      // citybotai page
      return {
        cardUrl:
          'https://stad.gent/sites/all/themes/contrib/gent_base/img/png/logo--part1.png',
        city: 'gent',
        citynet_login: process.env.CITYNET_LOGIN_GENT,
        citynet_password: process.env.CITYNET_PASSWORD_GENT,
      };
    case '417195555676339':
      // citybot ieper page
      return {
        cardUrl: 'http://www.economieieper.be/images/logo.png',
        city: 'ieper',
        citynet_login: process.env.CITYNET_LOGIN_IEPER,
        citynet_password: process.env.CITYNET_PASSWORD_IEPER,
      };
    case '':
      return {
        cardUrl: 'https://www.wingene.be/images/skin/logo.svg',
        city: 'wingene',
        citynet_login: process.env.CITYNET_LOGIN_WINGENE,
        citynet_password: process.env.CITYNET_PASSWORD_WINGENE,
      };
    default:
      return createOptions('304854067077825');
  }
}
