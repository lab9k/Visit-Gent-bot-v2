import { Middleware, TurnContext, Activity } from 'botbuilder';

export class PayloadMiddleware implements Middleware {
  constructor() {}
  onTurn(context: TurnContext, next: () => Promise<void>): Promise<void> {
    console.log('payload middleware fired');
    context.activity.value;
    return next();
  }
}
